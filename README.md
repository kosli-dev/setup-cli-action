# `setup-kosli-cli`

> Sets up the Kosli CLI for GitHub Actions runners

## About

This action sets up the [Kosli](https://kosli.com) [CLI](https://github.com/kosli-dev/cli), on GitHub's hosted Actions runners.

This action can be run on `ubuntu-latest`, `windows-latest`, and `macos-latest` GitHub Actions runners,
and will install and expose a specified version of the `kosli` CLI on the runner environment.

## Usage

Setup the `kosli` CLI (installs the latest release by default):

```yaml
steps:
- uses: kosli-dev/setup-cli-action@v5
```

A specific version of the `kosli` CLI can be installed:

```yaml
steps:
- name: setup-kosli-cli
  uses: kosli-dev/setup-cli-action@v5
  with:
    version: 2.11.43
```

### Pin to a major or minor version

To track a major version and pick up every update within it without ever jumping to
the next (breaking) major, pass just the major number. `version: "2"` always installs
the newest stable `2.x` release, and never `3.0.0`:

```yaml
steps:
- name: setup-kosli-cli
  uses: kosli-dev/setup-cli-action@v5
  with:
    version: "2"   # newest stable 2.x, never 3.x
```

You can pin a minor line the same way. `version: "2.11"` installs the newest stable
`2.11.z` patch:

```yaml
steps:
- name: setup-kosli-cli
  uses: kosli-dev/setup-cli-action@v5
  with:
    version: "2.11"
```

> **Quote the version.** In YAML, `version: 2.10` is parsed as the number `2.1`, which
> is not what you mean. Always quote a major or minor pin: `version: "2"`, `version: "2.10"`.

To explicitly pin to the newest published release at runtime, pass `latest`:

```yaml
steps:
- name: setup-kosli-cli
  uses: kosli-dev/setup-cli-action@v5
  with:
    version: latest
```

## Automatically attest pushed Docker images

On Linux runners the action can attest Docker images to Kosli automatically, with no
explicit `kosli attest artifact` step. Set `attest-docker-artifact: true` and the action
installs shims for `docker`, `buildx`, and `docker-buildx` that shadow the real binaries
in subsequent steps. Whenever a later step pushes an image — `docker push`,
`docker build --push`, `docker buildx build --push`, or a standalone `buildx build --push`
— the shim runs

```
kosli attest artifact "<ref>" --artifact-type=oci --name "<name>"
```

for each pushed tag, after the push succeeds. `--artifact-type=oci` fingerprints the
image directly from the registry, so this works with buildx's default `docker-container`
driver, where the pushed image never enters the local image store.

```yaml
env:
  KOSLI_API_TOKEN: ${{ secrets.KOSLI_API_TOKEN }}
  KOSLI_ORG: my-org
  KOSLI_FLOW: my-flow
  KOSLI_TRAIL: ${{ github.sha }}

jobs:
  build-image:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - name: Setup kosli           # must run BEFORE the build/push step
        uses: kosli-dev/setup-cli-action@v5
        with:
          attest-docker-artifact: true

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: my-registry/my-image:${{ github.sha }}
      # no explicit attest step - the push is attested automatically
```

> **Ordering matters.** The shims are added to the `PATH` of *subsequent* steps, so this
> action must run before the step that builds or pushes.

By default the Kosli artifact `--name` is derived from each image ref (strip any digest,
take the last `/`-segment, strip the tag): `my-registry/my-image:1.2.3` → `my-image`.
That per-image default is what makes monorepos work — each image gets its own name. If
your Kosli flow template uses a different artifact name, set `artifact-name` (it applies
to every image pushed in the job, so it is intended for single-artifact repos).

The shim reads the usual `KOSLI_API_TOKEN` / `KOSLI_ORG` / `KOSLI_FLOW` / `KOSLI_TRAIL` /
`KOSLI_HOST` environment variables, and the CLI auto-detects `--commit`, `--build-url`,
etc. on GitHub Actions. `KOSLI_DRY_RUN` also flows through unchanged.

A failed attestation does not fail the push by default — it prints a warning and
continues. Set `fail-on-attest-error: true` to make it fail the step instead. A failed
`docker`/`buildx` command is never masked: its exit code is always propagated and nothing
is attested.

### Limitations

- Linux runners only; on other platforms the input is ignored with a warning.
- Only invocations that resolve the shimmed binaries via `PATH` are intercepted; tools
  that call docker/buildx by absolute path bypass the shims.
- `docker push --all-tags` is skipped (the pushed tag set is not knowable from the
  command line); a warning is printed.
- `attest-flags` is split on whitespace; flag values containing spaces are not supported.
- `docker buildx bake --push` and `docker compose push` are not intercepted.
- Shim and attestation output goes to stderr (so `$(docker push -q ...)` captures stay
  clean), and appears as plain log lines rather than GitHub annotations.

## Inputs

The action supports the following inputs:

- `version`: The version of `kosli` to install. Accepts:
  - a full semver, e.g. `2.11.43`, installed as-is;
  - a major pin, e.g. `"2"`, which resolves to the newest stable `2.x` release;
  - a major.minor pin, e.g. `"2.11"`, which resolves to the newest stable `2.11.z` release;
  - the alias `latest`, which resolves to the newest stable release of `kosli-dev/cli`.

  Major and minor pins resolve at runtime and never select a pre-release or a higher major.
  Quote partial versions (see the note above). Defaults to `latest`.
- `github-token`: Token used to authenticate the GitHub API calls that resolve `latest` or a
  major/minor pin. Defaults to `${{ github.token }}`; normally you do not need to set this.
- `attest-docker-artifact`: When `true` (Linux runners only), install the docker/buildx shims
  described above so images pushed by subsequent steps are attested automatically.
  Defaults to `false`.
- `artifact-name`: Kosli template artifact name used for every auto-attested image. Leave
  empty (the default) to derive the name from each image ref.
- `attest-flags`: Extra flags appended verbatim to every `kosli attest artifact` call made by
  the shim, e.g. `--annotate key=value`.
- `fail-on-attest-error`: When `true`, a failed auto-attestation fails the step that pushed
  the image. Defaults to `false` (warn and continue).

## Outputs

- `version`: The resolved `kosli` CLI version that was installed. When `version` is `latest` or a
  major/minor pin, this contains the concrete semver that was selected (e.g. `2.12.0`) and can be
  referenced by later steps via `steps.<id>.outputs.version`.

## Example job
See [Kosli CLI documentation](https://docs.kosli.com/)

```yaml
env:
  KOSLI_DRY_RUN: ${{ vars.KOSLI_DRY_RUN }}  # false
  KOSLI_API_TOKEN: ${{ secrets.KOSLI_API_TOKEN }}
  KOSLI_ORG: my-org
  KOSLI_FLOW: my-flow
  KOSLI_TRAIL: ${{ github.sha }}

jobs:
  build-image:
    runs-on: ubuntu-latest
    steps:
      - ...

      - name: Build and push Docker image to ECR
        id: build
        uses: docker/build-push-action@v5
        with:
          push: true
          ...

      - name: Setup kosli
        uses: kosli-dev/setup-cli-action@v5

      - name: Attest ECR image provenance
        run:
          kosli attest artifact "${IMAGE_NAME}" --artifact-type=oci
```

## License

[MIT](LICENSE).
