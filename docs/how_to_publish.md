To publish a new version of Github Action follow the next steps:

1. Make your changes and push them to origin and make sure that CI pipeline passes.
2. Create a new tag with the next version number. For example, if the current version is 1.0.0, then the next version will be 1.0.1. If it is a breaking change, then the next version will be 2.0.0. Pipelines will automatically set a custom version that only has major version. For example, v1 would be pointing to the latest v1.x.x version.
3. If necessary, update the README.md file.
4. Push the tag to origin. e.g. git push origin {tag_name}
5. Go to the [releases page on GitHub UI](https://github.com/kosli-dev/setup-cli-action/releases)
6. Click on "Draft a new release" button.
7. Choose the tag that you just pushed.
8. Set release title to the same tag name.
9. [optional] Provide description for the release.
10. Click on "Publish release" button.