const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "EPIPE"
]);

export function isTransientError(err) {
  if (!err) return false;
  if (typeof err.httpStatusCode === "number") {
    return err.httpStatusCode >= 500 || err.httpStatusCode === 429 || err.httpStatusCode === 408;
  }
  if (typeof err.status === "number") {
    return err.status >= 500 || err.status === 429 || err.status === 408;
  }
  if (typeof err.code === "string" && TRANSIENT_NETWORK_CODES.has(err.code)) {
    return true;
  }
  if (typeof err.message === "string" && /Unexpected HTTP response:\s*(5\d\d|429|408)/.test(err.message)) {
    return true;
  }
  return false;
}

// Full-jitter exponential backoff: chosen uniformly from [0, min(maxDelayMs, base * factor^attempt)].
// See AWS Architecture Blog "Exponential Backoff And Jitter". Jitter prevents many parallel CI
// jobs from hammering GitHub in lockstep when an outage clears.
export function computeBackoff(attempt, { baseDelayMs, factor, maxDelayMs }, random = Math.random) {
  const exp = baseDelayMs * Math.pow(factor, attempt);
  const capped = Math.min(maxDelayMs, exp);
  return Math.floor(random() * capped);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetries(fn, options = {}) {
  const {
    retries = 5,
    baseDelayMs = 2000,
    factor = 2,
    maxDelayMs = 60000,
    shouldRetry = isTransientError,
    onRetry = () => {},
    sleeper = sleep,
    random = Math.random
  } = options;

  let attempt = 0;
  while (true) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) {
        throw err;
      }
      const delay = computeBackoff(attempt, { baseDelayMs, factor, maxDelayMs }, random);
      onRetry({ attempt: attempt + 1, retries, delayMs: delay, error: err });
      await sleeper(delay);
      attempt++;
    }
  }
}
