# Security approach

Security is a design and maintenance requirement, not a marketing guarantee. Ametherian cannot eliminate all vulnerabilities or secure arbitrary application code. Each future package must document its trust boundaries, threat model, assumptions, and known limitations.

## Areas for threat modeling

Research should consider SSRF, DNS rebinding, redirect policy bypasses, TLS hostname and certificate validation, credential exposure, unsafe parsing, prototype pollution, decompression bombs, unbounded resource use, cache poisoning and isolation, filesystem traversal, concurrency races, and dependency or build-chain compromise.

## Secure engineering practices

- Reuse mature cryptographic, TLS, compression, and parsing primitives
- Bound resource consumption and make limits observable
- Avoid logging secrets; redact credentials and sensitive headers
- Validate redirects, destinations, and protocol transitions
- Test malformed, adversarial, and boundary inputs
- Track dependencies and provenance; review changes before release
- Add regression tests for confirmed vulnerabilities
- Require human review for security-sensitive fixes

## Vulnerability intelligence

Potential sources include OSV, GitHub Security Advisories, NVD, CISA Known Exploited Vulnerabilities, Node.js security advisories, and upstream package advisories. Any future ingestion system must preserve source attribution, timestamps, affected-version ranges, confidence, and freshness. Intelligence should inform review and testing, not trigger unreviewed production code changes.

## Reporting

Please follow the repository’s SECURITY.md policy. Do not publish exploit details in public issues before coordinated disclosure.
