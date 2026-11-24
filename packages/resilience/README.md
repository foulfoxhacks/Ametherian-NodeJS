# @foulfoxhacks/ametherian-resilience

**Status: unpublished preview.** Not released to npm, not audited, API may change.

Resilience helpers with no third-party dependencies.

| Export | What it does |
|---|---|
| `retry(fn, options)` | Exponential backoff with full jitter. Retries only `retryable: true` errors by default, honours `details.retryAfterMs` (capped by `maxDelayMs`), stops on abort. |
| `createConcurrencyLimit({ maxConcurrent, maxQueue })` | Runs at most N tasks at once. The queue is bounded: when full it fails with `LimitExceededError`, and queued tasks can be aborted. |
| `createRateLimiter({ capacity, refillPerSecond })` | Non-blocking token bucket: `tryRemove()`, `msUntilAvailable()`. |
| `createCircuitBreaker({ failureThreshold, resetMs })` | Fails fast with `AMETHERIAN_CIRCUIT_OPEN` (retryable, with `retryAfterMs`). A single half-open trial decides whether it closes. |

```js
import { retry, createConcurrencyLimit } from '@foulfoxhacks/ametherian-resilience';

const limit = createConcurrencyLimit({ maxConcurrent: 4, maxQueue: 100 });
const data = await limit.run(() => retry(({ signal }) => load(signal), { retries: 3, signal }));
```
