/**
 * Cancellation and deadline helpers built on AbortSignal.
 *
 * Abort reasons are always Ametherian errors: a caller abort becomes
 * AbortError (with the original reason as `cause`), and a deadline becomes
 * TimeoutError. Callers can therefore tell the two apart by `code`.
 */
import { AbortError, TimeoutError, ConfigError, isAmetherianError } from './errors.js';

/**
 * Normalise any abort reason to an Ametherian error.
 * @param {unknown} reason
 */
export function toAbortError(reason) {
  if (isAmetherianError(reason)) return reason;
  if (reason instanceof DOMException && reason.name === 'TimeoutError') {
    return new TimeoutError(undefined, { cause: reason });
  }
  return new AbortError(undefined, reason === undefined ? {} : { cause: reason });
}

/**
 * Throw the signal's reason (as an Ametherian error) if it is aborted.
 * @param {AbortSignal | undefined} signal
 */
export function throwIfAborted(signal) {
  if (signal?.aborted) throw toAbortError(signal.reason);
}

/**
 * Create a deadline: a signal that aborts with TimeoutError after `ms`, or
 * with AbortError if `parent` aborts first. Call `dispose()` when the work
 * finishes so the timer does not keep running.
 *
 * @param {number} ms Milliseconds until the deadline. Must be a finite number >= 0.
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {{ signal: AbortSignal, dispose: () => void, readonly expiresAt: number }}
 */
export function createDeadline(ms, options = {}) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
    throw new ConfigError('Deadline must be a finite number of milliseconds >= 0', {
      problems: [`ms: expected finite number >= 0, got ${String(ms)}`],
    });
  }
  const controller = new AbortController();
  const parent = options.signal;
  const expiresAt = Date.now() + ms;

  const onParentAbort = () => cleanup(toAbortError(parent.reason));
  const timer = setTimeout(
    () => cleanup(new TimeoutError(`Deadline of ${ms}ms exceeded`, { details: { timeoutMs: ms } })),
    ms,
  );
  timer.unref?.();

  function cleanup(reason) {
    clearTimeout(timer);
    parent?.removeEventListener('abort', onParentAbort);
    if (reason !== undefined && !controller.signal.aborted) controller.abort(reason);
  }

  if (parent?.aborted) {
    cleanup(toAbortError(parent.reason));
  } else {
    parent?.addEventListener('abort', onParentAbort, { once: true });
  }

  return {
    signal: controller.signal,
    dispose: () => cleanup(undefined),
    get expiresAt() {
      return expiresAt;
    },
  };
}

/**
 * Race a promise against a signal. Rejects with the signal's Ametherian
 * error as soon as it aborts. Does not cancel the underlying work; pass the
 * signal into that work as well when it supports one.
 *
 * @template T
 * @param {Promise<T> | (() => Promise<T>)} work
 * @param {AbortSignal | undefined} signal
 * @returns {Promise<T>}
 */
export function abortable(work, signal) {
  try {
    throwIfAborted(signal);
  } catch (err) {
    return Promise.reject(err);
  }
  const promise = typeof work === 'function' ? Promise.resolve().then(work) : Promise.resolve(work);
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(toAbortError(signal.reason));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}
