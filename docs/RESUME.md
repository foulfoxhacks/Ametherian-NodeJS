# Resume plan

Use this to pick work back up if a session is cut off. Check items off as they land.

## Where things are

- Local checkout: `E:\Codebase\Ametherian-NodeJS`. `main` is the live site (GitHub Pages, https://ametherian.foulfoxhacks.dev/). Work on a branch and open a PR.
- Merged: #9–#13, #18, #19, #20 (packages, hardening, vulnerability model, site i18n/themes, releases).
- Tests: `npm ci && npm test` (Node 22, 24 or 26), plus `npm run typecheck`.
- Site: `python scripts/build_site.py && python scripts/build_text_pages.py && python scripts/check-site.py`. CI fails if the committed site differs from a fresh build or a translation is missing.
- Releases: every green push to `main` publishes a GitHub pre-release `v<version>-build.<run>` (`.github/workflows/release.yml`, notes from `CHANGELOG.md`).
- Advisory watch: daily `.github/workflows/advisory-watch.yml` (OSV, GitHub advisories, NIST NVD, Node.js releases).

## Routine tasks

**Changing site copy or modules**
1. Edit the page source in `scripts/sitegen/` (or the package / `CHANGELOG.md`).
2. Rebuild, then run `python scripts/i18n_extract.py --write` to see untranslated segments.
3. Translate: write `N|text` lines in `i18n/source.json` order and run `python scripts/i18n_import.py <code> <file>` for each of es, pt-br, de, fr, ru, ja, zh-cn.
4. Rebuild, check, commit.

**When the advisory watch fails**
1. Read the job summary (new GHSA/CVE with NVD CVSS/CWE, or a Node.js line that needs a new minimum).
2. Advisory: add a regression test or a not-applicable reason, map it in `tools/advisory-watch/classes.json`, then `node tools/advisory-watch/watch.mjs --write-cache osv.json && node tools/advisory-watch/build-baseline.mjs osv.json`.
3. Node.js: raise `NODE_SECURITY_MINIMUMS` in `packages/core/src/integrity.js`; for an end-of-life line, also update CI, `engines` and `docs/compatibility.md`.

**Releasing a new version**
1. Move the `Unreleased` section of `CHANGELOG.md` under a version heading.
2. Bump `version` in the root and every `packages/*/package.json` (and internal dependency ranges).
3. Merge to `main`; the release workflow tags `v<version>-build.N`.

## Done

- [x] Ten preview packages (core, guard, schema, cache, resilience, observability, http, testing, security, ametherian) at 0.1.0.
- [x] Vulnerability model: 111 axios/undici advisories mapped (64 prevented with named tests, 47 not applicable).
- [x] Residual risks: fail-closed pollution check, `lockdownPrototypes()`, Node.js security minimums (Node 20 dropped, end of life).
- [x] Threat models, compatibility policy, strict type checks.
- [x] Site: modules and changelog pages, 8 languages with sitemap index, light/dark themes, mobile layout.
- [x] Releases per green build with tarballs and checksums.
- [x] Repo hygiene: scratch scripts, vendored Python libraries and dead workflows removed from the published tree.
- [x] security: CISA Known Exploited Vulnerabilities adapter; lockfile audit findings flag actively exploited CVEs.

## Next steps

1. [ ] **Owner decision:** choose a license (`LICENSE-STATUS.md`). Publishing to npm is blocked until then.
2. [ ] **Owner decision:** have a fluent speaker review each of the seven translations.
3. [ ] Optional: add an `NVD_API_KEY` repository secret to speed up the advisory watch.
4. [ ] security: CLI that prints an audit report for a lockfile.
5. [ ] http: streaming request bodies; opt-in cookie jar (would move cookie advisories into scope: add regression tests first).

## Conventions

- ESM only, plain JavaScript with hand-written `.d.ts`, zero third-party runtime dependencies (enforced by `packages/ametherian/test/supply-chain.test.js`).
- Every error has a stable `AMETHERIAN_*` code; tests assert codes, not messages.
- Defaults are conservative; limits are explicit and reported in errors.
- Small commits; push after each.
