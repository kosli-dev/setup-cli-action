const path = require("path");
const github = require("@actions/github");

// Map node arch to arch in download url
// arch in [arm, x32, x64...] (https://nodejs.org/api/os.html#os_os_arch)
// return value in [amd64, 386, arm]
function mapArch(arch) {
  const mappings = {
    x64: "amd64"
  };
  return mappings[arch] || arch;
}

// Map node os to os in download url
// os in [darwin, linux, win32...] (https://nodejs.org/api/os.html#os_os_platform)
// return value in [darwin, linux, windows]
function mapOS(os) {
  const mappings = {
    darwin: "darwin",
    win32: "windows",
    linux: "linux"
  };
  return mappings[os] || os;
}

function getDownloadUrl({ version, platform, arch }) {
  const filename = `kosli_${version}_${mapOS(platform)}_${mapArch(arch)}`;
  const extension = platform === "win32" ? "zip" : "tar.gz";
  return `https://github.com/kosli-dev/cli/releases/download/v${version}/${filename}.${extension}`;
}

async function resolveVersion(version, token, octokit) {
  if (version !== "latest") {
    return version;
  }
  const client = octokit || github.getOctokit(token);
  let release;
  try {
    release = await client.rest.repos.getLatestRelease({
      owner: "kosli-dev",
      repo: "cli"
    });
  } catch (e) {
    throw new Error(`failed to resolve latest Kosli CLI version from GitHub: ${e.message}`);
  }
  const tag = release.data.tag_name;
  return tag.startsWith("v") ? tag.slice(1) : tag;
}

module.exports = { getDownloadUrl, resolveVersion };
