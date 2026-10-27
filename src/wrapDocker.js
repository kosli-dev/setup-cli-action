import fs from "fs";
import os from "os";
import path from "path";
import * as core from "@actions/core";
import * as io from "@actions/io";
import { SHIM_SOURCE } from "./shim.js";

// Every entrypoint a workflow step can push an image through: the docker CLI
// (which also fronts `docker buildx build`), the standalone buildx binary, and
// the buildx CLI plugin invoked directly.
export const SHIM_PROGRAMS = ["docker", "buildx", "docker-buildx"];

// Map the shim config to the env vars the shim script reads. The KOSLI_SHIM_
// prefix cannot collide with the CLI's own KOSLI_<flag> env binding.
export function buildShimEnv({ realPaths, kosliBin, artifactName, attestFlags, failOnAttestError }) {
  const env = {
    KOSLI_SHIM_KOSLI: kosliBin,
    KOSLI_SHIM_ARTIFACT_NAME: artifactName,
    KOSLI_SHIM_ATTEST_FLAGS: attestFlags,
    KOSLI_SHIM_FAIL_ON_ERROR: failOnAttestError ? "true" : "false"
  };
  for (const program of SHIM_PROGRAMS) {
    env[`KOSLI_SHIM_REAL_${program.toUpperCase().replace(/-/g, "_")}`] = realPaths[program] || "";
  }
  return env;
}

// Install shims that shadow docker/buildx on the PATH of subsequent steps, so
// any image pushed later in the job is attested to Kosli automatically. Never
// throws: a broken wrap must not fail the CLI install. Deps are injectable for
// tests, in the style of resolveVersion(version, token, octokit).
export async function installDockerShims(config, deps = {}) {
  const {
    which = io.which,
    platform = os.platform(),
    env = process.env,
    actions = core
  } = deps;

  if (platform !== "linux") {
    actions.warning("attest-docker-artifact is only supported on Linux runners; skipping docker shims");
    return;
  }

  const realPaths = {};
  for (const program of SHIM_PROGRAMS) {
    const found = await which(program, false);
    if (found) {
      realPaths[program] = found;
      actions.info(`shimming ${program} (real binary: ${found})`);
    }
  }
  const foundPrograms = Object.keys(realPaths);
  if (foundPrograms.length === 0) {
    actions.warning(
      "attest-docker-artifact is enabled but none of docker/buildx/docker-buildx were found on PATH; skipping docker shims"
    );
    return;
  }

  // The shim dispatches on basename($0), so it is written once per program name.
  const shimDir = fs.mkdtempSync(path.join(env.RUNNER_TEMP || os.tmpdir(), "kosli-docker-shim-"));
  for (const program of foundPrograms) {
    fs.writeFileSync(path.join(shimDir, program), SHIM_SOURCE, { mode: 0o755 });
  }

  const shimEnv = buildShimEnv({ realPaths, ...config });
  for (const [name, value] of Object.entries(shimEnv)) {
    actions.exportVariable(name, value);
  }
  actions.addPath(shimDir);
  actions.info(`docker shims installed to ${shimDir}; images pushed in subsequent steps will be attested to Kosli`);
}
