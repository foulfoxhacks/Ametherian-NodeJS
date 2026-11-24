# Resume plan

Use this to pick work back up if a session is cut off. Check items off as they land.

## Where things are

- Local checkout: `E:\Codebase\Ametherian-NodeJS`
- Work branch: `dev/core-foundation` (pushed to `origin`). Never commit to `main` directly; `main` is the live site.
- Audit: `docs/AUDIT.md`
- Tests: `npm test` at repo root (Node ≥ 20, no dependencies to install).
- Site checks (must keep passing): `python scripts/build_site.py && python scripts/check-site.py`

## Steps

1. [x] Fresh clone, confirm `git fsck` clean.
2. [x] Locate blueprint (`docs/*.md`, `AMETHERIAN-PROJECT-BRIEF.txt`).
3. [x] Write `docs/AUDIT.md` and this file; push branch.
4. [x] Workspace scaffold: root `package.json` (private, npm workspaces `packages/*`), `.github/workflows/node-ci.yml`.
5. [x] `packages/core` — typed errors (`src/errors.js`) + tests.
6. [x] `packages/core` — cancellation & deadlines (`src/cancel.js`) + tests.
7. [ ] `packages/core` — resource limits (`src/limits.js`) + tests.
8. [ ] `packages/core` — redaction (`src/redact.js`) + tests.
9. [ ] `packages/core` — runtime capabilities (`src/runtime.js`) + tests.
10. [ ] `packages/core` — config validation helper (`src/config.js`): validate an options object against a small descriptor (type, min/max, allowed values, required), throw `ConfigError` listing every problem. Tests for each rule and for unknown keys.
11. [ ] Open a PR from `dev/core-foundation` to `main` for review. Confirm the site-check workflow still passes.
12. [ ] Write `docs/threat-models/guard.md` (SSRF, DNS rebinding, redirect policy, private ranges, IPv6/IPv4-mapped addresses, URL parsing confusion).
13. [ ] `packages/guard` — destination policy: parse URL, block private/loopback/link-local/metadata ranges by default, explicit allowlist, redirect re-check hook. Use core errors.
14. [ ] Repo hygiene PR (separate): move root scratch scripts and `_pylibs/` out of the served tree; remove dead `build-clean-urls.yml`. Say clearly in the PR that it changes publicly reachable files.

## Conventions

- ESM only, plain JavaScript with hand-written `.d.ts`, zero runtime dependencies in core.
- Every error has a stable `code` string (`AMETHERIAN_*`); tests assert codes, not messages.
- Defaults are conservative; limits are explicit and reported in errors.
- Small commits, push after each step.
