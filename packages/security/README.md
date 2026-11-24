# @foulfoxhacks/ametherian-security

**Status: unpublished preview.** Not released to npm, not audited, API may change. It is not a replacement for `npm audit` or a commercial scanner.

Vulnerability-intelligence building blocks, following the workflow in [docs/security.md](../../docs/security.md).

- **`normalizeOsv(record, provenance)`** validates an [OSV](https://ossf.github.io/osv-schema/) record (fields bounded, unknown fields stripped) and attaches **provenance**: source, retrieval time, URL and confidence.
- **`checkAffected(advisory, ecosystem, name, version)`** evaluates OSV `introduced` / `fixed` / `last_affected` / `limit` events and explicit version lists with SemVer precedence. It also reports the first fixed version.
- **`auditLockfile(lockfile, advisories, { maxAgeMs })`** reads npm `package-lock.json` v2/v3 with size and depth limits. Every finding carries provenance, a **`stale`** flag when the intelligence is older than `maxAgeMs` (default 24 h), and **`requiresHumanReview: true`**.

- **`createOsvClient()`** fetches from the OSV API through `ametherian-http`:
  - `queryPackage({ ecosystem, name, version })` follows pagination.
  - `queryBatch([...])` sends one batch query, then fetches each unique advisory.
  - `getVuln(id)` fetches a single advisory.
  - Only HTTPS to the advisory host is allowed: other hosts, redirects elsewhere and http are blocked. Responses are size- and depth-limited, and every record gets provenance.
  - Querying tells the service which packages and versions you use.

```js
const osv = createOsvClient();
const advisories = await osv.queryBatch(packagesFromLockfile(lockText).map((p) => ({ ecosystem: 'npm', name: p.name, version: p.version })));
const report = auditLockfile(lockText, advisories);   // findings for human review
```

There is no automatic remediation: acting on findings stays with a human reviewer, as `docs/security.md` requires. The lockfile audit itself is offline.
