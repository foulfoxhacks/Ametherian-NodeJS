# @foulfoxhacks/ametherian-cache

**Status: unpublished preview.** Not released to npm, not audited, API may change.

A bounded in-memory cache with no third-party dependencies.

```js
import { createCache } from '@foulfoxhacks/ametherian-cache';

const cache = createCache({ maxEntries: 1000, ttlMs: 60_000, maxSize: 5_000_000, sizeOf: (v) => v.byteLength });
const tenant = cache.scope(tenantId);                 // isolated keys per tenant
const doc = await tenant.getOrLoad(id, () => fetchDoc(id));
```

- **Always bounded:** `maxEntries` is required. The optional `maxSize` + `sizeOf` set a size budget, and an oversized single entry throws `LimitExceededError`.
- **LRU eviction and per-entry TTL** (`ttlMs` on the cache or per `set`). `prune()` removes expired entries.
- **`getOrLoad`** runs the loader once per key for concurrent callers. Failures are not cached.
- **`scope(name)`** encodes scope and key unambiguously, so `("a:b","c")` and `("a","b:c")` never collide.
- **`onEvict` errors are swallowed**, so a callback can't break the cache.
