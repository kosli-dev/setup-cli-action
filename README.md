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
- uses: kosli-dev/setup-cli-action@v3
```

A specific version of the `kosli` CLI can be installed:

```yaml
steps:
- name: setup-kosli-cli
  uses: kosli-dev/setup-cli-action@v3
  with:
    version: 2.11.43
```

To explicitly pin to the newest published release at runtime, pass `latest`:

```yaml
steps:
- name: setup-kosli-cli
  uses: kosli-dev/setup-cli-action@v3
  with:
    version: latest
```

## Inputs

The action supports the following inputs:

- `version`: The version of `kosli` to install. Accepts a semver (e.g. `2.11.43`) or the alias `latest`, which resolves to the newest GitHub release of `kosli-dev/cli` at runtime. Defaults to `latest`.
- `github-token`: Token used to authenticate the GitHub API call that resolves `latest`. Defaults to `${{ github.token }}`; normally you do not need to set this.

## Outputs

- `version`: The resolved `kosli` CLI version that was installed. When `version: latest` is used, this will contain the concrete semver (e.g. `2.12.0`) and can be referenced by later steps via `steps.<id>.outputs.version`.

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
        uses: kosli-dev/setup-cli-action@v3

      - name: Attest ECR image provenance
        run:
          kosli attest artifact "${IMAGE_NAME}" --artifact-type=oci
```

## License

[MIT](LICENSE).
