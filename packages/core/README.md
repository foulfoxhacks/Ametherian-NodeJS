# @foulfoxhacks/ametherian-core

**Status: unpublished preview.** Not released to npm, not audited, API may change.

Shared contracts for Ametherian packages, with no runtime dependencies:

| Area | Exports |
|---|---|
| Typed errors | `AmetherianError`, `AbortError`, `TimeoutError`, `LimitExceededError`, `ConfigError`, `UnsupportedCapabilityError`, `ErrorCodes`, `isAmetherianError` |
| Cancellation & deadlines | `createDeadline`, `throwIfAborted`, `abortable`, `toAbortError` |
| Resource limits | `assertWithinLimit`, `createByteLimitStream`, `collectBytes` |
| Redaction | `redactHeaders`, `redactUrl`, `REDACTED`, `DEFAULT_SENSITIVE_HEADERS`, `DEFAULT_SENSITIVE_QUERY_PARAMS` |
| Runtime capabilities | `getRuntimeCapabilities`, `requireCapability` |
| Config validation | `validateOptions` |
| Lifecycle | `createResourceScope`, `asyncDispose`, `dispose` |
| Event hooks | `createEventHub` |

Every error has a stable `code` (`AMETHERIAN_*`); branch on codes, not messages.

```js
import { createDeadline, collectBytes, ErrorCodes } from '@foulfoxhacks/ametherian-core';

const deadline = createDeadline(5_000);
try {
  const res = await fetch(url, { signal: deadline.signal });
  const body = await collectBytes(res.body, { maxBytes: 1_000_000, signal: deadline.signal });
} catch (err) {
  if (err.code === ErrorCodes.TIMEOUT) { /* retry later */ }
} finally {
  deadline.dispose();
}
```

Requirements: Node.js 20 or newer, ESM only. Types ship in `src/index.d.ts`.

Run tests: `npm test` (from this folder or the repo root).
