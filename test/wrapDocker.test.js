import test from "ava";
import fs from "fs";
import os from "os";
import path from "path";
import { buildShimEnv, installDockerShims, SHIM_PROGRAMS } from "../src/wrapDocker.js";
import { SHIM_SOURCE } from "../src/shim.js";

const config = {
  kosliBin: "/opt/kosli/kosli",
  artifactName: "",
  attestFlags: "",
  failOnAttestError: false
};

function fakeActions() {
  const calls = { warnings: [], infos: [], exported: {}, paths: [] };
  return {
    calls,
    warning: message => calls.warnings.push(message),
    info: message => calls.infos.push(message),
    exportVariable: (name, value) => {
      calls.exported[name] = value;
    },
    addPath: p => calls.paths.push(p)
  };
}

// which(name, false) resolves "" when the tool is not found, like @actions/io.
function fakeWhich(available) {
  return async name => available[name] || "";
}

function makeDeps(t, { which = {}, platform = "linux" } = {}) {
  const runnerTemp = fs.mkdtempSync(path.join(os.tmpdir(), "kosli-wrap-test-"));
  t.teardown(() => fs.rmSync(runnerTemp, { recursive: true, force: true }));
  const actions = fakeActions();
  return {
    actions,
    deps: {
      which: fakeWhich(which),
      platform,
      env: { RUNNER_TEMP: runnerTemp },
      actions
    }
  };
}

test("buildShimEnv maps config and real paths to shim env vars", t => {
  const env = buildShimEnv({
    realPaths: { docker: "/usr/bin/docker", "docker-buildx": "/usr/libexec/docker-buildx" },
    kosliBin: "/opt/kosli/kosli",
    artifactName: "my-artifact",
    attestFlags: "--annotate a=b",
    failOnAttestError: true
  });
  t.deepEqual(env, {
    KOSLI_SHIM_KOSLI: "/opt/kosli/kosli",
    KOSLI_SHIM_ARTIFACT_NAME: "my-artifact",
    KOSLI_SHIM_ATTEST_FLAGS: "--annotate a=b",
    KOSLI_SHIM_FAIL_ON_ERROR: "true",
    KOSLI_SHIM_REAL_DOCKER: "/usr/bin/docker",
    KOSLI_SHIM_REAL_BUILDX: "",
    KOSLI_SHIM_REAL_DOCKER_BUILDX: "/usr/libexec/docker-buildx"
  });
});

test("installDockerShims writes an executable shim per found program", async t => {
  const { actions, deps } = makeDeps(t, {
    which: { docker: "/usr/bin/docker", buildx: "/usr/local/bin/buildx" }
  });
  await installDockerShims(config, deps);

  t.is(actions.calls.paths.length, 1);
  const shimDir = actions.calls.paths[0];
  t.regex(path.basename(shimDir), /^kosli-docker-shim-/);
  for (const program of ["docker", "buildx"]) {
    const shim = path.join(shimDir, program);
    t.is(fs.readFileSync(shim, "utf8"), SHIM_SOURCE);
    if (process.platform !== "win32") {
      t.is(fs.statSync(shim).mode & 0o777, 0o755);
    }
  }
  t.false(fs.existsSync(path.join(shimDir, "docker-buildx")));
});

test("installDockerShims exports the shim config env vars", async t => {
  const { actions, deps } = makeDeps(t, { which: { docker: "/usr/bin/docker" } });
  await installDockerShims(
    { kosliBin: "/opt/kosli/kosli", artifactName: "app", attestFlags: "-x", failOnAttestError: true },
    deps
  );
  t.deepEqual(actions.calls.exported, {
    KOSLI_SHIM_KOSLI: "/opt/kosli/kosli",
    KOSLI_SHIM_ARTIFACT_NAME: "app",
    KOSLI_SHIM_ATTEST_FLAGS: "-x",
    KOSLI_SHIM_FAIL_ON_ERROR: "true",
    KOSLI_SHIM_REAL_DOCKER: "/usr/bin/docker",
    KOSLI_SHIM_REAL_BUILDX: "",
    KOSLI_SHIM_REAL_DOCKER_BUILDX: ""
  });
});

test("installDockerShims is a warning no-op on non-Linux platforms", async t => {
  const { actions, deps } = makeDeps(t, { which: { docker: "/usr/bin/docker" }, platform: "darwin" });
  await installDockerShims(config, deps);
  t.is(actions.calls.warnings.length, 1);
  t.regex(actions.calls.warnings[0], /only supported on Linux/);
  t.deepEqual(actions.calls.paths, []);
  t.deepEqual(actions.calls.exported, {});
});

test("installDockerShims warns and no-ops when no programs are found", async t => {
  const { actions, deps } = makeDeps(t, { which: {} });
  await installDockerShims(config, deps);
  t.is(actions.calls.warnings.length, 1);
  t.regex(actions.calls.warnings[0], /none of docker\/buildx\/docker-buildx were found/);
  t.deepEqual(actions.calls.paths, []);
  t.deepEqual(actions.calls.exported, {});
});

test("SHIM_PROGRAMS covers docker, buildx and the buildx plugin", t => {
  t.deepEqual(SHIM_PROGRAMS, ["docker", "buildx", "docker-buildx"]);
});
