"""Documentation and policy page content."""

from __future__ import annotations

from .common import *


def callout(mark: str, text: str, kind: str = "") -> str:
    classes = "callout" + (f" callout--{kind}" if kind else "")
    return f'<div class="{classes}"><p><strong>{mark}</strong> {text}</p></div>'


def doc_card(current: str, target: str, label: str, title: str, description: str) -> str:
    return f"""<a class="doc-card" href="{url_for(target, current)}">
  <span class="doc-card__label">{label}</span>
  <span class="doc-card__title">{title}</span>
  <span class="doc-card__desc">{description}</span>
  <span class="doc-card__link">Read <span aria-hidden="true">→</span></span>
</a>"""


def docs_home_page() -> str:
    current = "docs/index.html"
    body = f"""{callout('Status.', 'Ametherian packages exist as tested previews in the repository. They are not published to npm and have not been audited. Nothing in this documentation is a release announcement.')}

<h2 id="start">Start here</h2>
<p>Read the documentation in order if you are evaluating the direction. Each document states what is planned, what is not yet known, and what evidence would count as progress.</p>
<div class="doc-grid">
  {doc_card(current, 'docs/vision.html', 'Document', 'Project vision', 'Why an ecosystem, what is in scope, and the boundaries the project will respect.')}
  {doc_card(current, 'docs/packages.html', 'Document', 'Package map', 'Five areas and the preview packages in each.')}
  {doc_card(current, 'docs/architecture.html', 'Document', 'Architecture direction', 'Modular packages, shared contracts, runtime boundaries, and resource safety.')}
  {doc_card(current, 'docs/security.html', 'Document', 'Security approach', 'Threat modeling, secure engineering practices, and vulnerability intelligence.')}
  {doc_card(current, 'docs/roadmap.html', 'Document', 'Roadmap', 'The staged path from research to release readiness.')}
</div>

<h2 id="policy">Project policy</h2>
<p>Policy documents describe how the project handles security reports and contributions.</p>
<div class="doc-grid doc-grid--two">
  {doc_card(current, 'SECURITY.html', 'Policy', 'Security policy', 'Current reporting status, coordinated disclosure, and the intended security process.')}
  {doc_card(current, 'CONTRIBUTING.html', 'Policy', 'Contributing', 'How to give feedback, standards, and pull request expectations.')}
</div>

<h2 id="status">Status at a glance</h2>
<p>The table below is the project’s own status report. A row moves forward only when there is public evidence.</p>
<div class="table-scroll">
<table>
  <caption class="visually-hidden">Ametherian project status by area</caption>
  <thead><tr><th scope="col">Area</th><th scope="col">Current status</th><th scope="col">What would establish progress</th></tr></thead>
  <tbody>
    <tr><td>Project vision</td><td>Published</td><td>Maintainer review and community feedback</td></tr>
    <tr><td>Package taxonomy</td><td>Implemented as preview packages</td><td>Maintainer review of package boundaries</td></tr>
    <tr><td>HTTP and transport</td><td>Preview: client, fetch(), proxy, HTTP/2, streamed request bodies</td><td>Opt-in cookie jar; independent review</td></tr>
    <tr><td>Security model</td><td>Threat models and adversarial tests in place</td><td>Independent review of controls</td></tr>
    <tr><td>Vulnerability intelligence</td><td>Working: OSV, GitHub advisories, NIST NVD, CISA KEV, daily watch</td><td>Lockfile audit command-line tool</td></tr>
    <tr><td>Package implementations</td><td>Preview, unpublished</td><td>Release process, npm publication</td></tr>
    <tr><td>Security audit</td><td>Not performed</td><td>Independent review with scope and report</td></tr>
  </tbody>
</table>
</div>
<p class="table-note">Source: <a href="{url_for('PROJECT_STATUS.md', current)}">Project status</a>.</p>

<h2 id="conventions">How to read the documentation</h2>
<ul class="spec-list">
  <li><strong>Planning is not implementation.</strong> A described capability, package name, or security control is a direction until source, tests, documentation, and a release exist.</li>
  <li><strong>Claims need evidence.</strong> Compatibility, performance, reliability, and security statements must be reproducible or explicitly labeled as goals.</li>
  <li><strong>Dates are not promises.</strong> The roadmap is staged. Release commitments are not published until scope, ownership, and capacity are established.</li>
  <li><strong>Third-party names identify context.</strong> Axios, Undici, Node.js, and OpenJS are referenced to describe the ecosystem and constraints, not to imply affiliation or endorsement.</li>
</ul>

<h2 id="records">Project records</h2>
<p>These repository documents are plain-text sources for the site. They are useful when reviewing status.</p>
"""
    return docs_shell(
        current,
        "Documentation",
        "Vision, package map, architecture, security, and roadmap.",
        body,
    )


