# Ametherian code audit

Audit date: 2026-11-24 · Audited commit: `798c70e` (main) · Branch for new work: `dev/core-foundation`

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

| Module / area | Blueprint source | Status before this branch | Status on `dev/core-foundation` | Notes |
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
| `ametherian-http` / `ametherian-transport` | brief, packages: networking | Missing | Missing | Depends on core + guard |
| `ametherian-schema` | packages: data & serialization | Missing | Done | Composable validators, all-issues errors, pollution-safe objects, bounded `parseJson` |
| `ametherian-cache` | packages: app infrastructure | Missing | Done | Bounded LRU/TTL, size budget, load de-duplication, collision-free scopes |
| `ametherian-resilience` (retries, concurrency, rate limits, circuit breaker) | packages: app infrastructure; brief: queues, retries, rate limiting | Missing | Done | Not in the brief's example names; added as its own focused package |
| `ametherian-observability` | packages: observability | Missing | Done | Redacting structured logger, bounded-cardinality metrics + Prometheus text, event hub and diagnostics_channel bridges |
| `ametherian-testing` | packages: observability & DX | Missing | Missing | |
| `ametherian-security` (vuln intelligence, supply chain) | security: vulnerability intelligence | Missing | Missing | Ingestion must keep provenance; no unreviewed code changes |
| `@foulfoxhacks/ametherian` meta package | brief | Missing | Missing | Only after several packages exist |
| Threat models (per package family) | roadmap: specs & threat models | Doc only | Partial | `docs/threat-models/guard.md` written; others pending |
| Compatibility policy (Node versions, ESM/CJS, TS, semver) | architecture: compatibility | Doc only | Partial | Core declares Node ≥ 20, ESM only, bundled `.d.ts` |
| Public website | README, site files | Done | Unchanged | Do not alter canonicals, sitemap, robots without saying so |

## Repository hygiene findings (not fixed here)

- Root holds many one-off scripts and scratch files from site work
  (`_check1.py`, `_compose.py`, `_enc.py`, `_hrefs*.py`, `_inspect_*.txt`,
  `_asset_test.*`, `_test_*.png`, `audit.py`, `contrast.py`, `db*.py`, etc.),
  plus a vendored Python tree (`_pylibs/` with numpy/potrace) and `python/`.
  Because the site is served from the repo root, these are publicly reachable.
  Recommend moving them out or into an ignored folder in a separate PR.
- `.github/workflows/build-clean-urls.yml` only triggers on the merged branch
  `fix/clean-public-urls`; it is now dead and could be removed.

## Wording rules carried forward

Per `PROJECT_STATUS.md`: nothing here makes Ametherian production-ready,
audited, or a drop-in replacement. `ametherian-core` on this branch is
unpublished preview code with unit tests only.
