# Threat model: `@foulfoxhacks/ametherian-security`

Status: draft for review · Scope: vulnerability intelligence ingestion and lockfile audit · Date: 2026-11-24

## Purpose

Help maintainers see which dependencies are affected by published advisories,
with enough provenance to judge the information. Findings inform human review;
they never change code (see `docs/security.md`).

## Trust boundaries

| Input | Trusted? | Notes |
|---|---|---|
| Advisory feeds (OSV API, files) | **Untrusted** | Can be wrong, stale, malformed or spoofed |
| Lockfile | Semi-trusted | Comes from the repository but may be large or malformed |
| Audit options | Trusted | |

## Threats and mitigations

| # | Threat | Mitigation | Residual risk |
|---|---|---|---|
| V1 | Malformed or oversized advisory data | Records validated with bounded schemas (field lengths, array sizes); unknown fields stripped | — |
| V2 | Spoofed advisory source (fetch redirected to attacker) | Fetch adapter uses `ametherian-http` with HTTPS-only policy, no downgrade, response size limit; source URL recorded in provenance | TLS trust is the system CA store |
| V3 | Stale intelligence treated as current | Every advisory carries `retrievedAt`; findings flag `stale` past `maxAgeMs` | — |
| V4 | Over-trusting findings (automatic dependency changes) | Findings always `requiresHumanReview: true`; no remediation API | — |
| V5 | Wrong match from unusual versions | Strict SemVer parsing; unparseable versions reported as not affected with a reason instead of guessing | Non-SemVer ecosystems are not evaluated |
| V6 | Withdrawn advisories causing noise | `withdrawn` advisories never match | — |
| V7 | Lockfile parsing DoS (huge/deep JSON) | Parsed with `parseJson` size (50 MB) and depth (32) limits | — |
| V8 | Prototype pollution through advisory or lockfile JSON | Bounded parsing drops prototype keys; records rebuilt from declared fields | — |
| V9 | Leaking which dependencies a project uses to a third party | Lockfile audit is offline; the OSV query adapter sends package names/versions only when the caller uses it | Using the adapter discloses queried packages to the advisory service |
| V10 | Terminal escape injection through advisory text printed by `ametherian-audit` | ANSI/OSC/DCS sequences, C0/C1 controls and bidirectional overrides are stripped before printing; JSON output is escaped by `JSON.stringify` | — |
| V11 | A partial scan read as clean (an intelligence source failed or the lockfile lists nothing) | `ametherian-audit` exits 2 and reports `complete: false` when KEV or NVD lookups fail; a lockfile with no installed packages is refused; a KEV catalog dated in the future is rejected | An OSV outage aborts the run rather than degrading it |

## Verification

`packages/security/test` covers V1, V3–V8 with a synthetic advisory; fetch
adapter tests use the mock transport so no network is touched.
`packages/security/test/cli.test.js` covers V10 and V11 with injected clients,
and runs the `ametherian-audit` executable offline against this repository's
lockfile.
