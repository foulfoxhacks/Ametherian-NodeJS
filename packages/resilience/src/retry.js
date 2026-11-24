/**
 * Retry with exponential backoff and full jitter. By default only errors
 * marked `retryable: true` (Ametherian convention) are retried, and the
 * caller's AbortSignal stops both the wait and further attempts.
 */
import { validateOptions, throwIfAborted, toAbortError } from '@foulfoxhacks/ametherian-core';

const SCHEMA = {
  retries: { type: 'integer', min: 0, max: 100, default: 3 },
  minDelayMs: { type: 'integer', min: 0, default: 100 },
  maxDelayMs: { type: 'integer', min: 0, default: 10_000 },
  factor: { type: 'number', min: 1, default: 2 },
  jitter: { type: 'string', oneOf: ['full', 'none'], default: 'full' },
  shouldRetry: { type: 'function' },
  onRetry: { type: 'function' },
  signal: { type: 'signal' },
  random: { type: 'function', default: Math.random },
  sleep: { type: 'function' },
};

/**
 * Delay before retry number `attempt` (1-based).
 * @param {number} attempt
 * @param {{ minDelayMs: number, maxDelayMs: number, factor: number, jitter: 'full'|'none' }} o
 * @param {() => number} [random]
 */
export function backoffDelay(attempt, o, random = Math.random) {
  const cap = Math.min(o.maxDelayMs, o.minDelayMs * o.factor ** (attempt - 1));
  return o.jitter === 'full' ? Math.floor(random() * cap) : Math.floor(cap);
}

/** Abortable sleep. */
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(toAbortError(signal.reason));
    const onAbort = () => {
      clearTimeout(timer);
      reject(toAbortError(signal.reason));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const defaultShouldRetry = (err) => typeof err === 'object' && err !== null && err.retryable === true;

/**
 * @template T
 * @param {(ctx: { attempt: number, signal?: AbortSignal }) => Promise<T>} fn
 * @param {object} [options]
 * @returns {Promise<T>}
 */
export async function retry(fn, options) {
  const o = validateOptions(options, SCHEMA, { name: 'retry options' });
  const shouldRetry = o.shouldRetry ?? defaultShouldRetry;
  const wait = o.sleep ?? sleep;
  for (let attempt = 1; ; attempt++) {
    throwIfAborted(o.signal);
    try {
      return await fn({ attempt, signal: o.signal });
    } catch (err) {
      if (o.signal?.aborted) throw toAbortError(o.signal.reason);
      if (attempt > o.retries || !shouldRetry(err, attempt)) throw err;
      // Honour a server-provided hint (e.g. Retry-After) but never exceed maxDelayMs.
      const hint = err?.details?.retryAfterMs;
      const delay =
        typeof hint === 'number' && hint >= 0 ? Math.min(hint, o.maxDelayMs) : backoffDelay(attempt, o, o.random);
      o.onRetry?.({ attempt, delayMs: delay, error: err });
      await wait(delay, o.signal);
    }
  }
}
