const path = require("path");
const os = require("os");
const core = require("@actions/core");
const tc = require("@actions/tool-cache");
const { getDownloadUrl } = require("./download");

async function setup() {
  try {
    const version = core.getInput("version");
    const platform = os.platform();
    const arch = os.arch();
    const downloadUrl = getDownloadUrl({ version, platform, arch });
    console.log(`installing Kosli CLI from ${downloadUrl} ...`);

    const pathToTarball = await tc.downloadTool(downloadUrl);
    const pathToCLI = await tc.extractTar(pathToTarball);
    core.addPath(pathToCLI);
    console.log(`installed Kosli CLI to ${pathToCLI}!`);
  } catch (e) {
    core.setFailed(e);
  }
}

module.exports = setup;

if (require.main === module) {
  setup();
}
