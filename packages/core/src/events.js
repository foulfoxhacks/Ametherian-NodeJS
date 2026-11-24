/**
 * Event hooks used for logging, metrics and tracing integrations.
 *
 * Packages emit named events with plain-object payloads. Listeners never
 * break the emitter: a throwing or rejecting listener is reported to the
 * hub's `onListenerError` (default: ignored) and the remaining listeners
 * still run. Emission is synchronous and cheap when nobody listens.
 */

/**
 * @param {{ onListenerError?: (error: unknown, event: string) => void }} [options]
 */
export function createEventHub(options = {}) {
  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();
  /** @type {Set<Function>} */
  const anyListeners = new Set();
  const report = options.onListenerError ?? (() => {});

  function call(fn, args, name) {
    try {
      const out = fn(...args);
      if (out && typeof out.then === 'function') out.then(undefined, (err) => safeReport(err, name));
    } catch (err) {
      safeReport(err, name);
    }
  }

  function safeReport(err, name) {
    try {
      report(err, name);
    } catch {
      // The error reporter itself must not break emitters.
    }
  }

  return Object.freeze({
    /**
     * @param {string} name
     * @param {(payload: any) => unknown} fn
     * @returns {() => void} unsubscribe
     */
    on(name, fn) {
      if (typeof fn !== 'function') throw new TypeError('listener must be a function');
      let set = listeners.get(name);
      if (!set) listeners.set(name, (set = new Set()));
      set.add(fn);
      return () => {
        set.delete(fn);
        if (set.size === 0 && listeners.get(name) === set) listeners.delete(name);
      };
    },
    /** Listen to every event: fn(name, payload). */
    onAny(fn) {
      if (typeof fn !== 'function') throw new TypeError('listener must be a function');
      anyListeners.add(fn);
      return () => anyListeners.delete(fn);
    },
    /** True if anyone listens to `name`; lets emitters skip building payloads. */
    hasListeners(name) {
      return anyListeners.size > 0 || (listeners.get(name)?.size ?? 0) > 0;
    },
    /**
     * @param {string} name
     * @param {Record<string, unknown>} [payload]
     */
    emit(name, payload = {}) {
      const set = listeners.get(name);
      if (set) for (const fn of [...set]) call(fn, [payload], name);
      for (const fn of [...anyListeners]) call(fn, [name, payload], name);
    },
  });
}
