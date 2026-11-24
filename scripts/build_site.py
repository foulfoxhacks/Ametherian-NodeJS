#!/usr/bin/env python3
"""Generate the committed Ametherian static site.

Run from the repository root:

    python scripts/build_site.py

The script writes HTML, the client-side search index, sitemap.xml, llms.txt,
llms-full.txt, site.config.json, robots.txt, and the Open Graph manifest.
It does not download anything or require third-party packages.
"""

from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sitegen.common import (  # noqa: E402
    BASE,
    DOC_ORDER,
    PAGES,
    ROUTES,
    REPO,
    TODAY,
    canonical,
    route_for,
    canonical_path_script,
    head,
    site_header,
    site_footer,
    root_prefix,
    url_for,
)
from sitegen.docs_pages import (  # noqa: E402
    architecture_page,
    contributing_page,
    docs_home_page,
    not_found_page,
    packages_page,
    roadmap_page,
    security_page,
    security_policy_page,
    vision_page,
)
from sitegen.pages import home_page  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]

def sitemap_page() -> str:
    current = "sitemap/index.html"
    return f"""<!doctype html>
<html lang="en">
<head>
{head(current)}
</head>
<body class="page-home" data-root="{root_prefix(current)}">
<a class="skip-link" href="#main">Skip to content</a>
{site_header(current, "")}
<main id="main" class="sitemap-main">
  <div class="shell">
    <p class="eyebrow">Ametherian · Site index</p>
    <h1>XML Sitemap</h1>
    <p class="sitemap-lead">Explore the public pages, project policies, documentation, and discovery resources that make up Ametherian.</p>
    <div class="sitemap-toolbar">
      <label class="visually-hidden" for="sitemap-search">Filter sitemap pages</label>
      <input id="sitemap-search" type="search" data-sitemap-search placeholder="Filter pages…" autocomplete="off">
      <a class="button button--ghost" href="{url_for('sitemap.xml', current)}">View raw XML</a>
    </div>
    <p class="sitemap-status" data-sitemap-status role="status" aria-live="polite">Loading the sitemap…</p>
    <div class="sitemap-output" data-sitemap-output>
      <noscript><p>Enable JavaScript to display the visual sitemap. The <a href="{url_for('sitemap.xml', current)}">XML sitemap remains available</a>.</p></noscript>
    </div>
    <p class="sitemap-note">This is a CSS-styled HTML view of the crawler-facing XML sitemap. The XML remains independently readable by search engines and automated tools.</p>
  </div>
</main>
{site_footer(current)}
{canonical_path_script(current)}
<script src="{url_for('assets/sitemap.js', current)}" defer></script>
<script src="{url_for('assets/site.js', current)}" defer></script>
</body>
</html>
"""


