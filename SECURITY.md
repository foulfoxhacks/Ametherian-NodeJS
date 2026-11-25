# Security policy

## Current status

Ametherian is at the preview implementation stage. Workspace packages are unpublished previews and have not been independently audited. No security guarantee is represented.

## Reporting a vulnerability

Until a private reporting channel is configured, do not send sensitive vulnerability details through public Issues or Discussions. Contact the maintainers through a verified private channel listed on the repository's GitHub Security tab once it is enabled.

Do not include live credentials, personal data, or data belonging to third parties in a report.

## Intended security process

For future implementation repositories, the project intends to establish:

- A supported-version policy and security contact
- Private vulnerability reporting and coordinated disclosure
- Severity triage based on impact, exploitability, affected configurations, and known exploitation
- Reproducible regression tests for confirmed vulnerabilities
- Security advisories and patched release notes
- Dependency, secret, static-analysis, and supply-chain checks, including npm audit, OSV, NIST NVD enrichment, CISA KEV prioritisation, and supported Node.js release checks
- A documented emergency release and package-deprecation process

## Security claims

A security feature is not considered complete merely because it appears in a roadmap or configuration example. It must have a defined threat model, implementation, tests, documentation, and review. Vulnerability intelligence is evidence for triage, not proof that a component is safe. Missing or unavailable feeds must not be interpreted as a clean result. Independent audits must be described with their actual scope and date.