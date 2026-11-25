# Security enforcement and vulnerability intelligence

**Status:** implementation policy for the Ametherian preview workspace. This document does not claim an independent security audit or guarantee that vulnerabilities are absent.

## Sources and responsibilities

| Source | Role in the pipeline | What it does not prove |
|---|---|---|
| npm audit / npm advisory data | Checks the complete npm dependency graph, including transitive and development dependencies, against registry advisory data | It is not a source-code audit and may differ from OSV coverage |
| OSV | Matches package names, ecosystems and exact versions against affected-version ranges | A clean OSV result does not prove code is safe or that every advisory database is complete |
| NIST NVD CVE API 2.0 | Enriches CVE aliases with CVSS, CWE, status and descriptive context | NVD is not treated as the authoritative npm package/version matcher; use OSV ecosystem ranges for that |
| CISA KEV | Flags CVEs with evidence of exploitation in the wild and elevates remediation priority | Absence from KEV does not mean a vulnerability is not exploitable |
| Node.js release metadata | Checks supported runtime lines against the security-patched minimums maintained in Ametherian core | It does not replace application dependency or operating-system patching |

Official references: [NIST NVD API](https://nvd.nist.gov/developers/vulnerabilities), [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog), and [CISA software supply-chain guidance](https://www.cisa.gov/sites/default/files/2024-08/ESF_SECURING_THE_SOFTWARE_SUPPLY_CHAIN%20RECOMMENDED%20PRACTICES%20FOR%20MANAGING%20OPEN%20SOURCE%20SOFTWARE%20AND%20SOFTWARE%20BILL%20OF%20MATERIALS_508.pdf).

## CI gates

The security workflow runs on pull requests, pushes to the protected development branch, manual dispatch, and a daily schedule. It must:

1. Install from the committed lockfile without running dependency lifecycle scripts.
2. Run npm's dependency audit across the full dependency graph.
3. Parse every installed npm package/version from package-lock.json.
4. Query OSV in bounded batches and match actual locked versions.
5. Fetch and validate the CISA KEV catalog, recording its version, release date and retrieval time.
6. Annotate OSV findings with KEV matches.
7. Query NVD for CVE aliases associated with affected locked packages and retain CVSS/CWE provenance.
8. Fail closed if required intelligence cannot be retrieved or a source's published timestamp is invalid. Treat the CISA KEV catalog release date as snapshot metadata, not a freshness TTL: CISA may leave the date unchanged when no catalog additions are made.
9. Block the gate for any KEV match or HIGH/CRITICAL affected package finding until reviewed.
10. Preserve a machine-readable report as a CI artifact.

The existing advisory watcher remains a separate regression-prevention control for the curated Axios/Undici compatibility baseline and Node.js runtime minimums. It must not be presented as a full dependency scan.

## Triage rules

- **CISA KEV match:** highest priority. Treat as actively exploited; identify exposure, patch or remove the component, and document any temporary mitigation with an owner and expiry.
- **CRITICAL/HIGH:** block merge/release pending a documented resolution or an explicitly approved, time-limited exception.
- **MODERATE/LOW:** review applicability, reachability, deployment exposure and fixed versions; record the decision.
- **Unknown or unparseable version/range:** never silently mark safe. Treat the result as incomplete and investigate.
- **Unavailable or invalid source:** scan is incomplete, not clean. Retry or block the security gate; do not silently fall back to cached data. Apply freshness thresholds only where the source documents an update cadence or timestamp semantics.

All findings require human review. Automated tooling must never rewrite dependency versions, suppress advisories, modify a lockfile, or claim a vulnerability is not applicable without an evidence-backed review.

## Safe remediation policy

1. Prefer upstream patched releases and minimal, reviewed dependency changes.
2. Do not disable TLS verification, destination checks, parser validation, size limits, timeouts, integrity checks, or security tests to make a build pass.
3. Do not use npm audit fix --force, unreviewed overrides, vendored patches, or version pinning as an automatic response.
4. Any temporary workaround must include a threat analysis, regression test, scope, owner, expiry date, and removal issue.
5. Add a regression test for each confirmed vulnerability in Ametherian-owned code.
6. Re-run tests, type checks, lockfile audit, and relevant threat-model tests before merge.

## NVD interpretation

NVD CVE records enrich CVE identifiers with vulnerability metadata. They do not always contain a reliable package-ecosystem affected-version range. Ametherian therefore uses OSV's npm ecosystem data to match the lockfile and NVD to enrich the resulting CVE context. A missing NVD record is recorded as missing metadata, not as proof of safety.

## SBOM and release evidence

Each distributable package release should eventually include a version-specific SBOM covering direct and transitive dependencies, plus a vulnerability report with source versions and retrieval timestamps. Until SBOM generation is implemented and verified, do not claim complete SBOM coverage.
