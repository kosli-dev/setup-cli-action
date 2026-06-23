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

// --- major / minor version pinning ---

function fakeReleasesOctokit(releases) {
  return {
    // Real octokit.paginate(endpoint, params) walks every page; the fake just
    // returns the canned list regardless of the endpoint passed in.
    paginate: async () => releases,
    rest: {
      repos: {
        listReleases: () => ({ data: releases })
      }
    }
  };
}

const releaseFixture = [
  { tag_name: "v10.0.0", draft: false, prerelease: false },
  { tag_name: "v3.0.0", draft: false, prerelease: false },
  { tag_name: "v2.28.0-rc.1", draft: false, prerelease: true },
  { tag_name: "v2.30.0", draft: true, prerelease: false },
  { tag_name: "v2.27.0", draft: false, prerelease: false },
  { tag_name: "v2.27.3", draft: false, prerelease: false },
  { tag_name: "v2.26.5", draft: false, prerelease: false },
  { tag_name: "v2.9.0", draft: false, prerelease: false },
  { tag_name: "v1.40.0", draft: false, prerelease: false },
  { tag_name: "nightly", draft: false, prerelease: false }
];

test("resolveVersion resolves a bare major to the newest stable release in that major", async t => {
  const result = await resolveVersion("2", "", fakeReleasesOctokit(releaseFixture));
  t.is(result, "2.27.3");
});

test("resolveVersion accepts a leading v on a major pin", async t => {
  const result = await resolveVersion("v2", "", fakeReleasesOctokit(releaseFixture));
  t.is(result, "2.27.3");
});

test("resolveVersion never resolves a major pin to a higher major", async t => {
  // The fixture has higher majors (v3.0.0 and v10.0.0); a "2" pin must stay on
  // major 2, never the highest available overall.
  const result = await resolveVersion("2", "", fakeReleasesOctokit(releaseFixture));
  t.is(result.split(".")[0], "2");
});

test("resolveVersion excludes pre-releases and drafts from a major pin", async t => {
  // 2.28.0-rc.1 (prerelease) and 2.30.0 (draft) must be ignored, so 2.27.3 wins.
  const result = await resolveVersion("2", "", fakeReleasesOctokit(releaseFixture));
  t.is(result, "2.27.3");
});

test("resolveVersion orders a major pin numerically, not lexically", async t => {
  // A lexical sort would rank "2.9.0" above "2.27.3"; numeric ordering must not.
  const octokit = fakeReleasesOctokit([
    { tag_name: "v2.9.0", draft: false, prerelease: false },
    { tag_name: "v2.27.3", draft: false, prerelease: false }
  ]);
  t.is(await resolveVersion("2", "", octokit), "2.27.3");
});

test("resolveVersion resolves a major.minor pin to the newest patch in that line", async t => {
  const result = await resolveVersion("2.27", "", fakeReleasesOctokit(releaseFixture));
  t.is(result, "2.27.3");
});

test("resolveVersion resolves a major.minor pin independently of other minors", async t => {
  const result = await resolveVersion("2.26", "", fakeReleasesOctokit(releaseFixture));
  t.is(result, "2.26.5");
});

test("resolveVersion throws a clear error when no stable release matches a partial", async t => {
  await t.throwsAsync(resolveVersion("4", "", fakeReleasesOctokit(releaseFixture)), {
    message: /no stable kosli-dev\/cli release found matching version "4".*4\.x/
  });
});

test("resolveVersion surfaces a descriptive error when listing releases fails", async t => {
  const octokit = {
    paginate: async () => {
      throw new Error("HTTP 403 rate limit exceeded");
    },
    rest: { repos: { listReleases: () => ({ data: [] }) } }
  };
  await t.throwsAsync(resolveVersion("2", "", octokit), {
    message: /failed to resolve Kosli CLI version "2".*rate limit/
  });
});
