import test from "ava";
import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { SHIM_SOURCE } from "../src/shim.js";

// The shim only ever installs on Linux runners; macOS CI additionally validates
// bash-3.2 compatibility. Git Bash path translation makes these tests more
// trouble than they are worth on Windows.
const shimTest = process.platform === "win32" ? test.skip : test;

// Async equivalent of spawnSync: resolves with { status, stdout, stderr } so
// tests don't block the AVA worker's event loop and can run concurrently.
function execShim(file, args, env) {
  return new Promise(resolve => {
    execFile(file, args, { encoding: "utf8", env }, (error, stdout, stderr) => {
      const status = error ? (typeof error.code === "number" ? error.code : 1) : 0;
      resolve({ status, stdout, stderr });
    });
  });
}

// Writes the shim plus stub "real docker" and "kosli" scripts into a temp dir.
// Each stub appends its argv (one arg per line, then an --end-- marker) to a log
// file, so tests can assert on exactly what the shim invoked.
function makeHarness(t, options = {}) {
  const {
    prog = "docker",
    realExit = 0,
    kosliExit = 0,
    artifactName = "",
    attestFlags = "",
    failOnError = "false"
  } = options;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kosli-shim-test-"));
  t.teardown(() => fs.rmSync(dir, { recursive: true, force: true }));

  const realLog = path.join(dir, "real.log");
  const kosliLog = path.join(dir, "kosli.log");

  const writeStub = (name, log, exitCode, stdoutLine) => {
    const stubPath = path.join(dir, name);
    const lines = [
      "#!/usr/bin/env bash",
      `printf '%s\\n' "$@" >> "${log}"`,
      `printf -- '--end--\\n' >> "${log}"`
    ];
    if (stdoutLine) {
      lines.push(`echo "${stdoutLine}"`);
    }
    lines.push(`exit ${exitCode}`, "");
    fs.writeFileSync(stubPath, lines.join("\n"), { mode: 0o755 });
    return stubPath;
  };

  const realBinary = writeStub("real-binary", realLog, realExit, "real-stdout");
  const kosliBinary = writeStub("kosli-stub", kosliLog, kosliExit, "");

  // The shim dispatches on basename($0), so its filename must be the program name.
  const shimPath = path.join(dir, prog);
  fs.writeFileSync(shimPath, SHIM_SOURCE, { mode: 0o755 });

  const env = {
    ...process.env,
    KOSLI_SHIM_REAL_DOCKER: realBinary,
    KOSLI_SHIM_REAL_BUILDX: realBinary,
    KOSLI_SHIM_REAL_DOCKER_BUILDX: realBinary,
    KOSLI_SHIM_KOSLI: kosliBinary,
    KOSLI_SHIM_ARTIFACT_NAME: artifactName,
    KOSLI_SHIM_ATTEST_FLAGS: attestFlags,
    KOSLI_SHIM_FAIL_ON_ERROR: failOnError
  };

  const readCalls = log => {
    if (!fs.existsSync(log)) {
      return [];
    }
    return fs
      .readFileSync(log, "utf8")
      .split("--end--\n")
      .filter(chunk => chunk !== "")
      .map(chunk => chunk.split("\n").filter(line => line !== ""));
  };

  return {
    run: args => execShim(shimPath, args, env),
    kosliCalls: () => readCalls(kosliLog),
    realCalls: () => readCalls(realLog)
  };
}

function attestArgs(ref, name, extra = []) {
  return ["attest", "artifact", ref, "--artifact-type=oci", "--name", name, ...extra];
}

shimTest("SHIM_SOURCE passes a bash syntax check", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kosli-shim-syntax-"));
  t.teardown(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "shim.sh");
  fs.writeFileSync(file, SHIM_SOURCE);
  const res = await execShim("bash", ["-n", file], process.env);
  t.is(res.status, 0, res.stderr);
});

shimTest("docker push attests the ref with a derived name", async t => {
  const h = makeHarness(t);
  const res = await h.run(["push", "localhost:5000/ns/app:1"]);
  t.is(res.status, 0, res.stderr);
  t.deepEqual(h.kosliCalls(), [attestArgs("localhost:5000/ns/app:1", "app")]);
});

shimTest("the real binary receives the original args unchanged", async t => {
  const h = makeHarness(t);
  await h.run(["push", "localhost:5000/ns/app:1"]);
  t.deepEqual(h.realCalls(), [["push", "localhost:5000/ns/app:1"]]);
});

shimTest("a real binary failure propagates its exit code and never attests", async t => {
  const h = makeHarness(t, { realExit: 3 });
  const res = await h.run(["push", "localhost:5000/ns/app:1"]);
  t.is(res.status, 3);
  t.deepEqual(h.kosliCalls(), []);
});

shimTest("docker build --push attests every tag", async t => {
  const h = makeHarness(t);
  const res = await h.run(["build", "--push", "-t", "reg/a:1", "-t", "reg/b:1", "."]);
  t.is(res.status, 0, res.stderr);
  t.deepEqual(h.kosliCalls(), [attestArgs("reg/a:1", "a"), attestArgs("reg/b:1", "b")]);
});

shimTest("duplicate tags are attested once", async t => {
  const h = makeHarness(t);
  await h.run(["build", "--push", "-t", "reg/a:1", "-t", "reg/a:1", "."]);
  t.deepEqual(h.kosliCalls(), [attestArgs("reg/a:1", "a")]);
});

shimTest("--tag= form is collected", async t => {
  const h = makeHarness(t);
  await h.run(["build", "--push", "--tag=reg/a:1", "."]);
  t.deepEqual(h.kosliCalls(), [attestArgs("reg/a:1", "a")]);
});

