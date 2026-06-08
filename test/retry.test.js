import test from "ava";
import { withRetries, isTransientError, computeBackoff } from "../src/retry.js";

const noSleep = () => Promise.resolve();
const fixedRandom = () => 0.5;

test("returns the result when fn succeeds on first attempt", async t => {
  let calls = 0;
  const result = await withRetries(async () => { calls++; return "ok"; }, { sleeper: noSleep });
  t.is(result, "ok");
  t.is(calls, 1);
});

test("retries transient errors and eventually succeeds", async t => {
  let calls = 0;
  const result = await withRetries(
    async () => {
      calls++;
      if (calls < 3) {
        const err = new Error("Unexpected HTTP response: 504");
        err.httpStatusCode = 504;
        throw err;
      }
      return "ok";
    },
    { sleeper: noSleep, random: fixedRandom }
  );
  t.is(result, "ok");
  t.is(calls, 3);
});

test("does not retry non-transient errors", async t => {
  let calls = 0;
  const err = new Error("Unexpected HTTP response: 404");
  err.httpStatusCode = 404;
  await t.throwsAsync(
    withRetries(async () => { calls++; throw err; }, { sleeper: noSleep }),
    { message: /404/ }
  );
  t.is(calls, 1);
});

test("throws after exhausting retries", async t => {
  let calls = 0;
  const err = new Error("Unexpected HTTP response: 503");
  err.httpStatusCode = 503;
  await t.throwsAsync(
    withRetries(async () => { calls++; throw err; }, { retries: 2, sleeper: noSleep, random: fixedRandom }),
    { message: /503/ }
  );
  t.is(calls, 3); // initial + 2 retries
});

test("invokes onRetry with attempt metadata", async t => {
  const events = [];
  let calls = 0;
  await withRetries(
    async () => {
      calls++;
      if (calls < 2) {
        const err = new Error("Unexpected HTTP response: 502");
        err.httpStatusCode = 502;
        throw err;
      }
      return "ok";
    },
    {
      retries: 3,
      baseDelayMs: 1000,
      factor: 2,
      maxDelayMs: 60000,
      sleeper: noSleep,
      random: fixedRandom,
      onRetry: e => events.push(e)
    }
  );
  t.is(events.length, 1);
  t.is(events[0].attempt, 1);
  t.is(events[0].retries, 3);
  t.is(events[0].delayMs, 500); // floor(0.5 * 1000)
  t.is(events[0].error.httpStatusCode, 502);
});

test("isTransientError identifies HTTP 5xx, 429, 408", t => {
  t.true(isTransientError({ httpStatusCode: 500 }));
  t.true(isTransientError({ httpStatusCode: 504 }));
  t.true(isTransientError({ httpStatusCode: 429 }));
  t.true(isTransientError({ httpStatusCode: 408 }));
  t.false(isTransientError({ httpStatusCode: 404 }));
  t.false(isTransientError({ httpStatusCode: 401 }));
});

test("isTransientError identifies Node network error codes", t => {
  t.true(isTransientError({ code: "ECONNRESET" }));
  t.true(isTransientError({ code: "ETIMEDOUT" }));
  t.true(isTransientError({ code: "EAI_AGAIN" }));
  t.true(isTransientError({ code: "EPIPE" }));
  t.false(isTransientError({ code: "EACCES" }));
});

test("isTransientError excludes ENOTFOUND and ECONNREFUSED (treated as hard failures)", t => {
  t.false(isTransientError({ code: "ENOTFOUND" }));
  t.false(isTransientError({ code: "ECONNREFUSED" }));
});

test("isTransientError matches HTTP response codes in error messages", t => {
  t.true(isTransientError(new Error("Unexpected HTTP response: 504")));
  t.true(isTransientError(new Error("Unexpected HTTP response: 502")));
  t.false(isTransientError(new Error("Unexpected HTTP response: 404")));
  t.false(isTransientError(new Error("some random parse error")));
});

test("isTransientError handles null/undefined safely", t => {
  t.false(isTransientError(null));
  t.false(isTransientError(undefined));
});

test("computeBackoff respects cap and applies jitter", t => {
  // attempt 0, base 1000, factor 2, cap 60000, random=1 → just under 1000
  const d0 = computeBackoff(0, { baseDelayMs: 1000, factor: 2, maxDelayMs: 60000 }, () => 0.999);
  t.true(d0 < 1000);
  t.true(d0 >= 0);

  // attempt 10 with base 1000, factor 2 → 1024000ms, capped at 60000
  const d10 = computeBackoff(10, { baseDelayMs: 1000, factor: 2, maxDelayMs: 60000 }, () => 0.999);
  t.true(d10 < 60000);
  t.true(d10 >= 59000);

  // random=0 always returns 0
  const d0min = computeBackoff(3, { baseDelayMs: 1000, factor: 2, maxDelayMs: 60000 }, () => 0);
  t.is(d0min, 0);
});
