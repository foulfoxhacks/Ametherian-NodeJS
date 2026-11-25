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
from sitegen.release_pages import modules_page, changelog_page, packages as package_rows, baseline_counts  # noqa: E402
from sitegen import i18n  # noqa: E402
from sitegen.companions import build as build_companions  # noqa: E402
import hashlib  # noqa: E402

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
    "modules/index.html": modules_page,
    "changelog/index.html": changelog_page,
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
    if path == "modules/index.html":
        return "Modules"
    if path == "changelog/index.html":
        return "Changelog"
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


DIRECT_INDEX = {"index.html", "docs/index.html", "sitemap/index.html", "modules/index.html", "changelog/index.html", "404.html"}
XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n<?xml-stylesheet type="text/css" href="/assets/sitemap-xml.css"?>\n'
NL = "\n"


def sitemap_index(dates: dict[str, str]) -> str:
    newest = max(dates.values())
    rows = [
        f"  <sitemap><loc>{BASE}/sitemaps/{l['code']}.xml</loc><lastmod>{newest}</lastmod></sitemap>"
        for l in i18n.ALL
    ]
    return XML_HEAD + '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + NL + NL.join(rows) + NL + "</sitemapindex>" + NL


def sitemap_for(locale: dict, dates: dict[str, str]) -> str:
    rows = []
    for path in RENDERERS:
        if path == "404.html":
            continue
        route = ROUTES[path]
        alts = "".join(
            f'{NL}    <xhtml:link rel="alternate" hreflang="{l["hreflang"]}" href="{BASE}{i18n.localized_route(route, l)}"/>'
            for l in i18n.ALL
        ) + f'{NL}    <xhtml:link rel="alternate" hreflang="x-default" href="{BASE}{route}"/>'
        rows.append(f"  <url>{NL}    <loc>{BASE}{i18n.localized_route(route, locale)}</loc>{NL}    <lastmod>{dates[path]}</lastmod>{alts}{NL}  </url>")
    if locale["code"] == "en":
        for extra in ("llms.html", "robots.html"):
            rows.append(f"  <url>{NL}    <loc>{BASE}/{extra}</loc>{NL}    <lastmod>{dates[extra]}</lastmod>{NL}  </url>")
    return (
        XML_HEAD
        + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'
        + NL + NL.join(rows) + NL + "</urlset>" + NL
    )


def _modules_lines() -> str:
    return NL.join(f"- `{r['name']}` {r['version']}: {r['purpose']}" for r in package_rows())

def llms_txt() -> str:
    base = baseline_counts()
    return f"""# Ametherian

> Ametherian is an independent family of modular JavaScript and TypeScript libraries under the @foulfoxhacks npm scope, with a Node.js-first, security-first direction. Ten packages exist as tested previews in the repository. They are licensed under the Apache License 2.0. None is published to npm and none has been audited.

## Important status

- Preview packages are public in the repository and pass CI; they are not published to npm.
- No security audit has been performed. The project is not production-ready.
- The project is independent and is not affiliated with or endorsed by Node.js, the OpenJS Foundation, Axios, Undici, or any other referenced project.
- License: Apache License 2.0 (full text in LICENSE and in every package).
- Supported runtimes: Node.js 22, 24 and 26 at their latest security releases. Node.js 20 is end of life.

## Modules

{_modules_lines()}

## Security model

- Every published advisory for axios and undici is mapped: {base.get('total', 0)} total, {base.get('prevented', 0)} prevented with named regression tests, {base.get('na', 0)} not applicable with a recorded reason.
- A daily workflow checks OSV, the GitHub Advisory Database, NIST NVD and Node.js security releases.

## Documentation

- [Modules]({BASE}/modules/)
- [Changelog]({BASE}/changelog/)
- [Documentation hub]({BASE}/docs/)
- [Project vision]({BASE}/docs/vision/)
- [Package map]({BASE}/docs/packages/)
- [Architecture direction]({BASE}/docs/architecture/)
- [Security approach]({BASE}/docs/security/)
- [Roadmap]({BASE}/docs/roadmap/)
- [Security policy]({BASE}/security/)
- [Contributing]({BASE}/contributing/)

## Languages

The site is available in English, Español (/es/), Português (Brasil) (/pt-br/), Deutsch (/de/), Français (/fr/), Русский (/ru/), 日本語 (/ja/) and 简体中文 (/zh-cn/). The sitemap index at {BASE}/sitemap.xml lists one sitemap per language.

## Project files

- [Vulnerability model]({REPO}/blob/main/docs/vulnerability-model.md)
- [Compatibility policy]({REPO}/blob/main/docs/compatibility.md)
- [Project status]({REPO}/blob/main/PROJECT_STATUS.md)
- [License status]({REPO}/blob/main/LICENSE-STATUS.md)
- [Source repository]({REPO})

## Claim policy

Descriptions on this site distinguish implemented preview code from released software. Compatibility, performance, security and reliability claims require reproducible evidence or an explicit label as goals.
"""