shimTest("docker buildx build --push attests", async t => {
  const h = makeHarness(t);
  await h.run(["buildx", "build", "--push", "-t", "reg/a:1", "."]);
  t.deepEqual(h.kosliCalls(), [attestArgs("reg/a:1", "a")]);
});

shimTest("invoked as buildx, build --push attests", async t => {
  const h = makeHarness(t, { prog: "buildx" });
  await h.run(["build", "--push", "-t", "reg/a:1", "."]);
  t.deepEqual(h.kosliCalls(), [attestArgs("reg/a:1", "a")]);
});

shimTest("invoked as docker-buildx, build --push attests", async t => {
  const h = makeHarness(t, { prog: "docker-buildx" });
  await h.run(["build", "--push", "-t", "reg/a:1", "."]);
  t.deepEqual(h.kosliCalls(), [attestArgs("reg/a:1", "a")]);
});

shimTest("--output type=registry counts as a push", async t => {
  const h = makeHarness(t);
  await h.run(["build", "--output", "type=registry", "-t", "reg/a:1", "."]);
  t.deepEqual(h.kosliCalls(), [attestArgs("reg/a:1", "a")]);
});

shimTest("--output=type=image,push=true counts as a push", async t => {
  const h = makeHarness(t);
  await h.run(["buildx", "build", "--output=type=image,push=true", "-t", "reg/a:1", "."]);
  t.deepEqual(h.kosliCalls(), [attestArgs("reg/a:1", "a")]);
});

shimTest("a build without --push does not attest", async t => {
  const h = makeHarness(t);
  const res = await h.run(["build", "-t", "reg/a:1", "."]);
  t.is(res.status, 0, res.stderr);
  t.deepEqual(h.kosliCalls(), []);
});

shimTest("docker image push attests", async t => {
  const h = makeHarness(t);
  await h.run(["image", "push", "reg/a:1"]);
  t.deepEqual(h.kosliCalls(), [attestArgs("reg/a:1", "a")]);
});

shimTest("value-taking global docker flags do not hide the subcommand", async t => {
  const h = makeHarness(t);
  await h.run(["--config", "/tmp/x", "push", "reg/a:1"]);
  t.deepEqual(h.kosliCalls(), [attestArgs("reg/a:1", "a")]);
});

shimTest("push --all-tags warns and does not attest", async t => {
  const h = makeHarness(t);
  const res = await h.run(["push", "--all-tags", "reg/a"]);
  t.is(res.status, 0);
  t.deepEqual(h.kosliCalls(), []);
  t.regex(res.stderr, /--all-tags/);
});

shimTest("artifact-name overrides derivation for every ref", async t => {
  const h = makeHarness(t, { artifactName: "my-artifact" });
  await h.run(["build", "--push", "-t", "reg/a:1", "-t", "reg/b:1", "."]);
  t.deepEqual(h.kosliCalls(), [
    attestArgs("reg/a:1", "my-artifact"),
    attestArgs("reg/b:1", "my-artifact")
  ]);
});

shimTest("attest-flags are appended to the kosli call", async t => {
  const h = makeHarness(t, { attestFlags: "--annotate foo=bar" });
  await h.run(["push", "reg/a:1"]);
  t.deepEqual(h.kosliCalls(), [attestArgs("reg/a:1", "a", ["--annotate", "foo=bar"])]);
});

// --- name derivation via real pushes ---

const derivationCases = [
  { ref: "localhost:5000/ns/app:1", name: "app", label: "registry port is not a tag" },
  { ref: "foo/bar@sha256:0123456789abcdef", name: "bar", label: "digest ref" },
  { ref: "localhost/kosli-poc:8fff94fb10fb3527b8511eed19efe745313ab413", name: "kosli-poc", label: "sha tag" },
  {
    ref: "artifactory.sdlc.ctl.gcp.db.com/dkr-public-local/com/db/espear/esr/espear-esr-reference-data-service:4.0.345",
    name: "espear-esr-reference-data-service",
    label: "deep path"
  }
];

derivationCases.forEach(({ ref, name, label }) => {
  shimTest(`derives name '${name}' from ${label}`, async t => {
    const h = makeHarness(t);
    await h.run(["push", ref]);
    t.deepEqual(h.kosliCalls(), [attestArgs(ref, name)]);
  });
});

// --- failure handling ---

shimTest("a failed attest warns and exits 0 by default", async t => {
  const h = makeHarness(t, { kosliExit: 1 });
  const res = await h.run(["push", "reg/a:1"]);
  t.is(res.status, 0);
  t.regex(res.stderr, /WARNING: attestation failed for reg\/a:1/);
});

shimTest("a failed attest fails the step when fail-on-attest-error is true", async t => {
  const h = makeHarness(t, { kosliExit: 1, failOnError: "true" });
  const res = await h.run(["push", "reg/a:1"]);
  t.is(res.status, 1);
});

shimTest("an unexpected invocation name exits 127", async t => {
  const h = makeHarness(t, { prog: "podman" });
  const res = await h.run(["push", "reg/a:1"]);
  t.is(res.status, 127);
  t.deepEqual(h.kosliCalls(), []);
});

shimTest("shim stdout carries only the real binary's stdout", async t => {
  const h = makeHarness(t);
  const res = await h.run(["push", "reg/a:1"]);
  t.is(res.stdout, "real-stdout\n");
  t.regex(res.stderr, /kosli-shim: attested reg\/a:1/);
});
