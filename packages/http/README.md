# @foulfoxhacks/ametherian-http

**Status: unpublished preview.** Not released to npm, not audited, API may change. Not a drop-in replacement for any other client.

An HTTP client built on `node:http`/`node:https` and the other Ametherian packages, with secure defaults.

```js
import { createHttpClient } from '@foulfoxhacks/ametherian-http';
import { object, string } from '@foulfoxhacks/ametherian-schema';

const api = createHttpClient({ baseUrl: 'https://api.example.com', timeoutMs: 10_000 });
const res = await api.get('/users/1', { headers: { authorization: `Bearer ${token}` } });
const user = res.json({ schema: object({ name: string() }, { unknownKeys: 'strip' }) });
api.close();
```

| Default | Behaviour |
|---|---|
| Destination policy | `ametherian-guard` with public addresses only. It checks the URL, every redirect hop and every resolved IP at connect time. Pass `policy: createDestinationPolicy({ allowCategories: ['loopback'] })` for local development. |
| Redirects | Up to 5. `Authorization`, `Cookie` and `Proxy-Authorization` are removed on cross-origin hops. https → http is blocked. 303 (and 301/302 after POST) becomes GET without a body. |
| Timeouts | `timeoutMs` (30 s) per attempt, plus an optional caller `signal`. |
| Body size | `maxResponseBytes` (10 MiB), counted **after** gzip/deflate/br decompression. |
| Status | Non-2xx throws `HttpStatusError` (`throwOnStatus: false` to opt out). |
| Retries | Idempotent methods only (GET, HEAD, OPTIONS, PUT, DELETE), on retryable errors (timeouts, network errors, 408/425/429/5xx). Up to 2 retries with jittered backoff, honouring `Retry-After`. `retry: false` turns this off. |
| Headers | CR/LF in names or values is rejected. Names are lower-cased. |
| Events | `http.request`, `http.response`, `http.redirect`, `http.retry`, `http.error` on an optional `hooks` event hub, with redacted URLs. |

**Transport:** the client talks to a small transport function (`createNodeTransport` by default). Tests can pass a fake one; see `ametherian-testing`.

**Not covered yet:** HTTP proxies, HTTP/2, streaming request/response bodies, cookies, multipart uploads.