def llms_page() -> str:
    current = "llms/index.html"
    return f"""<!doctype html>
<html lang="en">
<head>
{head(current)}
</head>
<body class="page-home" data-root="{root_prefix(current)}">
<a class="skip-link" href="#main">Skip to content</a>
{site_header(current, "")}
<main id="main" class="resources-main">
  <div class="shell">
    <p class="eyebrow">Ametherian · Discovery</p>
    <h1>AI &amp; machine-readable resources</h1>
    <p class="resources-lead">A human-friendly directory of the structured files that help search engines, AI assistants, developers, and automated tools understand Ametherian.</p>
    <div class="resources-callout"><strong>Designed for both people and machines.</strong><span>Every raw endpoint remains available in its original format. This page adds presentation; it does not replace or rewrite the source files.</span></div>
    <div class="resource-grid">
      <article class="resource-card"><div class="resource-card__top"><span class="resource-card__kind">Primary context</span><span class="resource-card__format">TXT</span></div><h2>llms.txt</h2><p>A concise overview of Ametherian, its proposal status, documentation, project files, and claim policy.</p><div class="resource-card__actions"><a href="{url_for('llms.txt', current)}">Open raw file ↗</a><button class="resource-copy" type="button" data-copy-url="{BASE}/llms.txt">Copy URL</button></div></article>
      <article class="resource-card"><div class="resource-card__top"><span class="resource-card__kind">Expanded context</span><span class="resource-card__format">TXT</span></div><h2>llms-full.txt</h2><p>Expanded project context covering the vision, package areas, architecture, security approach, roadmap, and boundaries.</p><div class="resource-card__actions"><a href="{url_for('llms-full.txt', current)}">Open raw file ↗</a><button class="resource-copy" type="button" data-copy-url="{BASE}/llms-full.txt">Copy URL</button></div></article>
      <article class="resource-card"><div class="resource-card__top"><span class="resource-card__kind">Search discovery</span><span class="resource-card__format">XML</span></div><h2>XML sitemap</h2><p>Canonical public URL inventory for search engines and automated discovery.</p><div class="resource-card__actions"><a href="{url_for('sitemap.xml', current)}">Open raw file ↗</a><button class="resource-copy" type="button" data-copy-url="{BASE}/sitemap.xml">Copy URL</button></div></article>
      <article class="resource-card"><div class="resource-card__top"><span class="resource-card__kind">Site metadata</span><span class="resource-card__format">JSON</span></div><h2>Site configuration</h2><p>Machine-readable site metadata, canonical page routes, publisher details, and theme tokens.</p><div class="resource-card__actions"><a href="{url_for('site.config.json', current)}">Open raw file ↗</a><button class="resource-copy" type="button" data-copy-url="{BASE}/site.config.json">Copy URL</button></div></article>
      <article class="resource-card"><div class="resource-card__top"><span class="resource-card__kind">Crawler guidance</span><span class="resource-card__format">TXT</span></div><h2>robots.txt</h2><p>Public crawler access policy and the canonical sitemap location.</p><div class="resource-card__actions"><a href="{url_for('robots.txt', current)}">Open raw file ↗</a><button class="resource-copy" type="button" data-copy-url="{BASE}/robots.txt">Copy URL</button></div></article>
    </div>
    <section class="resources-footnote" aria-labelledby="resources-principles">
      <h2 id="resources-principles">Format and compatibility</h2>
      <ul>
        <li><code>llms.txt</code> and <code>llms-full.txt</code> remain plain Markdown text files.</li>
        <li><code>sitemap.xml</code> remains standard XML without a stylesheet processing instruction.</li>
        <li>JSON and crawler directives remain raw machine-readable files.</li>
        <li>CSS is applied only to this human-facing HTML directory and the visual sitemap.</li>
      </ul>
    </section>
  </div>
</main>
{site_footer(current)}
{canonical_path_script(current)}
<script src="{url_for('assets/resources.js', current)}" defer></script>
<script src="{url_for('assets/site.js', current)}" defer></script>
</body>
</html>
"""




RENDERERS = {
    "index.html": home_page,
    "docs/index.html": docs_home_page,
    "docs/vision.html": vision_page,
    "docs/packages.html": packages_page,
    "docs/architecture.html": architecture_page,
    "docs/security.html": security_page,
    "docs/roadmap.html": roadmap_page,
    "SECURITY.html": security_policy_page,
    "CONTRIBUTING.html": contributing_page,
    "sitemap/index.html": sitemap_page,
    "llms/index.html": llms_page,
    "404.html": not_found_page,
}


def write_text(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content.encode("utf-8"))
    print(f"wrote {path}")


def legacy_redirect(path: str) -> str:
    """Keep old .html URLs usable while directing browsers to the clean route."""
    destination = ROUTES[path]
    escaped_destination = html.escape(destination, quote=True)
    return f"""<!doctype html>
<html lang="en">
<head>
{head(path, robots="noindex,follow")}
<meta http-equiv="refresh" content="0;url={escaped_destination}">
</head>
<body>
<main id="main">
  <h1>{html.escape(PAGES[path]["title"])}</h1>
  <p>This page has moved to <a href="{escaped_destination}">{escaped_destination}</a>.</p>
</main>
<script>window.location.replace({json.dumps(destination)} + window.location.search + window.location.hash);</script>
</body>
</html>
"""


def strip_tags(source: str) -> str:
    source = re.sub(r"<script\b.*?</script>", " ", source, flags=re.S | re.I)
    source = re.sub(r"<style\b.*?</style>", " ", source, flags=re.S | re.I)
    source = re.sub(r"<[^>]+>", " ", source)
    return re.sub(r"\s+", " ", html.unescape(source)).strip()


