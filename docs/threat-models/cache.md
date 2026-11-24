# Threat model: `@foulfoxhacks/ametherian-cache`

Status: draft for review · Scope: in-process cache · Date: 2026-11-24

## Trust boundaries

| Input | Trusted? |
|---|---|
| Cache options | Trusted |
| Keys | Often derived from untrusted input (URLs, user IDs) |
| Values | Whatever the loader returns |

## Threats and mitigations

| # | Threat | Mitigation | Residual risk |
|---|---|---|---|
| C1 | Unbounded memory growth | `maxEntries` required; optional `maxSize` budget; oversized single entry rejected | `sizeOf` accuracy is the caller's responsibility |
| C2 | Cross-tenant data leaks via key collisions (`"a:b"+"c"` vs `"a"+"b:c"`) | `scope(name)` encodes scope and key as a JSON tuple | Keys built by hand outside `scope()` can still collide |
| C3 | Cache poisoning: an error or partial result stored and served | `getOrLoad` never caches rejections; values are stored only after the loader resolves | A loader that returns bad data successfully will be cached |
| C4 | Stampede: many concurrent loads of a missing key | In-flight de-duplication per key | — |
| C5 | Stale data served past its validity | TTL per cache or per entry; expired entries removed on access and by `prune()` | Time source is `Date.now` unless injected |
| C6 | Prototype-key confusion (`"__proto__"` as key) | Storage uses `Map`, not plain objects | — |
| C7 | Callback failure breaking cache operations | `onEvict` errors are caught | — |
| C8 | Shared mutable values | Values are stored by reference | Callers should cache immutable values or copies |

## Verification

`packages/cache/test` covers C1–C5 and C7.
