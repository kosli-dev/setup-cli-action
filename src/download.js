const path = require("path");

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

module.exports = { getDownloadUrl };
