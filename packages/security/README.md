# @foulfoxhacks/ametherian-security

**Status: unpublished preview.** Not released to npm, not audited, API may change. It is not a replacement for `npm audit` or a commercial scanner.

Vulnerability-intelligence building blocks, following the workflow in [docs/security.md](../../docs/security.md).

- **`normalizeOsv(record, provenance)`** validates an [OSV](https://ossf.github.io/osv-schema/) record (fields bounded, unknown fields stripped) and attaches **provenance**: source, retrieval time, URL and confidence.
- **`checkAffected(advisory, ecosystem, name, version)`** evaluates OSV `introduced` / `fixed` / `last_affected` / `limit` events and explicit version lists with SemVer precedence. It also reports the first fixed version.
- **`auditLockfile(lockfile, advisories, { maxAgeMs })`** reads npm `package-lock.json` v2/v3 with size and depth limits. Every finding carries provenance, a **`stale`** flag when the intelligence is older than `maxAgeMs` (default 24 h), and **`requiresHumanReview: true`**.

There is no network access and no automatic remediation: fetching advisories (for example from `api.osv.dev`) and acting on findings stay with the caller and a human reviewer, as `docs/security.md` requires.
