# Resume plan

Use this to pick work back up if a session is cut off. Check items off as they land.

## Where things are

- Local checkout: `E:\Codebase\Ametherian-NodeJS`
- `main` is the live site (GitHub Pages). Never commit to it directly. Work on a branch and open a PR.
- Merged so far: #9 (audit, core), #10 (config validation, guard, CI fix), #11 (Node 20 fix, lifecycle/events, schema).
- Open: #12 from `dev/modules` (cache, resilience, observability, http, testing, security, meta package).
- Audit: `docs/AUDIT.md`. Threat model: `docs/threat-models/guard.md`.
- Tests: `npm ci && npm test` at repo root (Node ≥ 20.6; no third-party dependencies). 185 tests across 10 packages.
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
| `ametherian-http` | 17 | core, guard, resilience, schema |
| `ametherian-testing` | 8 | core (dev: http, guard, schema, cache) |
| `ametherian-security` | 8 | core, schema |
| `ametherian` (meta) | 2 | all except testing |

## Done

1. [x] Fresh clone, audit, resume plan.
2. [x] Workspace + Node CI (20/22/24, `npm ci`, fail-fast off).
3. [x] core: errors, cancellation/deadlines, limits, redaction, runtime capabilities, config validation, lifecycle scope, event hub.
4. [x] guard threat model + destination policy (URL, redirect, DNS-time checks).
5. [x] schema, cache, resilience, observability, http, testing, security, meta package.

## Next steps (in order)

6. [ ] Get #12 reviewed and merged. Check Node CI on all three versions.
7. [ ] Type-check the hand-written `.d.ts` files: add a CI job running `tsc --noEmit` against a small usage file (TypeScript as a devDependency only).
8. [ ] Threat models for `http`, `schema`, `cache` and `security` in `docs/threat-models/`, using the same table format as `guard.md`.
9. [ ] Write the compatibility policy (`docs/compatibility.md`): Node versions, ESM-only decision, semver and deprecation windows.
10. [ ] Choose a license (see `LICENSE-STATUS.md`). This is the maintainer's decision. Publishing is blocked until then.
11. [ ] http: proxy support (with guard running at the proxy boundary), streaming bodies, HTTP/2 evaluation.
12. [ ] security: fetch adapters (OSV API, GHSA) through `ametherian-http`, keeping provenance. Findings stay report-only.
13. [ ] Repo hygiene PR (separate): move root scratch scripts and `_pylibs/` out of the served tree; remove the dead `build-clean-urls.yml`. Say clearly in the PR that it changes publicly reachable files.
14. [ ] Update `PROJECT_STATUS.md` / site copy to mention preview packages, but only once the maintainer agrees on wording. It is public text.

## Conventions

- ESM only, plain JavaScript with hand-written `.d.ts`, zero third-party runtime dependencies.
- Every error has a stable `code` string (`AMETHERIAN_*`); tests assert codes, not messages.
- Defaults are conservative; limits are explicit and reported in errors.
- New packages: copy the `package.json` shape from an existing package (private, `UNLICENSED`, `engines.node >=20`, `exports` with `types`), then run `npm install` to update the lockfile.
- Small commits, one per module; push after each.
