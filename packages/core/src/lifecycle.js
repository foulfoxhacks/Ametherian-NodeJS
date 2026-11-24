/**
 * Resource lifecycle: register cleanups as resources are acquired, release
 * them in reverse order exactly once, and report every cleanup failure.
 */
import { AmetherianError } from './errors.js';

export const asyncDispose = Symbol.asyncDispose ?? Symbol.for('nodejs.asyncDispose');
export const dispose = Symbol.dispose ?? Symbol.for('nodejs.dispose');

export const CLEANUP_FAILED = 'AMETHERIAN_CLEANUP_FAILED';

function cleanupOf(resource) {
  if (resource == null) return null;
  for (const key of [asyncDispose, dispose, 'close', 'destroy']) {
    if (typeof resource[key] === 'function') return () => resource[key]();
  }
  return null;
}

/**
 * Create a scope that owns resources.
 *
 * - `defer(fn)` registers a cleanup function.
 * - `use(resource)` registers a resource with `Symbol.asyncDispose`,
 *   `Symbol.dispose`, `close()` or `destroy()` and returns it.
 * - `close()` runs cleanups last-in-first-out, once. If any fail it rejects
 *   with an AmetherianError (`AMETHERIAN_CLEANUP_FAILED`) whose `errors`
 *   lists every failure; all cleanups still run.
 *
 * Supports `await using scope = createResourceScope()` where available.
 */
export function createResourceScope() {
  /** @type {Array<() => unknown>} */
  const stack = [];
  let closing = null;

  function assertOpen() {
    if (closing) throw new AmetherianError('Resource scope is already closed', { code: CLEANUP_FAILED });
  }

  const scope = {
    get closed() {
      return closing !== null;
    },
    defer(fn) {
      if (typeof fn !== 'function') throw new TypeError('defer expects a function');
      assertOpen();
      stack.push(fn);
    },
    use(resource) {
      const fn = cleanupOf(resource);
      if (!fn) throw new TypeError('Resource has no dispose, close or destroy method');
      assertOpen();
      stack.push(fn);
      return resource;
    },
    close() {
      if (!closing) {
        closing = (async () => {
          const errors = [];
          while (stack.length) {
            const fn = stack.pop();
            try {
              await fn();
            } catch (err) {
              errors.push(err);
            }
          }
          if (errors.length) {
            const err = new AmetherianError(`${errors.length} cleanup step(s) failed`, {
              code: CLEANUP_FAILED,
              cause: errors[0],
              details: { count: errors.length },
            });
            Object.defineProperty(err, 'errors', { value: Object.freeze(errors), enumerable: false });
            throw err;
          }
        })();
      }
      return closing;
    },
  };
  scope[asyncDispose] = () => scope.close();
  return scope;
}
