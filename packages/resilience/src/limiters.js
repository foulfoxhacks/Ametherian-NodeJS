/**
 * Concurrency limit, token-bucket rate limit and circuit breaker.
 * All are bounded: queues have a maximum length and fail fast when full.
 */
import { AmetherianError, LimitExceededError, validateOptions, toAbortError } from '@foulfoxhacks/ametherian-core';

/**
 * Run at most `maxConcurrent` tasks at once; queue up to `maxQueue` more.
 * @param {{ maxConcurrent: number, maxQueue?: number }} options
 */
export function createConcurrencyLimit(options) {
  const o = validateOptions(options, {
    maxConcurrent: { type: 'integer', min: 1, required: true },
    maxQueue: { type: 'integer', min: 0, default: 1000 },
  }, { name: 'concurrency limit options' });
  let active = 0;
  /** @type {Array<{ start: () => void, reject: (e: unknown) => void, cleanup: () => void }>} */
  const queue = [];

  function next() {
    while (active < o.maxConcurrent && queue.length) {
      const item = queue.shift();
      item.cleanup();
      item.start();
    }
  }

  /**
   * @template T
   * @param {() => Promise<T> | T} fn
   * @param {{ signal?: AbortSignal }} [runOptions]
   * @returns {Promise<T>}
   */
  function run(fn, runOptions = {}) {
    const { signal } = runOptions;
    if (signal?.aborted) return Promise.reject(toAbortError(signal.reason));
    return new Promise((resolve, reject) => {
      const start = () => {
        active++;
        Promise.resolve()
          .then(fn)
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      };
      if (active < o.maxConcurrent) return start();
      if (queue.length >= o.maxQueue) {
        return reject(new LimitExceededError(`Queue is full (${o.maxQueue})`, { limit: o.maxQueue, resource: 'queue' }));
      }
      const onAbort = () => {
        const i = queue.indexOf(item);
        if (i !== -1) queue.splice(i, 1);
        reject(toAbortError(signal.reason));
      };
      const item = { start, reject, cleanup: () => signal?.removeEventListener('abort', onAbort) };
      signal?.addEventListener('abort', onAbort, { once: true });
      queue.push(item);
    });
  }

  return Object.freeze({
    run,
    get active() {
      return active;
    },
    get pending() {
      return queue.length;
    },
  });
}

/**
 * Token bucket: `capacity` tokens, refilled continuously at
 * `refillPerSecond`. Non-blocking: callers decide whether to wait or reject.
 * @param {{ capacity: number, refillPerSecond: number, now?: () => number }} options
 */
export function createRateLimiter(options) {
  const o = validateOptions(options, {
    capacity: { type: 'number', min: 1, required: true },
    refillPerSecond: { type: 'number', min: 0, required: true },
    now: { type: 'function', default: () => Date.now() },
  }, { name: 'rate limiter options' });
  let tokens = o.capacity;
  let last = o.now();

  function refill() {
    const t = o.now();
    tokens = Math.min(o.capacity, tokens + ((t - last) / 1000) * o.refillPerSecond);
    last = t;
  }

  return Object.freeze({
    /** Take `n` tokens if available. */
    tryRemove(n = 1) {
      if (!(n > 0) || n > o.capacity) throw new RangeError(`n must be in (0, ${o.capacity}]`);
      refill();
      if (tokens >= n) {
        tokens -= n;
        return true;
      }
      return false;
    },
    /** Milliseconds until `n` tokens will be available (0 if now; Infinity if never). */
    msUntilAvailable(n = 1) {
      refill();
      if (tokens >= n) return 0;
      if (o.refillPerSecond === 0) return Infinity;
      return Math.ceil(((n - tokens) / o.refillPerSecond) * 1000);
    },
    get tokens() {
      refill();
      return tokens;
    },
  });
}

export const CIRCUIT_OPEN = 'AMETHERIAN_CIRCUIT_OPEN';

/**
 * Circuit breaker: after `failureThreshold` consecutive failures the circuit
 * opens and calls fail fast with CIRCUIT_OPEN for `resetMs`; then one trial
 * call is allowed (half-open). Success closes it, failure re-opens it.
 * @param {{ failureThreshold?: number, resetMs?: number, now?: () => number, isFailure?: (err: unknown) => boolean }} [options]
 */
export function createCircuitBreaker(options) {
  const o = validateOptions(options, {
    failureThreshold: { type: 'integer', min: 1, default: 5 },
    resetMs: { type: 'integer', min: 1, default: 30_000 },
    now: { type: 'function', default: () => Date.now() },
    isFailure: { type: 'function', default: () => true },
  }, { name: 'circuit breaker options' });
  let state = 'closed';
  let failures = 0;
  let openedAt = 0;
  let trialInFlight = false;

  async function run(fn) {
    if (state === 'open') {
      if (o.now() - openedAt < o.resetMs) {
        throw new AmetherianError('Circuit is open', {
          code: CIRCUIT_OPEN,
          retryable: true,
          details: { retryAfterMs: Math.max(0, o.resetMs - (o.now() - openedAt)) },
        });
      }
      state = 'half-open';
    }
    if (state === 'half-open') {
      if (trialInFlight) {
        throw new AmetherianError('Circuit is half-open; trial call in progress', { code: CIRCUIT_OPEN, retryable: true });
      }
      trialInFlight = true;
    }
    const wasTrial = state === 'half-open';
    try {
      const out = await fn();
      failures = 0;
      state = 'closed';
      return out;
    } catch (err) {
      if (o.isFailure(err)) {
        failures++;
        if (wasTrial || failures >= o.failureThreshold) {
          state = 'open';
          openedAt = o.now();
        }
      }
      throw err;
    } finally {
      if (wasTrial) trialInFlight = false;
    }
  }

  return Object.freeze({
    run,
    get state() {
      if (state === 'open' && o.now() - openedAt >= o.resetMs) return 'half-open';
      return state;
    },
    reset() {
      state = 'closed';
      failures = 0;
    },
  });
}
