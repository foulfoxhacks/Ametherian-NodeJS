# @foulfoxhacks/ametherian-testing

**Status: unpublished preview.** Not released to npm, API may change.

Helpers for testing code built on Ametherian packages.

| Export | Use |
|---|---|
| `createMockTransport(routes)` | Pass as `transport` to `createHttpClient`. Routes look like `'GET /path'` or `'POST https://host/path'` and map to a response, an `Error`, or a function. Records `calls`. The guard policy still applies, because it runs before the transport. |
| `createTestServer(handler)` | A real HTTP server on `127.0.0.1` with an ephemeral port. Records requests and supports `await using`. |
| `createFakeClock(start)` | `now()` / `advance(ms)` for anything that accepts `now` (cache, rate limiter, circuit breaker). |
| `fuzzStrings({ seed, count })`, `ADVERSARIAL_STRINGS`, `seededRandom` | A deterministic corpus of hostile inputs (CRLF, prototype keys, path traversal, IP spellings, deep nesting, huge strings) plus seeded mutations for property-style tests. |

```js
const transport = createMockTransport({ 'GET /users/1': { json: { name: 'Ana' } } });
const client = createHttpClient({ baseUrl: 'https://api.example.com', transport });
```
