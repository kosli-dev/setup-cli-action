// The docker/buildx shim installed by wrapDocker.js. The bash source is embedded
// as a string constant (not a .sh asset file) so `ncc` bundles it into dist/ by
// definition — asset relocation for files read at runtime is unreliable and would
// break only in released tags.
//
// Editing rules: this is a JS template literal, so every bash \${...} parameter
// expansion must be written with a backslash before the $; plain $VAR, "$@",
// $(...), $# and $1 need no escaping; never use backticks (use $(...)).
export const SHIM_SOURCE = `#!/usr/bin/env bash
# Kosli docker shim. Installed by kosli-dev/setup-cli-action when the
# attest-docker-artifact input is enabled. Runs the real binary, then attests
# any image refs pushed by the invocation via \`kosli attest artifact\`.
# No set -e / set -u: the real binary's exit code must be propagated explicitly
# and unset config must degrade gracefully.

prog=$(basename "$0")
case "$prog" in
  docker)        real="$KOSLI_SHIM_REAL_DOCKER" ;;
  buildx)        real="$KOSLI_SHIM_REAL_BUILDX" ;;
  docker-buildx) real="$KOSLI_SHIM_REAL_DOCKER_BUILDX" ;;
  *)
    echo "kosli-shim: unexpected invocation name '$prog'" >&2
    exit 127
    ;;
esac
if [ -z "$real" ] || [ ! -x "$real" ]; then
  echo "kosli-shim: real binary for '$prog' is not configured" >&2
  exit 127
fi

"$real" "$@"
rc=$?
if [ "$rc" -ne 0 ]; then
  exit "$rc"
fi

# ---- collect pushed image refs from the original args ----

refs=""

# Image refs never contain whitespace, so a space-separated list with a linear
# scan is a safe dedupe on bash 3.2 (macOS has no associative arrays).
add_ref() {
  local r
  for r in $refs; do
    if [ "$r" = "$1" ]; then
      return 0
    fi
  done
  refs="$refs $1"
}

# localhost:5000/ns/app:1.2 -> app. Order matters: strip any @digest, take the
# last /-segment (keeps registry ports with the registry), then strip the :tag.
derive_name() {
  local n
  n="$1"
  n=\${n%%@*}
  n=\${n##*/}
  n=\${n%%:*}
  printf '%s' "$n"
}

# Resolve the effective subcommand, skipping global flags. Value-taking flags
# use a guarded double shift: a bare \`shift 2\` with $# = 1 fails WITHOUT
# shifting, which would loop forever.
sub=""
if [ "$prog" = "docker" ]; then
  while [ $# -gt 0 ]; do
    case "$1" in
      --config|--context|-c|-H|--host|-l|--log-level|--tlscacert|--tlscert|--tlskey)
        shift
        if [ $# -gt 0 ]; then shift; fi
        ;;
      -*) shift ;;
      *) sub="$1"; shift; break ;;
    esac
  done
  # docker image push/build and docker buildx build: step down one level.
  if [ "$sub" = "image" ] && [ $# -gt 0 ]; then
    sub="$1"; shift
  fi
  if [ "$sub" = "buildx" ] && [ $# -gt 0 ]; then
    sub="$1"; shift
  fi
else
  # Invoked as buildx / docker-buildx: first non-flag arg is the subcommand.
  while [ $# -gt 0 ]; do
    case "$1" in
      -*) shift ;;
      *) sub="$1"; shift; break ;;
    esac
  done
fi

case "$sub" in
  push)
    ref=""
    all_tags=""
    while [ $# -gt 0 ]; do
      case "$1" in
        -a|--all-tags) all_tags=1; shift ;;
        --platform)
          shift
          if [ $# -gt 0 ]; then shift; fi
          ;;
        -*) shift ;;
        *) ref="$1"; break ;;
      esac
    done
    if [ -n "$all_tags" ]; then
      echo "kosli-shim: 'push --all-tags' pushes an unknown set of tags; skipping attestation" >&2
    elif [ -n "$ref" ]; then
      add_ref "$ref"
    fi
    ;;
  build)
    pushed=""
    tags=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --push) pushed=1; shift ;;
        -t|--tag)
          shift
          if [ $# -gt 0 ]; then
            tags="$tags $1"
            shift
          fi
          ;;
        --tag=*|-t=*)
          tags="$tags \${1#*=}"
          shift
          ;;
        -o|--output)
          # --push is shorthand for --output type=registry; catch the long form.
          shift
          if [ $# -gt 0 ]; then
            case "$1" in
              *push=true*|*type=registry*) pushed=1 ;;
            esac
            shift
          fi
          ;;
        --output=*|-o=*)
          case "\${1#*=}" in
            *push=true*|*type=registry*) pushed=1 ;;
          esac
          shift
          ;;
        *) shift ;;
      esac
    done
    if [ -n "$pushed" ]; then
      for t in $tags; do
        add_ref "$t"
      done
    fi
    ;;
esac

if [ -z "$refs" ]; then
  exit 0
fi

# ---- attest each pushed ref ----
# Everything (including kosli's stdout) goes to stderr so command substitutions
# like digest=$(docker push -q ...) in user scripts stay clean.

for ref in $refs; do
  name="$KOSLI_SHIM_ARTIFACT_NAME"
  if [ -z "$name" ]; then
    name=$(derive_name "$ref")
  fi
  echo "kosli-shim: attesting $ref as '$name'" >&2
  # KOSLI_SHIM_ATTEST_FLAGS is deliberately unquoted: it is a whitespace-
  # separated list of extra flags (values containing spaces are unsupported).
  if "$KOSLI_SHIM_KOSLI" attest artifact "$ref" --artifact-type=oci --name "$name" $KOSLI_SHIM_ATTEST_FLAGS 1>&2; then
    echo "kosli-shim: attested $ref" >&2
  else
    if [ "$KOSLI_SHIM_FAIL_ON_ERROR" = "true" ]; then
      echo "kosli-shim: attestation failed for $ref" >&2
      exit 1
    fi
    echo "kosli-shim: WARNING: attestation failed for $ref (continuing)" >&2
  fi
done

exit 0
`;
