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

export function getDownloadUrl({ version, platform, arch }) {
  const filename = `kosli_${version}_${mapOS(platform)}_${mapArch(arch)}`;
  const extension = platform === "win32" ? "zip" : "tar.gz";
  return `https://github.com/kosli-dev/cli/releases/download/v${version}/${filename}.${extension}`;
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

  // A full semver or any literal tag is used exactly as given, with no API call.
  if (spec.kind === "exact" || spec.kind === "literal") {
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
