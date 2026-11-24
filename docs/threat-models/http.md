# Threat model: `@foulfoxhacks/ametherian-http`

Status: draft for review · Scope: outbound HTTP requests made with `createHttpClient` · Date: 2026-11-24

## Purpose

`ametherian-http` sends HTTP requests on behalf of an application. Destination
checks are delegated to `ametherian-guard` (see [guard.md](guard.md)); this
document covers what the client itself must defend.

## Assets

- Credentials the application attaches (`Authorization`, cookies, API keys in URLs)
- Process memory and sockets (availability)
- Integrity of the request the application meant to send
- Internal network reachability (via guard)

## Trust boundaries

| Input | Trusted? | Notes |
|---|---|---|
| Client and request options | Trusted | Validated; bad config fails with `ConfigError` |
| Request URL | Untrusted when it comes from users | Checked by guard before connecting |
| Response status, headers, body | **Untrusted** | Server may be hostile or compromised |
| `Location` redirect targets | **Untrusted** | Re-checked by guard each hop |
| Proxy (when configured) | Trusted by configuration | Sees request metadata; resolves names itself |

## Threats and mitigations

| # | Threat | Mitigation | Residual risk |
|---|---|---|---|
| H1 | SSRF via request URL, redirect, or DNS answer | Guard `checkUrl`, `checkRedirect` and connect-time `lookup` on every hop; public-only by default | When a proxy is used, the proxy resolves names: guard checks the target name/IP literal but cannot see the proxy's DNS answer |
| H2 | Credential leak on redirect to another origin | `Authorization`, `Cookie`, `Proxy-Authorization` removed on cross-origin hops | Custom credential headers (e.g. `X-Api-Key`) are not stripped; use `stripHeadersOnRedirect` |
| H3 | Downgrade to plain HTTP on redirect | Blocked by default (guard `allowDowngrade: false`) | — |
| H4 | Memory exhaustion from large bodies | `maxResponseBytes` enforced while reading, counted after decompression | Streaming mode leaves consumption to the caller, but the limit is still enforced on the stream |
| H5 | Decompression bombs | Limit applies to decompressed bytes; stream destroyed on overflow | Bounded CPU spent before the limit is hit |
| H6 | Slow or stalled servers (slowloris-style) | Per-attempt deadline (`timeoutMs`) covering connect, headers and body; caller `signal` | — |
| H7 | Header injection (CRLF) from application data | CR/LF in header names or values rejected with `ConfigError` | — |
| H8 | Redirect loops | `maxRedirects` (default 5), max 20 | — |
| H9 | Retry storms and duplicate side effects | Retries only for idempotent methods and retryable errors, bounded count, jittered backoff, `Retry-After` capped by `maxDelayMs` | PUT/DELETE retried by default; disable per request when not idempotent in practice |
| H10 | Unsafe JSON in responses | `res.json()` uses bounded `parseJson` (depth/size, prototype keys dropped) and optional schema | — |
| H11 | Secrets in logs/events | Event payloads carry redacted URLs; observability logger redacts headers | Response bodies are never logged by the client |
| H12 | TLS misconfiguration | Node defaults (certificate and hostname verification on); no option to disable verification is exposed | Custom CA needs a custom transport |
| H13 | Proxy credential exposure | Proxy URL credentials sent only to the proxy as `Proxy-Authorization`, never to the target; proxy URL redacted in errors | Proxy operator sees target host (and full request for plain HTTP) |
| H14 | HTTP/2 specific abuse (stream floods, header compression bombs) | HTTP/2 transport uses Node defaults for `maxHeaderListSize`/settings, per-request deadline and body limit; session closed with the client | HTTP/2 transport is opt-in and less exercised |

## Out of scope

Cookie jars, authentication flows (OAuth), request signing, caching of
responses, browser runtimes.

## Verification

`packages/http/test/*.test.js` runs against real local servers and covers H1
(default policy, redirect to metadata/file URLs), H2, H4/H5 (gzip bomb), H6,
H7, H8, H9 (POST not retried), H10 and H11. Proxy and HTTP/2 tests run local
proxy/HTTP/2 servers.