def vision_page() -> str:
    current = "docs/vision.html"
    body = f"""
<h2 id="why">Why an ecosystem</h2>
<p>Node.js has a mature package ecosystem. It also has recurring friction: overlapping packages, inconsistent contracts, undocumented limits, and security posture that varies by maintainer. Ametherian investigates whether a cohesive family of focused packages can reduce that friction without forcing adoption of one oversized dependency.</p>
<p>The goal is not a single framework. The goal is a set of modules that share conventions, document their behavior, and can be adopted independently.</p>

<h2 id="scope">What is in scope</h2>
<p>The <a href="{url_for('docs/packages.html', current)}">package map</a> groups the work into five areas: networking, data and serialization, application infrastructure, security engineering, and observability.</p>
<ul class="spec-list">
  <li><strong>Focused responsibilities.</strong> A package should do one understandable thing and remain useful without unrelated modules.</li>
  <li><strong>Explicit limits.</strong> Runtime requirements, side effects, failure modes, and resource bounds should be documented rather than hidden.</li>
  <li><strong>Security by design.</strong> Threat models and safe defaults belong in the design, not in a later checklist.</li>
</ul>

<h2 id="boundaries">What the project will not promise</h2>
<ul class="spec-list">
  <li>Complete vulnerability prevention.</li>
  <li>Universal compatibility with arbitrary applications or runtimes.</li>
  <li>Automatic safety for applications that misuse or misconfigure a package.</li>
  <li>Drop-in replacement of Axios, Undici, or any other existing library.</li>
</ul>
"""
    return docs_shell(
        current,
        "Project vision",
        "A cohesive ecosystem of focused packages — not one oversized dependency.",
        body,
    )


def packages_page() -> str:
    current = "docs/packages.html"
    body = f"""
<p>The package map groups Ametherian into five areas. Each area now has preview packages with tests, type declarations and threat models; see <a href="/modules/">Modules</a> for details. Package APIs may still change until the first stable release.</p>

<h2 id="networking-and-protocols">Networking and protocols</h2>
<p>HTTP clients, transports, connection pools, proxies, streaming, retries, deadlines, and cancellation.</p>
<p>Preview packages: <code>ametherian-http</code>, <code>ametherian-guard</code>, <code>ametherian-youtube-chat</code>.</p>

<h2 id="data-and-serialization">Data and serialization</h2>
<p>Validation, schemas, parsing, serialization, conversion, structured data, and safe handling of untrusted input.</p>
<p>Preview packages: <code>ametherian-schema</code>, <code>ametherian-frontmatter</code>.</p>

<h2 id="application-infrastructure">Application infrastructure</h2>
<p>Caching, queues, concurrency, rate limiting, configuration, lifecycle management, and resilience.</p>
<p>Preview packages: <code>ametherian-core</code>, <code>ametherian-cache</code>, <code>ametherian-resilience</code>.</p>

<h2 id="security-engineering">Security engineering</h2>
<p>Security policy helpers, secure configuration, dependency review, test fixtures, and regression tooling.</p>
<p>Preview package: <code>ametherian-security</code>.</p>

<h2 id="observability-and-developer-experience">Observability and developer experience</h2>
<p>Logging, diagnostics, metrics, tracing, typed errors, test utilities, fuzzing helpers, and documentation tooling.</p>
<p>Preview packages: <code>ametherian-observability</code>, <code>ametherian-testing</code>.</p>
"""
    return docs_shell(
        current,
        "Package map",
        "Five areas, each with preview packages.",
        body,
    )


