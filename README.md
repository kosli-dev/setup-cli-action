# `setup-kosli-cli`

> Sets up the Kosli CLI for GitHub Actions runners

## About

This action sets up the [Kosli](https://kosli.com) [CLI](https://github.com/kosli-dev/cli), on GitHub's hosted Actions runners.

This action can be run on `ubuntu-latest`, `windows-latest`, and `macos-latest` GitHub Actions runners, 
and will install and expose a specified version of the `kosli` CLI on the runner environment.

## Usage

Setup the `kosli` CLI:

```yaml
steps:
- uses: kosli-dev/setup-cli-action@v2
```

A specific version of the `kosli` CLI can be installed:

```yaml
steps:
- name: setup-kosli-cli
  uses: kosli-dev/setup-cli-action@v2
  with:
    version:
      2.11.34
```

## Inputs

The actions supports the following inputs:

- `version`: The version of `kosli` to install, defaulting to `2.11.34`

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
        uses: kosli-dev/setup-cli-action@v2
        
      - name: Attest ECR image provenance
        run: 
          kosli attest artifact "${IMAGE_NAME}" --artifact-type=oci
```

## License

[MIT](LICENSE).
