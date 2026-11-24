# Changelog

All notable changes to Ametherian are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Every push to `main` that passes CI
is published as a numbered preview build (`vX.Y.Z-build.N`) on GitHub Releases
with these notes. Packages are unpublished previews until a license is chosen.

## Unreleased

### Added
- Site: light and dark themes with a System / Light / Dark switch, a mobile pass across every page, and full translations into Español, Português (Brasil), Deutsch, Français, Русский, 日本語 and 简体中文 with `hreflang` alternates.
- Site: `/sitemap.xml` is now a sitemap index with one sub-sitemap per language under `/sitemaps/`, styled for browsers with the site header.
- Site: Modules page generated from the packages themselves, and this changelog page.
- Releases: a numbered preview build with release notes and package tarballs for every green push to `main`.

### Changed
- Sitemap `lastmod` dates now change only when a page's content changes.
- The `llms.txt` and `robots.txt` companion pages use the full site header and footer.

### Removed
- The obsolete `/llms/` resource directory page, nav item and footer link.

## 0.1.0 — 2026-11-24

First preview of all ten packages. Unpublished, unaudited, license not chosen.

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