def section_for(path: str) -> str:
    if path == "index.html":
        return "Home"
    if path == "docs/index.html":
        return "Documentation"
    if path == "sitemap/index.html":
        return "Site index"
    if path == "llms/index.html":
        return "Discovery resources"
    if path.startswith("docs/"):
        return "Proposal document"
    return "Project policy"


def search_index(rendered: dict[str, str]) -> list[dict]:
    entries = []
    for path in RENDERERS:
        if path == "404.html":
            continue
        source = rendered[path]
        main_match = re.search(r"<main\b.*?</main>", source, flags=re.S | re.I)
        main = main_match.group(0) if main_match else source
        headings = []
        for level, ident, label in re.findall(
            r'<h([23])\s+id="([^"]+)"[^>]*>(.*?)</h\1>', main, flags=re.S
        ):
            text = strip_tags(label)
            if text:
                headings.append({"id": ident, "text": text, "level": int(level)})
        entries.append(
            {
                "path": route_for(path),
                "title": PAGES[path]["og_title"],
                "section": section_for(path),
                "description": PAGES[path]["description"],
                "headings": headings,
                "text": strip_tags(main)[:1600],
            }
        )
    return entries


def sitemap() -> str:
    rows = []
    for path in RENDERERS:
        if path == "404.html":
            continue
        rows.append(
            f"  <url><loc>{canonical(path)}</loc><lastmod>{TODAY}</lastmod></url>"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(rows)
        + "\n</urlset>\n"
    )


def llms_txt() -> str:
    return f"""# Ametherian

> Ametherian is a proposed, independent family of modular JavaScript and TypeScript libraries under the @foulfoxhacks npm scope, with a Node.js-first direction. It is at the public proposal and planning stage. No packages are published, audited, or production-ready.

## Important status

- Ametherian is a proposal, not released software.
- No Ametherian package is published, and no security audit has been performed.
- The project is independent and is not affiliated with or endorsed by Node.js, the OpenJS Foundation, Axios, Undici, or any other referenced project.
- The project license has not been selected.
- The roadmap is staged and publishes no dates or release commitments.

## Documentation

- [Documentation hub]({BASE}/docs/)
- [Project vision]({BASE}/docs/vision/)
- [Proposed package map]({BASE}/docs/packages/)
- [Architecture direction]({BASE}/docs/architecture/)
- [Security approach]({BASE}/docs/security/)
- [Proposed roadmap]({BASE}/docs/roadmap/)
- [Security policy]({BASE}/security/)
- [Contributing]({BASE}/contributing/)

## Project files

- [Project status]({REPO}/blob/main/PROJECT_STATUS.md)
- [Project brief]({REPO}/blob/main/AMETHERIAN-PROJECT-BRIEF.txt)
- [License status]({REPO}/blob/main/LICENSE-STATUS.md)
- [Notice]({REPO}/blob/main/NOTICE.md)
- [Source repository]({REPO})

## Topics

Ametherian explores networking and protocols, data validation and serialization, application infrastructure, security engineering, observability, testing, developer tooling, and runtime utilities. The intent is focused packages with shared conventions rather than one monolithic dependency.

## Claim policy

Descriptions on this site distinguish proposed direction from implemented and released functionality. Compatibility, performance, security, and reliability claims require reproducible evidence or an explicit label as goals.
"""


