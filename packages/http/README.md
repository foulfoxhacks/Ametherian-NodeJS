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

| Streaming | `{ stream: true }` returns `HttpStreamResponse`: `body` is a web `ReadableStream`, with `bytes()`/`text()`/`json()`/`cancel()`. The size limit and the request deadline keep applying while the body is read. |
| Extra redirect stripping | `stripHeadersOnRedirect: ['x-api-key']` removes more headers on cross-origin hops. |
| Proxy | `proxy: 'http://user:pass@proxy:8080'`. http:// targets are sent in absolute form; https:// targets are tunnelled with CONNECT, with TLS end to end. Proxy credentials go only to the proxy. The proxy resolves names, so the guard checks the target URL but can't check the proxy's DNS answer. |
| HTTP/2 | `http2: true` uses one session per origin over TLS (ALPN h2) or h2c for `http://`. The guard lookup, limits and deadlines still apply. HTTP/2 through a proxy is not supported. |
| Custom CA | `ca: pem` for private or test certificate authorities. There is no option to turn off certificate verification. |

**Transport:** the client talks to a small transport function (`createNodeTransport` by default, `createHttp2Transport` with `http2: true`). Tests can pass a fake one; see `ametherian-testing`.

**Not covered yet:** streaming *request* bodies, cookies, multipart uploads, SOCKS proxies. See [docs/threat-models/http.md](../../docs/threat-models/http.md).
