import * as github from "@actions/github";

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

// Name of the release asset for a given version/platform/arch, e.g.
// "kosli_2.11.43_linux_amd64.tar.gz". This is also the filename used to look the
// asset up in the release's checksums.txt, so it is the single source of truth.
export function getAssetFilename({ version, platform, arch }) {
  const extension = platform === "win32" ? "zip" : "tar.gz";
  return `kosli_${version}_${mapOS(platform)}_${mapArch(arch)}.${extension}`;
}

export function getDownloadUrl({ version, platform, arch }) {
  const filename = getAssetFilename({ version, platform, arch });
  return `https://github.com/kosli-dev/cli/releases/download/v${version}/${filename}`;
}

// URL of the SHA-256 checksums file published alongside each release.
export function getChecksumsUrl(version) {
  return `https://github.com/kosli-dev/cli/releases/download/v${version}/kosli_${version}_checksums.txt`;
}

// Verify that `actualHex` matches the digest recorded for `assetFilename` in a
// goreleaser-style checksums file (lines of "<sha256>  <filename>"). Throws if the
// asset is not listed or the digest differs. Comparison is case-insensitive.
export function verifyChecksum(actualHex, checksumsText, assetFilename) {
  let expected = null;
  for (const line of checksumsText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const parts = trimmed.split(/\s+/);
    const name = parts[parts.length - 1];
    if (name === assetFilename) {
      expected = parts[0];
      break;
    }
  }
  if (expected === null) {
    throw new Error(`checksums file does not list an entry for "${assetFilename}"`);
  }
  if (expected.toLowerCase() !== actualHex.toLowerCase()) {
    throw new Error(
      `checksum mismatch for "${assetFilename}": expected ${expected.toLowerCase()}, got ${actualHex.toLowerCase()}`
    );
  }
}

// Classify the `version` input:
//   "latest"           -> { kind: "latest" }              resolve newest stable release
//   "2" / "v2"         -> { kind: "partial", major: 2 }   newest stable 2.x
//   "2.11" / "v2.11"   -> { kind: "partial", major: 2, minor: 11 }  newest stable 2.11.z
//   "2.11.43"          -> { kind: "exact" }               used verbatim, no API call
//   anything else      -> { kind: "literal" }             used verbatim (e.g. "Latest")
export function classifyVersion(version) {
  if (version === "latest") {
    return { kind: "latest" };
  }
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(version);
  if (!match) {
    return { kind: "literal" };
  }
  const [, major, minor, patch] = match;
  if (patch !== undefined) {
    return { kind: "exact" };
  }
  return {
    kind: "partial",
    major: Number(major),
    minor: minor === undefined ? undefined : Number(minor)
  };
}

function compareSemver(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return 0;
}

// Highest stable "X.Y.Z" within the given major (and optional minor), or null if
// none match. Drafts, pre-releases and non-semver tags are ignored. Comparison is
// numeric so 2.27.3 ranks above 2.9.0.
function highestStableRelease(releases, major, minor) {
  let best = null;
  for (const release of releases) {
    if (release.draft || release.prerelease) {
      continue;
    }
    const parsed = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(release.tag_name || "");
    if (!parsed) {
      continue;
    }
    const candidate = [Number(parsed[1]), Number(parsed[2]), Number(parsed[3])];
    if (candidate[0] !== major) {
      continue;
    }
    if (minor !== undefined && candidate[1] !== minor) {
      continue;
    }
    if (best === null || compareSemver(candidate, best) > 0) {
      best = candidate;
    }
  }
  return best === null ? null : best.join(".");
}

export async function resolveVersion(version, token, octokit) {
  const spec = classifyVersion(version);

  // A full semver is used as-is (no API call), but with any leading "v" stripped so
  // the resolved value is a bare "x.y.z" like the latest/partial paths produce.
  if (spec.kind === "exact") {
    return version.replace(/^v/, "");
  }

  // Any other literal tag (e.g. "Latest") is used exactly as given, no API call.
  if (spec.kind === "literal") {
    return version;
  }

  const client = octokit || github.getOctokit(token);

  if (spec.kind === "latest") {
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

  // spec.kind === "partial": newest stable release within the requested major
  // (and optional minor). Never selects a pre-release or a higher major.
  let releases;
  try {
    releases = await client.paginate(client.rest.repos.listReleases, {
      owner: "kosli-dev",
      repo: "cli",
      per_page: 100
    });
  } catch (e) {
    throw new Error(`failed to resolve Kosli CLI version "${version}" from GitHub: ${e.message}`);
  }

  const resolved = highestStableRelease(releases, spec.major, spec.minor);
  if (!resolved) {
    const target = spec.minor === undefined ? `${spec.major}.x` : `${spec.major}.${spec.minor}.x`;
    throw new Error(
      `no stable kosli-dev/cli release found matching version "${version}" (looked for ${target})`
    );
  }
  return resolved;
}