def llms_full_txt() -> str:
    return f"""# Ametherian — full project context

Ametherian is a proposed, independent family of modular JavaScript and TypeScript libraries under the `@foulfoxhacks` npm scope. Its direction is Node.js-first and broader than a single HTTP client: it explores networking, data handling, application infrastructure, developer tooling, and security-conscious engineering.

The project is at the public proposal and planning stage. No packages are published. No security audit has been performed. The project is not production-ready, is not a drop-in replacement for Axios or Undici, and is not affiliated with or endorsed by Node.js, the OpenJS Foundation, Axios, Undici, or any other referenced project. The license has not been selected.

## Canonical pages

- Home: {BASE}/
- Documentation: {BASE}/docs/
- Vision: {BASE}/docs/vision/
- Package map: {BASE}/docs/packages/
- Architecture: {BASE}/docs/architecture/
- Security approach: {BASE}/docs/security/
- Roadmap: {BASE}/docs/roadmap/
- Security policy: {BASE}/security/
- Contributing: {BASE}/contributing/

## Vision

Ametherian aims to investigate where consistent contracts and well-defined package boundaries could make commonly repeated infrastructure work easier to understand and maintain. Candidate packages are intended to be adopted independently and composed through shared conventions. The initial research compares Axios-style HTTP client ergonomics with Undici-style transport architecture. That is a starting point, not a boundary or a compatibility claim.

Project boundaries:

- Ametherian is a proposal and planning effort, not released software.
- Candidate package names, capabilities, and roadmap items are provisional.
- The project will not promise complete vulnerability prevention, universal compatibility, or automatic safety for arbitrary consuming applications.
- Third-party names identify technologies and research context only.

## Proposed package areas

- Networking and protocols: HTTP clients, transport adapters, connection pools, proxy support, streaming, protocol utilities, retries, deadlines, and cancellation.
- Data and serialization: validation, schemas, parsing, serialization, conversion, structured data, and safe handling of untrusted input.
- Application infrastructure: caching, queues, concurrency, rate limiting, configuration, dependency boundaries, lifecycle management, and resilience.
- Security engineering: security policy helpers, secure configuration, vulnerability intelligence integrations, dependency and supply-chain review, test fixtures, and regression tooling.
- Observability and developer experience: logging, diagnostics, metrics, tracing, typed errors, test utilities, mocks, fixtures, fuzzing helpers, CLI support, and documentation tooling.

Candidate names from the project brief: `@foulfoxhacks/ametherian`, `-core`, `-http`, `-transport`, `-security`, `-guard`, `-schema`, `-cache`, `-observability`, and `-testing`. These are naming proposals, not published packages.

## Architecture direction

Packages should have one understandable responsibility, declare supported runtime capabilities, and remain useful without unrelated modules. Candidate shared contracts include typed errors, cancellation, deadlines, resource lifecycle, configuration validation, logging hooks, and documentation of side effects. Shared contracts should reduce fragmentation without circular dependencies or forced dependencies.

Node.js is the initial target. APIs should make runtime assumptions explicit and isolate environment-specific behavior behind adapters where useful. Unsupported capabilities should fail clearly. Network and stream-oriented packages should define timeouts, maximum sizes, concurrency bounds, backpressure, cancellation, and cleanup. Defaults should be conservative and configurable.

Before stable releases, the project should document supported Node.js versions, module formats, TypeScript support, semantic versioning policy, deprecation windows, and interoperability expectations. Compatibility and performance claims need reproducible tests, benchmark methodology, fuzzing where appropriate, and transparent release notes.

## Security approach

Security is a design and maintenance requirement, not a marketing guarantee. Each package must document trust boundaries, threat model, assumptions, and known limitations. Threat modeling should consider SSRF, DNS rebinding, redirect policy bypasses, TLS hostname and certificate validation, credential exposure, unsafe parsing, prototype pollution, decompression bombs, unbounded resource use, cache poisoning and isolation, filesystem traversal, concurrency races, and dependency or build-chain compromise.

Practices include reusing mature cryptographic, TLS, compression, and parsing primitives; bounding resource use; avoiding secret logging; validating redirects and protocol transitions; testing malformed and adversarial inputs; tracking dependency provenance; adding regression tests for confirmed vulnerabilities; and requiring human review for security-sensitive fixes.

Vulnerability intelligence may draw on OSV, GitHub Security Advisories, NVD, CISA Known Exploited Vulnerabilities, Node.js security advisories, and upstream advisories. Any ingestion must preserve source attribution, timestamps, affected-version ranges, confidence, and freshness. Intelligence informs review and testing; it must not trigger unreviewed production changes.

Security reports must follow the security policy. Do not post exploit details publicly before coordinated disclosure. There are no released packages or audited guarantees at this stage.

## Roadmap

The roadmap is staged: research and project foundation; specifications and threat models; implementation and verification; release readiness. Dates and release commitments are not published until scope, ownership, and capacity are established.

A package should not be described as stable or production-ready until its API, support matrix, documentation, tests, security review, release process, and maintenance ownership are explicit. The status labels are proposal, active implementation, preview release, and stable release. No package currently meets the preview or stable definition.

## Project status

The project status report lists the vision as drafted, package taxonomy as proposed, HTTP and transport research as an initial documented direction, the security model as proposed requirements, vulnerability intelligence as a proposed workflow, package implementations as not represented as complete, and security audit as not performed. Progress requires public evidence such as reviewed specifications, threat models, source, tests, changelogs, and releases.

## Project files

- {REPO}
- {REPO}/blob/main/PROJECT_STATUS.md
- {REPO}/blob/main/LICENSE-STATUS.md
- {REPO}/blob/main/NOTICE.md
- {REPO}/blob/main/REFERENCES.md
"""