def architecture_page() -> str:
    current = "docs/architecture.html"
    body = f"""
<h2 id="modularity">Modular packages</h2>
<p>Packages should have one understandable responsibility, declare supported runtime capabilities, and remain useful without unrelated modules.</p>

<h2 id="contracts">Shared contracts</h2>
<p>Shared contracts include typed errors, cancellation, deadlines, resource lifecycle, configuration validation, logging hooks, and documentation of side effects. Shared contracts should reduce fragmentation without circular dependencies or forced dependencies.</p>

<h2 id="runtime">Runtime boundaries</h2>
<p>Node.js is the initial target. APIs should make runtime assumptions explicit and isolate environment-specific behavior behind adapters where useful. Unsupported capabilities should fail clearly.</p>

<h2 id="safety">Resource safety</h2>
<p>Network and stream-oriented packages should define timeouts, maximum sizes, concurrency bounds, backpressure, cancellation, and cleanup. Defaults should be conservative and configurable.</p>

<h2 id="evidence">Evidence-backed compatibility</h2>
<p>Before stable releases, the project should document supported Node.js versions, module formats, TypeScript support, semantic versioning policy, deprecation windows, and interoperability expectations. Compatibility and performance claims need reproducible tests and benchmark methodology.</p>
"""
    return docs_shell(
        current,
        "Architecture direction",
        "Modular packages, explicit runtime boundaries, shared contracts.",
        body,
    )


def security_page() -> str:
    current = "docs/security.html"
    body = f"""
<h2 id="design">Security by design</h2>
<p>Security is a design and maintenance requirement, not a marketing guarantee. Each package must document trust boundaries, threat model, assumptions, and known limitations.</p>

<h2 id="threat-modeling">Threat modeling</h2>
<p>Threat modeling should consider SSRF, DNS rebinding, redirect policy bypasses, TLS hostname and certificate validation, credential exposure, unsafe parsing, prototype pollution, decompression bombs, unbounded resource use, cache poisoning and isolation, filesystem traversal, concurrency races, and dependency or build-chain compromise.</p>

<h2 id="practices">Secure engineering practices</h2>
<ul class="spec-list">
  <li>Reusing mature cryptographic, TLS, compression, and parsing primitives.</li>
  <li>Bounding resource use and avoiding secret logging.</li>
  <li>Validating redirects and protocol transitions.</li>
  <li>Testing malformed and adversarial inputs.</li>
  <li>Tracking dependency provenance and adding regression tests for confirmed vulnerabilities.</li>
  <li>Requiring human review for security-sensitive fixes.</li>
</ul>

<h2 id="intelligence">Vulnerability intelligence</h2>
<p>Vulnerability intelligence may draw on OSV, GitHub Security Advisories, NVD, CISA Known Exploited Vulnerabilities, Node.js security advisories, and upstream advisories. Any ingestion must preserve source attribution, timestamps, affected-version ranges, confidence, and freshness. Intelligence informs review and testing; it must not trigger unreviewed production changes.</p>

<h2 id="disclosure">Coordinated disclosure</h2>
<p>Security reports must follow the <a href="{url_for('SECURITY.html', current)}">security policy</a>. Do not post exploit details publicly before coordinated disclosure.</p>
"""
    return docs_shell(
        current,
        "Security approach",
        "Threat models, bounded resources, and evidence-backed claims.",
        body,
    )


