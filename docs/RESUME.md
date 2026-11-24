# Resume plan

Use this to pick work back up if a session is cut off. Check items off as they land.

## Where things are

- Local checkout: `E:\Codebase\Ametherian-NodeJS`
- `main` is the live site (GitHub Pages). Never commit to it directly. Work on a branch and open a PR.
- Merged so far: #9 (audit, core), #10 (config validation, guard, CI fix), #11 (Node 20 fix, lifecycle/events, schema).
- Open: #12 from `dev/modules` (cache, resilience, observability, http, testing, security, meta package).
- Audit: `docs/AUDIT.md`. Threat model: `docs/threat-models/guard.md`.
- Tests: `npm ci && npm test` at repo root (Node ≥ 20.6). 231 tests across 10 packages. Types: `npm run typecheck`.
- Site checks (must keep passing): `python scripts/build_site.py && python scripts/check-site.py`

## Packages (`packages/*`, all `private`, `UNLICENSED`, unpublished)

| Package | Tests | Depends on |
|---|---|---|
| `ametherian-core` | 68 | — |
| `ametherian-guard` | 36 | core |
| `ametherian-schema` | 13 | core |
| `ametherian-cache` | 8 | core |
| `ametherian-resilience` | 15 | core |
| `ametherian-observability` | 10 | core |
| `ametherian-http` | 50 | core, guard, resilience, schema |
| `ametherian-testing` | 8 | core (dev: http, guard, schema, cache) |
| `ametherian-security` | 18 | core, schema, guard, http, resilience (dev: testing) |
| `ametherian` (meta) | 5 | all except testing |

## Done

1. [x] Fresh clone, audit, resume plan.
2. [x] Workspace + Node CI (20/22/24, `npm ci`, fail-fast off).
3. [x] core: errors, cancellation/deadlines, limits, redaction, runtime capabilities, config validation, lifecycle scope, event hub.
4. [x] guard threat model + destination policy (URL, redirect, DNS-time checks).
5. [x] schema, cache, resilience, observability, http, testing, security, meta package.

## Done in the gap-fixing pass

6. [x] Strict `tsc` check of every `.d.ts` in CI (`types-check/`, TypeScript as a root devDependency only).
7. [x] Threat models for http, schema, cache, security (`docs/threat-models/`).
8. [x] Compatibility policy draft (`docs/compatibility.md`).
9. [x] http: streaming response bodies, proxy (absolute-form + CONNECT), opt-in HTTP/2, custom CA, `stripHeadersOnRedirect`.
10. [x] security: OSV API adapter with provenance.

## Done: axios/undici vulnerability pass

10a. [x] Pulled all 111 published axios/undici advisories (OSV/GHSA + NVD CVE ids). Fixed the gaps they exposed: baseUrl escape, prototype-pollution gadgets incl. Node URL detection and TLS options, header control chars, missing request-body limit.
10b. [x] `cve-regressions.test.js`, `prototype-pollution.test.js`, supply-chain policy test.
10c. [x] `docs/vulnerability-baseline.json` + `tools/advisory-watch/` (classes, builder, watcher) + daily workflow; NVD client.
10d. [x] undici-style `createFetch()`; socket pool limits.

**When the advisory watch fails:**
1. Read the job summary (new GHSA, CVE, NVD CVSS/CWE).
2. Write a regression test, or record a not-applicable reason.
3. Add the GHSA ID to `tools/advisory-watch/classes.json`.
4. Run `node tools/advisory-watch/watch.mjs --write-cache osv.json` and then `node tools/advisory-watch/build-baseline.mjs osv.json`.
5. Commit.

## Next steps (in order)

11. [ ] Get #12 reviewed and merged. Check CI on all Node versions plus typecheck.
12. [ ] **Maintainer decision:** choose a license (`LICENSE-STATUS.md`). Publishing is blocked until then.
13. [ ] **Maintainer decision:** sign off `docs/compatibility.md` and the threat models.
14. [ ] http: streaming request bodies; cookie jar (opt-in); SOCKS proxy evaluation.
15. [ ] security: CISA KEV adapter (same provenance model); CLI wrapper that prints an audit report; consider watching more HTTP stacks (got, node-fetch).
15b. [ ] Optional: add an `NVD_API_KEY` repository secret to speed up the advisory watch.
16. [ ] Repo hygiene PR (separate): move root scratch scripts and `_pylibs/` out of the served tree; remove the dead `build-clean-urls.yml`. Say clearly in the PR that it changes publicly reachable files.
17. [ ] Update `PROJECT_STATUS.md` / site copy to mention preview packages, but only once the maintainer agrees on wording. It is public text.

## Conventions

- ESM only, plain JavaScript with hand-written `.d.ts`, zero third-party runtime dependencies.
- Every error has a stable `code` string (`AMETHERIAN_*`); tests assert codes, not messages.
- Defaults are conservative; limits are explicit and reported in errors.
- New packages: copy the `package.json` shape from an existing package (private, `UNLICENSED`, `engines.node >=20`, `exports` with `types`), then run `npm install` to update the lockfile.
- Small commits, one per module; push after each.