def site_config() -> str:
    config = {
        "project": "Ametherian",
        "publisher": "FoulFoxHacks",
        "tagline": "A new kind of Node library ecosystem",
        "status": "proposal",
        "siteUrl": BASE,
        "basePath": "",
        "repository": REPO,
        "defaultLocale": "en",
        "lastReviewed": TODAY,
        "pages": [
            {"path": ROUTES[path], "url": canonical(path)}
            for path in RENDERERS
            if path != "404.html"
        ],
        "theme": {
            "name": "Cosmic Amethyst",
            "colors": {
                "background": "#0b0812",
                "surface": "#120e1c",
                "surfaceRaised": "#1d162c",
                "text": "#f5f2fb",
                "muted": "#b9b0c9",
                "amethyst": "#8b53fe",
                "violet": "#6d3be0",
                "border": "#322847",
                "node": "#5fa04e",
            },
        },
    }
    return json.dumps(config, indent=2, ensure_ascii=False) + "\n"


def webmanifest() -> str:
    manifest = {
        "name": "Ametherian",
        "short_name": "Ametherian",
        "description": "An independent proposal for a modular Node.js library ecosystem.",
        "start_url": "../",
        "scope": "../",
        "display": "standalone",
        "background_color": "#0b0812",
        "theme_color": "#0b0812",
        "icons": [
            {
                "src": "icon-192.png",
                "sizes": "192x192",
                "type": "image/png",
                "purpose": "any",
            },
            {
                "src": "icon-512.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "any",
            },
        ],
    }
    return json.dumps(manifest, indent=2) + "\n"


def main() -> None:
    rendered = {path: renderer() for path, renderer in RENDERERS.items()}
    for path, source in rendered.items():
        if path in {"index.html", "docs/index.html", "sitemap/index.html", "llms/index.html", "404.html"}:
            write_text(path, source)
            continue
        clean_route_file = ROUTES[path].lstrip("/") + "index.html"
        write_text(clean_route_file, source)
        write_text(path, legacy_redirect(path))

    index = search_index(rendered)
    payload = json.dumps(index, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("</", "<\\/").replace("\u2028", "\\u2028").replace(
        "\u2029", "\\u2029"
    )
    write_text(
        "assets/search-index.js",
        "/* Generated by scripts/build_site.py. */\n"
        f"window.AMETHERIAN_SEARCH = {payload};\n",
    )

    write_text("sitemap.xml", sitemap())
    write_text("llms.txt", llms_txt())
    write_text("llms-full.txt", llms_full_txt())
    write_text("site.config.json", site_config())
    write_text("assets/site.webmanifest", webmanifest())
    write_text(
        "robots.txt",
        "# Public proposal and documentation. Search and AI crawlers may read this site.\n"
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /404.html\n\n"
        f"Sitemap: {BASE}/sitemap.xml\n",
    )

    manifest = [
        {
            "key": meta["og_key"],
            "title": meta["og_title"],
            "subtitle": meta["og_subtitle"],
            "label": meta["og_label"],
            "url": canonical(path).replace("https://", "").rstrip("/"),
        }
        for path, meta in PAGES.items()
    ]
    write_text(
        "scripts/og-manifest.json",
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
    )
    print(f"\nBuilt {len(rendered)} pages with {len(index)} search entries.")


if __name__ == "__main__":
    main()
