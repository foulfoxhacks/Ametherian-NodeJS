# Compatibility and release policy (draft)

Status: draft for maintainer review · Applies to every package in `packages/` · Date: 2026-11-24

All packages are currently **unpublished previews** (`0.0.0`, `private`). This
policy states what will hold once packages are published; until then any API
may change without notice.

## Runtime support

| Runtime | Support |
|---|---|
| Node.js 20 | **Not supported** — end of life since 2026-04-30 (last release 20.20.2) |
| Node.js 22 LTS (Jod) | Supported, minimum 22.23.5 |
| Node.js 24 LTS (Krypton) | Supported, minimum 24.22.3 |
| Node.js 26 LTS (Lithium) | Supported, minimum 26.13.1 |
| Odd-numbered Node releases | Best effort |
| Deno, Bun, browsers | Not supported yet; `getRuntimeCapabilities()` reports what is available, and packages fail clearly (`UnsupportedCapabilityError`) instead of silently falling back |

Minimums are the latest Node.js *security* release of each line, published as
`NODE_SECURITY_MINIMUMS` in `ametherian-core` (`checkNodeVersion()` /
`assertNodeVersion()`). The daily advisory watch fails when nodejs.org publishes
a newer security release or a line reaches end of life (per the Node.js Release
schedule), so minimums and CI move with upstream fixes to llhttp, OpenSSL and V8.
CI tests every supported major. `engines` declares `>=22`.

## Module format and types

- ESM only (`"type": "module"`, `exports` map). No CommonJS build; Node 20.19+/22.12+ can `require()` ESM for synchronous graphs.
- Types ship as hand-written `.d.ts` files next to the source and are compiled in CI (`npm run typecheck`, TypeScript 5.x, `strict`).
- Deep imports (anything not in a package's `exports`) are not public API.

## Versioning

- [Semantic Versioning 2.0.0](https://semver.org/) per package.
- `0.x` releases: breaking changes may land in minor versions and are called out in the changelog.
- From `1.0.0`: breaking changes only in majors.
- **Public API** = exports listed in each package's `src/index.d.ts`, error `code` strings, documented option names and defaults, and event names/payload fields.
- **Not public API** = error messages, log message text, internal file layout.
- Tightening a security default (for example blocking a newly reserved IP range) may ship in a minor or patch release and is documented as a security change.

## Deprecation

- Deprecated APIs keep working for at least one minor release (in `0.x`) or one major release (from `1.0.0`).
- Deprecations are announced in the changelog and emit a one-time `process.emitWarning` with a code starting `AMETHERIAN_DEP`.

## Dependencies

- No third-party runtime dependencies. Packages may depend on other Ametherian packages.
- Development-only tools (TypeScript, `@types/node`) live in the root `devDependencies` and are not shipped.

## Before the first publish

1. ~~A license is chosen and added~~ Done: Apache License 2.0 (`LICENSE`, `NOTICE`, `LICENSE-STATUS.md`).
2. Package ownership of the `@foulfoxhacks` npm scope is confirmed.
3. Each package has a changelog, README status line, and passes CI on all supported Node majors.
4. Publishing uses npm provenance from CI.
