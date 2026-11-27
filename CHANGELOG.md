# Changelog

All notable changes to Ametherian are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Every push to `main` that passes CI
is published as a numbered preview build (`vX.Y.Z-build.N`) on GitHub Releases
with these notes. Packages are unpublished previews until a license is chosen.

## Unreleased

### Added
- `ametherian-http`: streamed request bodies. `body` accepts a web `ReadableStream` or any async iterable (Node streams included), sent chunked, as HTTP/2 DATA frames, or with an exact `contentLength` that is enforced. `maxRequestBytes` is counted while the body is read and the source is cancelled at the limit, on abort or on error. A stream body is never retried, and a 307/308 redirect throws `AMETHERIAN_STREAM_BODY_REDIRECT` rather than resending it empty. Works on the Node, HTTP/2 and fetch transports, and `createFetch()` accepts a stream body with `duplex: 'half'` as fetch() does.
- `ametherian-security`: `ametherian-audit` command. It audits an npm lockfile against OSV, flags CVEs in CISA KEV, adds NVD CVSS data and prints a text or JSON report. `--fail-on` sets the severity that fails the run (known exploited findings always fail), `--omit-dev` skips development packages, and `--advisories` runs it offline from a file. It exits 2 when any intelligence source fails, so a partial scan is never reported clean, and strips terminal escape sequences from advisory text. The repository's own release gate now uses it.
- `ametherian-youtube-chat` (new package): YouTube live chat reader for Node.js and Cloudflare Workers. It finds a stream's chat from a video ID, channel ID or @handle, polls it and returns normalized messages (text, Super Chats and Stickers, memberships, gifts, deletions, author badges). Every body is size-bounded, every request has a deadline, inputs are validated IDs, and requests only go to the fixed YouTube origin. Tests use an anonymized recorded chat page plus synthetic fixtures for paid and membership items.
- License: the project and every package are licensed under the Apache License 2.0 (`LICENSE`, `NOTICE`, also shipped in each package tarball).
- Site: light and dark themes with a System / Light / Dark switch, a mobile pass across every page, and full translations into Español, Português (Brasil), Deutsch, Français, Русский, 日本語 and 简体中文 with `hreflang` alternates.
- Site: `/sitemap.xml` is now a sitemap index with one sub-sitemap per language under `/sitemaps/`, styled for browsers with the site header.
- Site: Modules page generated from the packages themselves, and this changelog page.
- Releases: a numbered preview build with release notes and package tarballs for every green push to `main`.
- `ametherian-security`: CISA Known Exploited Vulnerabilities client; `annotateWithKev()` flags lockfile findings that are exploited in the wild and lists them first.
- `ametherian-frontmatter` (new package): strict, bounded YAML frontmatter parser with a gray-matter-shaped result. It refuses anchors, aliases, tags, merge keys, duplicate keys and prototype keys, never evaluates code, and caps input size, depth and key count.
- `ametherian-http`: edge build for Cloudflare Workers, Deno and browsers, selected by the `workerd`/`worker`/`browser`/`deno` export conditions (or `ametherian-http/edge`). `createFetchTransport()` runs the client over fetch() with the same guard, redirect, size and timeout rules; Node-only options (`ca`, `proxy`, `http2`) throw instead of being ignored.

### Changed
- `ametherian-http` `createFetch()` is now a closer drop-in for Node's `fetch()`. `headers` accepts arrays of `[name, value]` pairs (#25). `cache` modes add the request headers fetch() sends for them, including `pragma`/`cache-control: no-cache` on a default request with a conditional header. A `Request`'s own `redirect`, `cache` and `integrity` are honoured, where `redirect` was previously ignored. Options it cannot honour (non-empty `integrity`, a `referrer` URL, `mode: 'same-origin'`, `cache: 'only-if-cached'`, `dispatcher`, runtime-specific keys such as `cf`, unknown keys) throw `AMETHERIAN_CONFIG` instead of being silently dropped.
- Edge portability: `core`, `guard`, `schema`, `observability` and the http edge build no longer import Node built-ins statically or use `Buffer`; `guard` validates IP literals itself (cross-checked against `node:net` by a fuzz test), and Node-only features load lazily. A test walks every edge import graph to keep it that way.
- Site copy no longer states a fixed package count.
- Sitemap `lastmod` dates now change only when a page's content changes.
- The `llms.txt` and `robots.txt` companion pages use the full site header and footer.

### Removed
- The obsolete `/llms/` resource directory page, nav item and footer link.
- One-off scratch scripts (some contained a local user path), inspection dumps, test images, the vendored `_pylibs/` Python tree and two dead workflows from the published site.

## 0.1.0 — 2026-11-24

First preview of all ten packages. Unpublished and unaudited; licensed under Apache 2.0 from the next build.

### Added
- `@foulfoxhacks/ametherian-core`: typed errors with stable codes, deadlines and cancellation, resource limits, redaction, runtime capability reporting, config validation, lifecycle scopes, event hooks, prototype-pollution detection and lockdown, Node.js security minimums.
- `@foulfoxhacks/ametherian-guard`: outbound destination policy against SSRF, with redirect and DNS-time checks.
- `@foulfoxhacks/ametherian-schema`: validators and bounded JSON parsing for untrusted input.
- `@foulfoxhacks/ametherian-cache`: bounded LRU/TTL cache.
- `@foulfoxhacks/ametherian-resilience`: retry, concurrency limit, rate limiter, circuit breaker.
- `@foulfoxhacks/ametherian-observability`: redacting logger, bounded metrics, event bridges.
- `@foulfoxhacks/ametherian-http`: hardened HTTP client and undici-style `fetch()`, with streaming, proxy, HTTP/2 and custom CA.
- `@foulfoxhacks/ametherian-testing`: mock transport, test server, fake clock, fuzz corpus.
- `@foulfoxhacks/ametherian-security`: OSV and NIST NVD clients with provenance, lockfile audit, Node.js release checks.
- `@foulfoxhacks/ametherian`: umbrella package.
- Vulnerability prevention model: all 111 published axios and undici advisories mapped (64 prevented with named regression tests, 47 not applicable), and a daily advisory watch.
- Threat models for guard, http, schema, cache and security, and a compatibility policy.

### Security
- Fixed before release: `baseUrl` escape via absolute URLs, prototype-pollution gadgets reaching Node's HTTP and TLS options, missing header control-character validation, missing request-body limit, and a proxy bypass when tunnelling HTTPS.
- Requests fail closed while `Object.prototype` is polluted.
- Node.js 20 dropped: end of life on 2026-04-30. Supported: Node.js 22, 24 and 26 at their latest security releases.

## 0.0.0 — 2026-11-23

### Added
- Project vision, package taxonomy, architecture direction, security principles and roadmap.
- Static project site with SEO, Open Graph, sitemap, `robots.txt` and `llms.txt`.
