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
    REPO,
    TODAY,
    canonical,
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
    "404.html": not_found_page,
}


def write_text(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content.encode("utf-8"))
    print(f"wrote {path}")


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
                "path": path,
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
        '<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(rows)
        + "\n</urlset>\n"
    )


def sitemap_xsl() -> str:
    return """<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9">
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
        <meta name="publisher" content="FoulFoxHacks"/><meta name="robots" content="noindex,follow"/>
        <title>XML Sitemap — Ametherian</title><link rel="icon" type="image/svg+xml" href="/assets/favicon.svg"/>
        <style>
          :root{color-scheme:dark;--bg:#0b0812;--panel:#171125;--text:#f5f2fb;--muted:#b9b0c9;--line:#322847}
          *{box-sizing:border-box}body{margin:0;background:radial-gradient(900px 520px at 80% 0%,rgba(139,83,254,.18),transparent 65%),var(--bg);color:var(--text);font:16px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif}
          a{color:#c4b5fd;text-decoration:none}a:hover{text-decoration:underline;color:#fff}.wrap{width:min(100% - 36px,1040px);margin:0 auto}
          header{padding:42px 0 30px;border-bottom:1px solid var(--line)}.brand{display:flex;align-items:center;gap:12px;color:var(--text);font-weight:800;font-size:1.25rem}.brand img{width:42px;height:42px;object-fit:contain}
          .eyebrow{margin:20px 0 5px;color:#c4b5fd;font:600 .72rem/1.4 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}h1{margin:0;font-size:clamp(2rem,5vw,3.4rem);line-height:1.08;letter-spacing:-.05em}
          .intro{max-width:680px;color:var(--muted);margin:14px 0 0}.stats{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}.stat{padding:8px 12px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:.82rem}
          main{padding:30px 0 64px}section{margin:0 0 26px;padding:22px;border:1px solid var(--line);border-radius:16px;background:rgba(23,17,37,.82)}h2{margin:0 0 14px;font-size:1.2rem}
          .entry{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;padding:13px 0;border-top:1px solid rgba(255,255,255,.07)}.entry:first-of-type{border-top:0}.loc{overflow-wrap:anywhere;font-size:.92rem}.date{color:var(--muted);font:.75rem ui-monospace,monospace}
          footer{padding:22px 0 36px;border-top:1px solid var(--line);color:var(--muted);font-size:.82rem}@media(max-width:620px){.entry{grid-template-columns:1fr;gap:4px}section{padding:16px}}
        </style>
      </head>
      <body>
        <header><div class="wrap"><a class="brand" href="/"><img src="/assets/ametherian-mark.svg" alt=""/>Ametherian</a>
          <p class="eyebrow">FoulFoxHacks · Node.js library ecosystem</p><h1>XML Sitemap</h1>
          <p class="intro">A structured index of Ametherian's public pages. This branded view is a presentation layer; the underlying XML remains available to crawlers.</p>
          <div class="stats"><span class="stat"><xsl:value-of select="count(sm:urlset/sm:url)"/> public URLs</span><span class="stat">Sitemap Protocol</span></div>
        </div></header>
        <main class="wrap">
          <section><h2>Website and project policies</h2>
            <xsl:for-each select="sm:urlset/sm:url[not(contains(sm:loc,'/docs/'))]">
              <div class="entry"><a class="loc"><xsl:attribute name="href"><xsl:value-of select="sm:loc"/></xsl:attribute><xsl:value-of select="sm:loc"/></a><span class="date"><xsl:if test="sm:lastmod">Updated <xsl:value-of select="sm:lastmod"/></xsl:if></span></div>
            </xsl:for-each>
          </section>
          <section><h2>Documentation</h2>
            <xsl:for-each select="sm:urlset/sm:url[contains(sm:loc,'/docs/')]">
              <div class="entry"><a class="loc"><xsl:attribute name="href"><xsl:value-of select="sm:loc"/></xsl:attribute><xsl:value-of select="sm:loc"/></a><span class="date"><xsl:if test="sm:lastmod">Updated <xsl:value-of select="sm:lastmod"/></xsl:if></span></div>
            </xsl:for-each>
          </section>
        </main>
        <footer><div class="wrap">© Ametherian · Published by FoulFoxHacks · <a href="/">Return to website</a></div></footer>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
"""


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
- [Project vision]({BASE}/docs/vision.html)
- [Proposed package map]({BASE}/docs/packages.html)
- [Architecture direction]({BASE}/docs/architecture.html)
- [Security approach]({BASE}/docs/security.html)
- [Proposed roadmap]({BASE}/docs/roadmap.html)
- [Security policy]({BASE}/SECURITY.html)
- [Contributing]({BASE}/CONTRIBUTING.html)

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
- Vision: {BASE}/docs/vision.html
- Package map: {BASE}/docs/packages.html
- Architecture: {BASE}/docs/architecture.html
- Security approach: {BASE}/docs/security.html
- Roadmap: {BASE}/docs/roadmap.html
- Security policy: {BASE}/SECURITY.html
- Contributing: {BASE}/CONTRIBUTING.html

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
            {"path": path, "url": canonical(path)}
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
        write_text(path, source)

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
    write_text("sitemap.xsl", sitemap_xsl())
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
