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
- uses: kosli-dev/setup-cli-action@v1
```

A specific version of the `kosli` CLI can be installed:

```yaml
steps:
- name: setup-kosli-cli
  uses: kosli-dev/setup-cli-action@v1
  with:
    version:
      0.1.10
```

## Inputs

The actions supports the following inputs:

- `version`: The version of `kosli` to install, defaulting to `0.1.15`

## Environment variables

- KOSLI_API_TOKEN: set the Kosli API token.
- KOSLI_OWNER: set the Kosli Pipeline Owner.

## Example job

```yaml
jobs:
  example:
    runs-on: ubuntu-latest
    env:
      KOSLI_API_TOKEN: ${{ secrets.MY_MERKELY_API_TOKEN }}
      KOSLI_OWNER: my-org
    steps:
      - name: Setup kosli
        uses: kosli-dev/setup-cli-action@v1
      - name: declare pipeline
        run: |
          kosli pipeline declare --pipeline my-pipeline -t pull-request,artifact,test
```

## License

[MIT](LICENSE).