def llms_full_txt() -> str:
    return f"""# Ametherian — full project context

Ametherian is a proposed, independent family of modular JavaScript and TypeScript libraries under the `@foulfoxhacks` npm scope. Its direction is Node.js-first and broader than a single HTTP client: it explores networking, data handling, application infrastructure, developer tooling, and security-conscious engineering.

Ten packages exist as tested previews in the repository (see the Modules section). No packages are published to npm. No security audit has been performed. The project is not production-ready, is not a drop-in replacement for Axios or Undici, and is not affiliated with or endorsed by Node.js, the OpenJS Foundation, Axios, Undici, or any other referenced project. The code is licensed under the Apache License 2.0.

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

- Ametherian's packages are unpublished previews, not released software.
- Candidate package names, capabilities, and roadmap items are provisional.
- The project will not promise complete vulnerability prevention, universal compatibility, or automatic safety for arbitrary consuming applications.
- Third-party names identify technologies and research context only.

## Proposed package areas

- Networking and protocols: HTTP clients, transport adapters, connection pools, proxy support, streaming, protocol utilities, retries, deadlines, and cancellation.
- Data and serialization: validation, schemas, parsing, serialization, conversion, structured data, and safe handling of untrusted input.
- Application infrastructure: caching, queues, concurrency, rate limiting, configuration, dependency boundaries, lifecycle management, and resilience.
- Security engineering: security policy helpers, secure configuration, vulnerability intelligence integrations, dependency and supply-chain review, test fixtures, and regression tooling.
- Observability and developer experience: logging, diagnostics, metrics, tracing, typed errors, test utilities, mocks, fixtures, fuzzing helpers, CLI support, and documentation tooling.

Candidate names from the project brief: `@foulfoxhacks/ametherian`, `-core`, `-http`, `-transport`, `-security`, `-guard`, `-schema`, `-cache`, `-observability`, and `-testing`. All ten now exist as unpublished preview packages in the repository.

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

A package should not be described as stable or production-ready until its API, support matrix, documentation, tests, security review, release process, and maintenance ownership are explicit. The status labels are proposal, active implementation, preview release, and stable release. All ten packages are at the preview stage (version 0.1.0, unpublished); none is stable.

## Project status

The project status report lists the vision as drafted, package taxonomy as proposed, HTTP and transport research as an initial documented direction, the security model as proposed requirements, vulnerability intelligence as a proposed workflow, package implementations as not represented as complete, and security audit as not performed. Progress requires public evidence such as reviewed specifications, threat models, source, tests, changelogs, and releases.

## Modules

{_modules_lines()}

## Project files

- {REPO}
- {REPO}/blob/main/CHANGELOG.md
- {REPO}/blob/main/docs/vulnerability-model.md
- {REPO}/blob/main/PROJECT_STATUS.md
- {REPO}/blob/main/LICENSE-STATUS.md
- {REPO}/blob/main/NOTICE.md
- {REPO}/blob/main/REFERENCES.md
"""


