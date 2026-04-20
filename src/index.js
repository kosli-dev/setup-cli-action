const path = require("path");
const os = require("os");
const core = require("@actions/core");
const tc = require("@actions/tool-cache");
const { getDownloadUrl, resolveVersion } = require("./download");

async function setup() {
  try {
    const version = core.getInput("version");
    const token = core.getInput("github-token");
    const platform = os.platform();
    const arch = os.arch();

    const resolvedVersion = await resolveVersion(version, token);

    let pathToCLI = tc.find("kosli", resolvedVersion);
    if (!pathToCLI) {
      const downloadUrl = getDownloadUrl({ version: resolvedVersion, platform, arch });
      console.log(`installing Kosli CLI from ${downloadUrl} ...`);
      const pathToTarball = await tc.downloadTool(downloadUrl);
      const extracted = await tc.extractTar(pathToTarball);
      pathToCLI = await tc.cacheDir(extracted, "kosli", resolvedVersion);
    } else {
      console.log(`using cached Kosli CLI v${resolvedVersion} from ${pathToCLI}`);
    }

    core.addPath(pathToCLI);
    core.setOutput("version", resolvedVersion);
    console.log(`installed Kosli CLI v${resolvedVersion} to ${pathToCLI}`);
  } catch (e) {
    core.setFailed(e);
  }
}

module.exports = setup;

if (require.main === module) {
  setup();
}
