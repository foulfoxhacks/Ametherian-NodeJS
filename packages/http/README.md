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
| Headers | Names must be RFC 9110 tokens. Values may not contain control characters (CR, LF, NUL…; tab is allowed). Names are lower-cased. |
| Base URL lock | With `baseUrl` set, absolute or protocol-relative URLs to another origin are refused (`allowAbsoluteUrls: true` to opt out). |
| Request size | `maxRequestBytes` (10 MiB) on every transport, enforced while a streamed body is read. |
| Pool | `maxSocketsPerOrigin` (50), `maxTotalSockets` (256). |
| Prototype pollution | Options are read from own properties only, and every security-relevant Node option is pinned, so a polluted `Object.prototype` cannot disable TLS checks, redirect sockets or inject headers. |
| Events | `http.request`, `http.response`, `http.redirect`, `http.retry`, `http.error` on an optional `hooks` event hub, with redacted URLs. |

| Streaming | `{ stream: true }` returns `HttpStreamResponse`: `body` is a web `ReadableStream`, with `bytes()`/`text()`/`json()`/`cancel()`. The size limit and the request deadline keep applying while the body is read. |
| Streamed request bodies | `body` may be a web `ReadableStream` or any async iterable (Node streams included) of `Uint8Array`, `ArrayBuffer`, typed-array or string chunks. It is sent chunked (HTTP/1.1) or as DATA frames (HTTP/2), or with `content-length` when you pass the exact `contentLength`, which is then enforced. The body is read once: it is never retried, a 307/308 redirect throws `AMETHERIAN_STREAM_BODY_REDIRECT` instead of resending an empty body, and the source is cancelled on abort, error or the size limit. On the fetch transport it is sent with `duplex: 'half'`. |
| Extra redirect stripping | `stripHeadersOnRedirect: ['x-api-key']` removes more headers on cross-origin hops. |
| Proxy | `proxy: 'http://user:pass@proxy:8080'`. http:// targets are sent in absolute form; https:// targets are tunnelled with CONNECT, with TLS end to end. Proxy credentials go only to the proxy. The proxy resolves names, so the guard checks the target URL but can't check the proxy's DNS answer. |
| HTTP/2 | `http2: true` uses one session per origin over TLS (ALPN h2) or h2c for `http://`. The guard lookup, limits and deadlines still apply. HTTP/2 through a proxy is not supported. |
| Custom CA | `ca: pem` for private or test certificate authorities. There is no option to turn off certificate verification. |

## `fetch()` (undici-style)

```js
import { createFetch } from '@foulfoxhacks/ametherian-http';
const fetch = createFetch({ timeoutMs: 10_000 });
const res = await fetch('https://api.example.com/items', { method: 'POST', body: JSON.stringify(item), headers: { 'content-type': 'application/json' } });
console.log(res.status, await res.json());   // standard Response
```

It returns standard `Response` objects and supports `redirect: 'follow' | 'manual' | 'error'`. All of the client's protections still apply: guard, limits, deadlines and credential stripping. Failures reject with typed Ametherian errors rather than a bare `TypeError`. Retries are off by default, as with fetch. There are no cookies, cache or CORS.

It is meant as a drop-in for Node's `fetch()`:

- `headers` takes every `HeadersInit` form: a `Headers`, an object, or an array of `[name, value]` pairs. Repeated names are joined with `, `, as `Headers` joins them.
- `cache` has no cache behind it, but each mode adds the request headers `fetch()` sends for it: `no-cache` sends `cache-control: max-age=0`, `no-store` and `reload` send `pragma: no-cache` and `cache-control: no-cache`, and so does a default request with a conditional header such as `if-none-match`.
- A `Request`'s own `redirect`, `cache` and `integrity` apply unless `init` overrides them.
- `credentials`, `mode: 'cors' | 'no-cors'`, `keepalive`, `priority`, `referrerPolicy` and `duplex: 'half'` are accepted and have no effect, as on any server-side fetch.
- Anything it cannot honour throws a `ConfigError` (`AMETHERIAN_CONFIG`) instead of being ignored: a non-empty `integrity`, a `referrer` URL, `mode: 'same-origin'`, `cache: 'only-if-cached'`, an undici `dispatcher`, a runtime-specific option such as Workers' `cf`, and any unknown key.
- `Blob` and `FormData` bodies are not supported yet; send a string, bytes or `URLSearchParams`.

## Vulnerability model

Every published axios and undici advisory (111 so far) is mapped in [docs/vulnerability-baseline.json](../../docs/vulnerability-baseline.json): either prevented, with a regression test named by its GHSA/CVE ID (`test/cve-regressions.test.js`, `test/prototype-pollution.test.js`), or not applicable, with the reason. A daily workflow checks OSV and NIST NVD for new ones. See [docs/vulnerability-model.md](../../docs/vulnerability-model.md).

**Transport:** the client talks to a small transport function (`createNodeTransport` by default, `createHttp2Transport` with `http2: true`). Tests can pass a fake one; see `ametherian-testing`.

**Not covered yet:** streaming *request* bodies, cookies, multipart uploads, SOCKS proxies. See [docs/threat-models/http.md](../../docs/threat-models/http.md).