def site_config(dates: dict[str, str]) -> str:
    config = {
        "project": "Ametherian",
        "publisher": "FoulFoxHacks",
        "tagline": "A new kind of Node library ecosystem",
        "status": "preview",
        "version": json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"],
        "siteUrl": BASE,
        "basePath": "",
        "repository": REPO,
        "defaultLocale": "en",
        "locales": [{"code": l["code"], "lang": l["lang"], "name": l["name"], "prefix": l["prefix"] or "/"} for l in i18n.ALL],
        "lastReviewed": max(dates.values()),
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


LASTMOD_FILE = ROOT / "scripts" / "lastmod.json"


def update_lastmod(sources: dict[str, str]) -> dict[str, str]:
    """Content-hash based lastmod: a page's date changes only when its content does."""
    try:
        known = json.loads(LASTMOD_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        known = {}
    out = {}
    for path, source in sources.items():
        # Ignore values that legitimately change without the page changing.
        stable = re.sub(r'"dateModified":\s*"[^"]*"', "", source)
        digest = hashlib.sha256(stable.encode("utf-8")).hexdigest()[:16]
        prev = known.get(path)
        out[path] = {"hash": digest, "date": prev["date"] if prev and prev.get("hash") == digest else TODAY}
    LASTMOD_FILE.write_text(json.dumps(out, indent=2, sort_keys=True) + NL, encoding="utf-8")
    return {k: v["date"] for k, v in out.items()}


def strip_markers(source: str) -> str:
    return source.replace("<!--HREFLANG-->", "").replace("<!--LANG-SWITCH-->", "")


def translated_search_index(entries: list[dict], locale: dict) -> list[dict]:
    table = i18n.catalog(locale["code"])

    def tr(text: str) -> str:
        return table.get(i18n.norm(text), text)

    out = []
    for e in entries:
        out.append({
            **e,
            "path": i18n.localized_route(e["path"], locale),
            "title": tr(e["title"]),
            "section": tr(e["section"]),
            "description": tr(e["description"]),
            "headings": [{**h, "text": tr(h["text"])} for h in e["headings"]],
        })
    return out


def write_search(name: str, entries: list[dict]) -> None:
    payload = json.dumps(entries, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    write_text(name, "/* Generated by scripts/build_site.py. */" + NL + f"window.AMETHERIAN_SEARCH = {payload};" + NL)


def main() -> None:
    rendered = {path: renderer() for path, renderer in RENDERERS.items()}
    companions = build_companions()
    translated_routes = {ROUTES[p] for p in RENDERERS if p != "404.html"}

    dates = update_lastmod({**{p: strip_markers(s) for p, s in rendered.items()}, **companions})

    for path, source in rendered.items():
        route = ROUTES[path]
        if path == "404.html":
            english = strip_markers(i18n.decorate(source.replace("<!--HREFLANG-->", ""), "/", i18n.DEFAULT))
        else:
            english = i18n.decorate(source, route, i18n.DEFAULT)
        if path in DIRECT_INDEX:
            write_text(path, english)
        else:
            write_text(ROUTES[path].lstrip("/") + "index.html", english)
            write_text(path, strip_markers(legacy_redirect(path)))
        if path == "404.html":
            continue
        for locale in i18n.LOCALES:
            local = i18n.translate_page(source, locale, route, translated_routes)
            write_text(i18n.localized_route(route, locale).lstrip("/") + "index.html", i18n.decorate(local, route, locale))

    for name, source in companions.items():
        write_text(name, i18n.decorate(source, "/", i18n.DEFAULT).replace("<!--HREFLANG-->", ""))

    index = search_index(rendered)
    write_search("assets/search-index.js", index)
    for locale in i18n.LOCALES:
        write_search(f"assets/search-index.{locale['code']}.js", translated_search_index(index, locale))

    write_text("sitemap.xml", sitemap_index(dates))
    for locale in i18n.ALL:
        write_text(f"sitemaps/{locale['code']}.xml", sitemap_for(locale, dates))
    write_text("llms.txt", llms_txt())
    write_text("llms-full.txt", llms_full_txt())
    write_text("site.config.json", site_config(dates))
    write_text("assets/site.webmanifest", webmanifest())
    write_text(
        "robots.txt",
        "# Ametherian: public project site and documentation. Search and AI crawlers may read this site." + NL
        + "User-agent: *" + NL
        + "Allow: /" + NL
        + "Disallow: /404.html" + NL + NL
        + f"Sitemap: {BASE}/sitemap.xml" + NL,
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
    write_text("scripts/og-manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False) + NL)
    print(f"{NL}Built {len(rendered)} pages x {len(i18n.ALL)} languages, {len(index)} search entries.")


if __name__ == "__main__":
    main()
