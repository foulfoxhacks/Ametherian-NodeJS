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

## `ametherian-audit` command

The package ships a command that runs the whole workflow on a lockfile and prints a report:

```sh
npx ametherian-audit                       # ./package-lock.json, fail on high or worse
npx ametherian-audit path/to/package-lock.json --omit-dev --fail-on moderate
npx ametherian-audit --json --output audit.json
npx ametherian-audit --advisories osv.json --no-kev --no-nvd   # fully offline
```

- Advisories come from OSV (one batched query, each `name@version` once), or from a JSON file of OSV records with `--advisories`.
- CVEs are checked against the CISA Known Exploited Vulnerabilities catalog and enriched with NIST NVD CVSS data (`NVD_API_KEY` raises the rate limit). Skip either with `--no-kev` / `--no-nvd`.
- `--fail-on critical|high|moderate|low|any|none` sets the threshold (default `high`). A known exploited finding fails at every level except `none`.
- Exit status: `0` below the threshold, `1` findings at or above it, `2` a usage error or incomplete intelligence. A failed KEV or NVD lookup is never reported as a clean scan, and an empty lockfile is refused.
- Advisory text is stripped of terminal escape sequences and control characters before printing.
- `runAudit(argv, io)` from `@foulfoxhacks/ametherian-security/cli` runs the same command with injected file access, output and clients; it resolves to the exit status.

Running it online tells OSV and NVD which packages and versions you use. This repository's own release gate (`tools/security-audit/lockfile-audit.mjs`) is a thin wrapper around this command.

There is no automatic remediation: acting on findings stays with a human reviewer, as `docs/security.md` requires. The lockfile audit itself is offline.
