/**
 * Bounded in-memory cache: LRU eviction by entry count and optional size
 * budget, per-entry TTL, in-flight de-duplication for loaders, and scoped
 * views whose keys cannot collide with each other (cache isolation).
 */
import { validateOptions, LimitExceededError } from '@foulfoxhacks/ametherian-core';

const SCHEMA = {
  maxEntries: { type: 'integer', min: 1, required: true },
  maxSize: { type: 'integer', min: 1 },
  sizeOf: { type: 'function' },
  ttlMs: { type: 'integer', min: 1 },
  now: { type: 'function', default: () => Date.now() },
  onEvict: { type: 'function' },
};

/**
 * @param {{ maxEntries: number, maxSize?: number, sizeOf?: (value: unknown, key: string) => number,
 *           ttlMs?: number, now?: () => number, onEvict?: (key: string, value: unknown, reason: string) => void }} options
 */
export function createCache(options) {
  const opts = validateOptions(options, SCHEMA, { name: 'cache options' });
  if (opts.maxSize !== undefined && !opts.sizeOf) {
    validateOptions({}, { sizeOf: { type: 'function', required: true } }, { name: 'cache options (maxSize needs sizeOf)' });
  }
  /** @type {Map<string, { value: unknown, expires: number, size: number }>} */
  const map = new Map();
  /** @type {Map<string, Promise<unknown>>} */
  const inflight = new Map();
  let totalSize = 0;
  const stats = { hits: 0, misses: 0, evictions: 0, expirations: 0 };

  function checkKey(key) {
    if (typeof key !== 'string') throw new TypeError('cache keys must be strings');
  }

  function remove(key, reason) {
    const entry = map.get(key);
    if (!entry) return false;
    map.delete(key);
    totalSize -= entry.size;
    if (reason === 'evicted') stats.evictions++;
    if (reason === 'expired') stats.expirations++;
    if (opts.onEvict) {
      try {
        opts.onEvict(key, entry.value, reason);
      } catch {
        // eviction callbacks must not break cache operations
      }
    }
    return true;
  }

  function live(key) {
    const entry = map.get(key);
    if (!entry) return undefined;
    if (entry.expires <= opts.now()) {
      remove(key, 'expired');
      return undefined;
    }
    return entry;
  }

  function get(key) {
    checkKey(key);
    const entry = live(key);
    if (!entry) {
      stats.misses++;
      return undefined;
    }
    stats.hits++;
    map.delete(key);
    map.set(key, entry); // refresh LRU position
    return entry.value;
  }

  function set(key, value, setOptions = {}) {
    checkKey(key);
    const ttl = setOptions.ttlMs ?? opts.ttlMs;
    if (ttl !== undefined && (!Number.isInteger(ttl) || ttl < 1)) throw new TypeError('ttlMs must be a positive integer');
    const size = opts.sizeOf ? opts.sizeOf(value, key) : 0;
    if (opts.maxSize !== undefined) {
      if (!Number.isFinite(size) || size < 0) throw new TypeError('sizeOf must return a non-negative number');
      if (size > opts.maxSize) {
        throw new LimitExceededError(`Cache entry exceeds maxSize ${opts.maxSize}`, { limit: opts.maxSize, actual: size, resource: 'cache-entry' });
      }
    }
    remove(key, 'replaced');
    map.set(key, { value, size, expires: ttl === undefined ? Infinity : opts.now() + ttl });
    totalSize += size;
    for (const oldest of map.keys()) {
      const overCount = map.size > opts.maxEntries;
      const overSize = opts.maxSize !== undefined && totalSize > opts.maxSize;
      if (!overCount && !overSize) break;
      remove(oldest, 'evicted');
    }
    return api;
  }

  /**
   * Return the cached value or run `loader` once per key, sharing the
   * pending promise with concurrent callers. Rejections are not cached.
   * @param {string} key
   * @param {() => Promise<unknown> | unknown} loader
   * @param {{ ttlMs?: number }} [setOptions]
   */
  async function getOrLoad(key, loader, setOptions) {
    checkKey(key);
    const entry = live(key);
    if (entry) {
      stats.hits++;
      map.delete(key);
      map.set(key, entry);
      return entry.value;
    }
    const pending = inflight.get(key);
    if (pending) return pending;
    stats.misses++;
    const p = (async () => {
      try {
        const value = await loader();
        set(key, value, setOptions);
        return value;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    return p;
  }

  function prune() {
    const t = opts.now();
    let n = 0;
    for (const [key, entry] of map) {
      if (entry.expires <= t && remove(key, 'expired')) n++;
    }
    return n;
  }

  const api = {
    get,
    set,
    getOrLoad,
    has: (key) => (checkKey(key), live(key) !== undefined),
    delete: (key) => (checkKey(key), remove(key, 'deleted')),
    clear() {
      for (const key of [...map.keys()]) remove(key, 'cleared');
    },
    prune,
    get size() {
      return map.size;
    },
    get totalSize() {
      return totalSize;
    },
    stats: () => ({ ...stats, size: map.size, totalSize }),
    /**
     * A view whose keys live in their own namespace. Scope and key are
     * encoded unambiguously, so ("a:b","c") never collides with ("a","b:c").
     * @param {string} scope
     */
    scope(name) {
      checkKey(name);
      const k = (key) => (checkKey(key), JSON.stringify([name, key]));
      return Object.freeze({
        get: (key) => get(k(key)),
        set: (key, value, o) => (set(k(key), value, o), undefined),
        getOrLoad: (key, loader, o) => getOrLoad(k(key), loader, o),
        has: (key) => api.has(k(key)),
        delete: (key) => api.delete(k(key)),
      });
    },
  };
  return api;
}
