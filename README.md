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
