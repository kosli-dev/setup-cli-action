import test from "ava";
import { getDownloadUrl, resolveVersion } from "../src/download.js";

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

function fakeOctokit(response) {
  return {
    rest: {
      repos: {
        getLatestRelease: async ({ owner, repo }) => {
          if (typeof response === "function") {
            return response({ owner, repo });
          }
          return response;
        }
      }
    }
  };
}

test("resolveVersion passes through a concrete semver unchanged", async t => {
  const result = await resolveVersion("2.11.43", "token-unused");
  t.is(result, "2.11.43");
});

test("resolveVersion with 'latest' strips the leading v from the release tag", async t => {
  const octokit = fakeOctokit({ data: { tag_name: "v2.12.0" } });
  const result = await resolveVersion("latest", "", octokit);
  t.is(result, "2.12.0");
});

test("resolveVersion with 'latest' returns the tag unchanged if there is no leading v", async t => {
  const octokit = fakeOctokit({ data: { tag_name: "2.12.0" } });
  const result = await resolveVersion("latest", "", octokit);
  t.is(result, "2.12.0");
});

test("resolveVersion with 'latest' requests the kosli-dev/cli repo", async t => {
  let captured;
  const octokit = fakeOctokit(args => {
    captured = args;
    return { data: { tag_name: "v9.9.9" } };
  });
  await resolveVersion("latest", "", octokit);
  t.deepEqual(captured, { owner: "kosli-dev", repo: "cli" });
});

test("resolveVersion surfaces a descriptive error when the API call fails", async t => {
  const octokit = {
    rest: {
      repos: {
        getLatestRelease: async () => {
          throw new Error("HTTP 403 rate limit exceeded");
        }
      }
    }
  };
  await t.throwsAsync(resolveVersion("latest", "", octokit), {
    message: /failed to resolve latest Kosli CLI version.*rate limit/
  });
});

test("resolveVersion treats 'Latest' (mixed case) as a literal tag, not an alias", async t => {
  const result = await resolveVersion("Latest", "token-unused");
  t.is(result, "Latest");
});
