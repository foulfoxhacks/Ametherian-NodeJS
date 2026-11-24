# Project status

Ametherian is at the **preview implementation** stage.

Ten packages are implemented in `packages/` with tests, TypeScript declarations and threat models, and pass CI on Node.js 22, 24 and 26. They are **not published to npm**, have **not been independently audited**, and the **license has not been chosen**. Every green build of `main` is published as a numbered preview build on GitHub Releases (see `CHANGELOG.md`).

| Area | Current status | What would establish further progress |
|---|---|---|
| Project vision | Published | Maintainer review and community feedback |
| Package taxonomy | Implemented as ten preview packages | Maintainer review of package boundaries |
| HTTP and transport | Preview: client, `fetch()`, proxy, HTTP/2 | Streaming request bodies; independent review |
| Security model | Threat models (`docs/threat-models/`) and adversarial tests in place | Independent review of controls |
| Vulnerability intelligence | Working: OSV, GitHub advisories, NIST NVD, Node.js releases; daily watch | CISA KEV adapter |
| axios/undici advisories | 111 mapped: 64 prevented with named tests, 47 not applicable | Kept current by the daily watch |
| Package implementations | Preview `0.1.0`, unpublished | License, release process, npm publication |
| Security audit | Not performed | Independent review with scope and report |
| License | Not chosen | Maintainer decision (`LICENSE-STATUS.md`) |

Do not describe Ametherian as production-ready, audited, secure against all vulnerabilities, faster than competitors, or a drop-in replacement until evidence supports the specific statement.
