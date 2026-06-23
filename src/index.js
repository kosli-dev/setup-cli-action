import os from "os";
import crypto from "crypto";
import fs from "fs";
import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import { getAssetFilename, getChecksumsUrl, getDownloadUrl, resolveVersion, verifyChecksum } from "./download.js";
import { withRetries } from "./retry.js";

async function setup() {
  try {
    const version = core.getInput("version");
    const token = core.getInput("github-token");
    const platform = os.platform();
    const arch = os.arch();

    const resolvedVersion = await withRetries(
      () => resolveVersion(version, token),
      { onRetry: logRetry(`resolving Kosli CLI version "${version}"`) }
    );

    let pathToCLI = tc.find("kosli", resolvedVersion);
    if (!pathToCLI) {
      const downloadUrl = getDownloadUrl({ version: resolvedVersion, platform, arch });
      console.log(`installing Kosli CLI from ${downloadUrl} ...`);
      const pathToTarball = await withRetries(
        () => tc.downloadTool(downloadUrl),
        { onRetry: logRetry("downloading Kosli CLI") }
      );
      await verifyDownload({ pathToTarball, version: resolvedVersion, platform, arch });
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

// Verify the downloaded asset against the release's SHA-256 checksums file. A
// mismatch (or the asset missing from the file) throws and fails the action. If the
// release published no checksums file at all (e.g. very old versions), we warn and
// continue rather than break the install.
async function verifyDownload({ pathToTarball, version, platform, arch }) {
  const checksumsUrl = getChecksumsUrl(version);
  let checksumsPath;
  try {
    checksumsPath = await withRetries(
      () => tc.downloadTool(checksumsUrl),
      { onRetry: logRetry("downloading Kosli CLI checksums") }
    );
  } catch (e) {
    if (e.httpStatusCode === 404) {
      core.warning(
        `no checksums file published for Kosli CLI v${version}; skipping checksum verification`
      );
      return;
    }
    throw e;
  }

  const assetFilename = getAssetFilename({ version, platform, arch });
  const actualHex = crypto.createHash("sha256").update(fs.readFileSync(pathToTarball)).digest("hex");
  const checksumsText = fs.readFileSync(checksumsPath, "utf8");
  verifyChecksum(actualHex, checksumsText, assetFilename);
  console.log(`verified Kosli CLI ${assetFilename} checksum`);
}

function logRetry(label) {
  return ({ attempt, retries, delayMs, error }) => {
    core.warning(
      `${label} failed (attempt ${attempt}/${retries}): ${error.message}. Retrying in ${delayMs}ms.`
    );
  };
}

setup();