def roadmap_page() -> str:
    current = "docs/roadmap.html"
    body = f"""
<p>The roadmap is staged and deliberately avoids dates until scope, ownership, and capacity are established.</p>

<h2 id="research">Research and project foundation</h2>
<p><strong>Done.</strong> Establish the repository, documentation, and initial research areas. Review existing libraries and identify where consistent contracts would help.</p>

<h2 id="specifications">Specifications and threat models</h2>
<p><strong>Done for the preview packages.</strong> Write explicit specifications. Define threat models, resource bounds, failure modes, and support matrices.</p>

<h2 id="implementation">Implementation and verification</h2>
<p><strong>In progress.</strong> The packages are implemented with tests, fuzzing and a vulnerability model. Independent security review is still required before any package can be described as stable.</p>

<h2 id="readiness">Release readiness</h2>
<p><strong>Not started.</strong> A package is not stable or production-ready until its API, support matrix, documentation, tests, security review, release process, and maintenance ownership are explicit.</p>
"""
    return docs_shell(
        current,
        "Roadmap",
        "Research, specifications, implementation, and release readiness.",
        body,
    )


def security_policy_page() -> str:
    current = "SECURITY.html"
    body = f"""
<p>This policy applies to this repository, including its preview packages, and to future release repositories.</p>

<h2 id="reporting">Reporting a vulnerability</h2>
<p>Do not open a public issue for a security vulnerability. Report it privately to the maintainers. Security-sensitive details must not be posted publicly before coordinated disclosure.</p>

<h2 id="scope">Scope</h2>
<p>There are currently no released packages and no security-audited guarantees. If a vulnerability is found in the site infrastructure or repository configuration, it should be reported following this policy.</p>

<h2 id="process">Intended process</h2>
<ul class="spec-list">
  <li>Acknowledge receipt of the report.</li>
  <li>Investigate and confirm the issue.</li>
  <li>Develop and test a fix.</li>
  <li>Coordinate disclosure and credit.</li>
</ul>
"""
    return docs_shell(
        current,
        "Security policy",
        "Reporting status and the intended security process.",
        body,
    )


def contributing_page() -> str:
    current = "CONTRIBUTING.html"
    body = f"""
<p>Early feedback on scope, package boundaries, security requirements, runtime compatibility, and developer experience is welcome.</p>

<h2 id="feedback">Giving feedback</h2>
<p>Open an issue to discuss proposals, architecture decisions, or documentation gaps. Keep discussions focused on the technical direction and evidence.</p>

<h2 id="pull-requests">Pull requests</h2>
<p>Pull requests should be small, focused, and accompanied by a clear description of the problem and the proposed solution. Documentation and tests are part of the change.</p>

<h2 id="security">Security-sensitive changes</h2>
<p>Do not post exploit details publicly. Follow the <a href="{url_for('SECURITY.html', current)}">security policy</a> for vulnerability reports and security-sensitive fixes.</p>
"""
    return docs_shell(
        current,
        "Contributing",
        "How to give feedback on the direction and architecture.",
        body,
    )


def not_found_page() -> str:
    current = "404.html"
    meta = PAGES[current]
    return f"""<!doctype html>
<html lang="en">
<head>
{head(current)}
</head>
<body class="{meta['body_class']}" data-root="{root_prefix(current)}">
<a class="skip-link" href="#main">Skip to content</a>
{site_header(current, "")}
<main id="main" class="error-main">
  <p class="error-code" aria-hidden="true">404</p>
  <h1>Page not found</h1>
  <p>The requested page is not part of the Ametherian site.</p>
  <div class="error-actions">
    <a class="button button--primary" href="{url_for('index.html', current)}">Back to home</a>
    <a class="button button--ghost" href="{url_for('docs/index.html', current)}">Open documentation</a>
  </div>
</main>
{site_footer(current)}
<script src="{url_for('assets/site.js', current)}" defer></script>
</body>
</html>
"""
