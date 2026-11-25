# Ametherian code audit

Audit date: 2026-11-24 · First audited commit: `798c70e` (main, before any package code) · Statuses below updated through branch `dev/modules` (PR #12)

## Blueprint sources

The project outline lives in these files. They are the reference for every status below.

| File | What it defines |
|---|---|
| `AMETHERIAN-PROJECT-BRIEF.txt` | Scope, design principles, proposed package names |
| `README.md` | Principles, naming (`@foulfoxhacks` scope), status disclaimer |
| `docs/vision.md` | Why an ecosystem; boundaries; principles |
| `docs/architecture.md` | Shared contracts (typed errors, cancellation, deadlines, lifecycle, config validation, logging hooks), runtime boundaries, resource safety, compatibility policy |
| `docs/packages.md` | Package families: networking, data, app infrastructure, security, observability/DX |
| `docs/security.md` | Threat-model areas, secure engineering practices, vulnerability-intelligence sources |
| `docs/roadmap.md` | Stages: research → specs/threat models → implementation/verification → release readiness |
| `PROJECT_STATUS.md` | Current status table and wording rules |

## What the repository is today

The repository is the **public proposal website** served by GitHub Pages at
`https://ametherian.foulfoxhacks.dev/` (via `CNAME`, `.nojekyll`). It contains
generated HTML pages, a Python site generator (`scripts/build_site.py`,
`scripts/sitegen/`), a site checker (`scripts/check-site.py`), brand assets
(`assets/`), `sitemap.xml`/`robots.txt`/`llms.txt`, and CI that builds and
checks the site.

There is **no JavaScript or TypeScript package code**: no `package.json`, no
`packages/`, no tests for library code.

### Indexing safety

The site build reads an explicit list of pages (`scripts/build_site.py`, the
`docs/*.html` map). New Markdown files in `docs/` and a new `packages/`
folder are not turned into pages and are not added to the sitemap. With
`.nojekyll`, GitHub Pages will still serve them as raw files once merged to
`main` (for example `/docs/AUDIT.md`), but nothing links to them from the site
and canonical URLs, `sitemap.xml` and `robots.txt` are unchanged.

## Module-by-module status

Status key: **Missing** = no code; **Partial** = some code exists but not to spec; **Done** = implemented with tests; **Doc only** = described in the blueprint, no code expected yet.

| Module / area | Blueprint source | Status at first audit | Current status | Notes |
|---|---|---|---|---|
| Monorepo tooling (npm workspaces, test runner, CI for Node) | architecture: compatibility & releases | Missing | Done | No runtime deps; Node ≥ 20 |
| `@foulfoxhacks/ametherian-core` — typed errors | architecture: shared contracts | Missing | Done | `AmetherianError` + subclasses, stable `code`, `retryable`, `cause` |
| `ametherian-core` — cancellation & deadlines | architecture: shared contracts, resource safety | Missing | Done | `createDeadline`, `throwIfAborted`, `abortable` |
| `ametherian-core` — resource limits | architecture: resource safety; security: bounded resource use | Missing | Done | `assertWithinLimit`, byte-limit transform for streams |
| `ametherian-core` — redaction | security: avoid logging secrets | Missing | Done | `redactHeaders`, `redactUrl` |
| `ametherian-core` — runtime capability reporting | brief: clear runtime capability reporting; architecture: runtime boundaries | Missing | Done | `getRuntimeCapabilities`, `requireCapability` |
| `ametherian-core` — config validation | architecture: shared contracts | Missing | Done | `validateOptions`: collects all problems, rejects unknown keys, ignores inherited keys |
| `ametherian-core` — lifecycle / logging hooks | architecture: shared contracts | Missing | Done | `createResourceScope` (LIFO, once, all failures reported), `createEventHub` (isolated listeners) |
| `ametherian-guard` — destination policy (SSRF, redirects, DNS rebinding) | security: threat-model areas | Missing | Done | `classifyAddress`, `createDestinationPolicy` (`checkUrl`, `checkRedirect`, `lookup`); threat model in `docs/threat-models/guard.md` |
| `ametherian-http` / `ametherian-transport` | brief, packages: networking | Missing | Done (http); transport is an interface inside http | Guarded destinations incl. DNS time, credential stripping on cross-origin redirects (plus configurable extras), decompression-safe body limits, deadlines, idempotent-only retries, streaming response bodies, HTTP proxy (absolute-form + CONNECT), opt-in HTTP/2, custom CA. Threat model `docs/threat-models/http.md`. No streaming request bodies, cookies or SOCKS |
| `ametherian-schema` | packages: data & serialization | Missing | Done | Composable validators, all-issues errors, pollution-safe objects, bounded `parseJson` |
| `ametherian-cache` | packages: app infrastructure | Missing | Done | Bounded LRU/TTL, size budget, load de-duplication, collision-free scopes |
| `ametherian-resilience` (retries, concurrency, rate limits, circuit breaker) | packages: app infrastructure; brief: queues, retries, rate limiting | Missing | Done | Not in the brief's example names; added as its own focused package |
| `ametherian-observability` | packages: observability | Missing | Done | Redacting structured logger, bounded-cardinality metrics + Prometheus text, event hub and diagnostics_channel bridges |
| `ametherian-testing` | packages: observability & DX | Missing | Done | Mock transport, test server, fake clock, deterministic adversarial fuzz corpus (used to fuzz schema and guard) |
| `ametherian-security` (vuln intelligence, supply chain) | security: vulnerability intelligence | Missing | Partial | OSV fetch (HTTPS-only, host-locked) and normalisation with provenance, SemVer range matching, lockfile audit with staleness + human-review flag. Not yet: GHSA/NVD/CISA KEV adapters, build provenance/attestation checks |
| `@foulfoxhacks/ametherian` meta package | brief | Missing | Done | Re-exports packages as namespaces (testing excluded) |
| Threat models (per package family) | roadmap: specs & threat models | Doc only | Done for shipped security-sensitive packages | `docs/threat-models/`: guard, http, schema, cache, security. Resilience/observability not modelled separately |
| Compatibility policy (Node versions, ESM/CJS, TS, semver) | architecture: compatibility | Doc only | Done (draft) | `docs/compatibility.md`; CI on Node 20/22/24 plus strict `tsc` check of all `.d.ts` (`types-check/`). Needs maintainer sign-off |
| Vulnerability prevention model (axios/undici advisories vs OSV + NIST NVD) | security: vulnerability intelligence; regression tests for confirmed vulnerabilities | Missing | Done | `docs/vulnerability-model.md`, `docs/vulnerability-baseline.json` (111 advisories: 64 prevented with named tests, 47 not applicable), daily `advisory-watch.yml` |
| undici-style `fetch()` and pooled transport | brief: Axios/Undici comparison | Missing | Done | `createFetch` returns standard `Response`; per-origin and total socket limits |
| License | LICENSE-STATUS.md | Not chosen | Not chosen | Maintainer decision; blocks publishing. Packages are `private`/`UNLICENSED` |
| Public website | README, site files | Done | Unchanged | Do not alter canonicals, sitemap, robots without saying so |

## Repository hygiene

Fixed on 2026-11-25: one-off scratch scripts (including several that read a
local AI-assistant session database and contained a local user path), dumped
HTML inspection files, test images, the 55 MB vendored `_pylibs/` tree and two
workflows that only triggered on long-merged branches were removed from the
published tree. They remain in git history. Root-level `_*.py` files are now
ignored so scratch work cannot be published by accident.

## Wording rules carried forward

Per `PROJECT_STATUS.md`: nothing here makes Ametherian production-ready,
audited, or a drop-in replacement. `ametherian-core` on this branch is
unpublished preview code with unit tests only.
