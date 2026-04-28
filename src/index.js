import os from "os";
import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import { getDownloadUrl, resolveVersion } from "./download.js";

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

setup();
