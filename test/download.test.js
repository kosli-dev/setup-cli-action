const test = require("ava");
const { getDownloadUrl } = require("../src/download");

const baseUrl = "https://github.com/kosli-dev/cli/releases/download/";
const testCases = [
  { version: "0.1.15", platform: "darwin", arch: "amd64", expected: "v0.1.15/kosli_0.1.15_darwin_amd64.tar.gz" },
  { version: "0.1.15", platform: "darwin", arch: "arm64", expected: "v0.1.15/kosli_0.1.15_darwin_arm64.tar.gz" },
  { version: "0.1.15", platform: "linux", arch: "amd64", expected: "v0.1.15/kosli_0.1.15_linux_amd64.tar.gz" },
  { version: "0.1.15", platform: "linux", arch: "x64", expected: "v0.1.15/kosli_0.1.15_linux_amd64.tar.gz" },
  { version: "0.1.15", platform: "linux", arch: "arm64", expected: "v0.1.15/kosli_0.1.15_linux_arm64.tar.gz" },
  { version: "0.1.15", platform: "win32", arch: "amd64", expected: "v0.1.15/kosli_0.1.15_windows_amd64.zip" },
  { version: "0.1.15", platform: "win32", arch: "arm64", expected: "v0.1.15/kosli_0.1.15_windows_arm64.zip" }
];
//https://github.com/kosli-dev/cli/releases/download/v0.1.15/kosli_0.1.15_linux_x64.tar.gz
testCases.forEach(element => {
  const { version, platform, arch, expected } = element;
  test(`version: ${version} platform: ${platform} arch: ${arch} should render ${expected}`, t => {
    const res = getDownloadUrl({ version, platform, arch });
    t.is(res, baseUrl + expected);
  });
});
