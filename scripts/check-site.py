#!/usr/bin/env python3
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
errors = []

for page in root.rglob("*.html"):
    if "design-preview" in page.parts or page.name == "_asset_test.html":
        continue
    source = page.read_text(encoding="utf-8")
    for token in (
        "<title>", 'name="description"', 'name="publisher"', 'rel="canonical"',
        'property="og:title"', 'property="og:description"',
        'property="og:image"', 'property="og:image:alt"',
        'name="twitter:card"', "application/ld+json",
    ):
        if token not in source:
            errors.append(f"{page.relative_to(root)}: missing {token}")
    for image in re.finditer(r"<img\b([^>]*)>", source, flags=re.I):
        if not re.search(r"\balt\s*=", image.group(1), flags=re.I):
            errors.append(f"{page.relative_to(root)}: image missing alt attribute")
    for anchor in re.finditer(r"<a\b([^>]*)>", source, flags=re.I):
        if not re.search(r"\bhref\s*=", anchor.group(1), flags=re.I):
            errors.append(f"{page.relative_to(root)}: anchor missing href")

for name in ("robots.txt", "sitemap.xml", "llms.txt", "llms-full.txt", "llms.html", "robots.html", "site.config.json"):
    if not (root / name).exists():
        errors.append(f"missing required root file: {name}")

for route in ("/llms/",):
    if (root / route.strip("/") / "index.html").exists():
        errors.append(f"obsolete route must not be published: {route}")

clean_routes = {
    "/": "index.html",
    "/docs/": "docs/index.html",
    "/docs/vision/": "docs/vision/index.html",
    "/docs/packages/": "docs/packages/index.html",
    "/docs/architecture/": "docs/architecture/index.html",
    "/docs/security/": "docs/security/index.html",
    "/docs/roadmap/": "docs/roadmap/index.html",
    "/security/": "security/index.html",
    "/contributing/": "contributing/index.html",
    "/sitemap/": "sitemap/index.html",
}
for route, output in clean_routes.items():
    if not (root / output).is_file():
        errors.append(f"missing clean route {route}: expected {output}")

for page in root.rglob("*.html"):
    if "design-preview" in page.parts or page.name == "_asset_test.html":
        continue
    source = page.read_text(encoding="utf-8")
    for href in re.findall(r'href="([^"]+)"', source, flags=re.I):
        if href.startswith(("http://", "https://", "mailto:", "tel:", "#")):
            continue
        path = href.split("#", 1)[0].split("?", 1)[0]
        if path.lower().endswith(".html") and path.lower() != "/404.html":
            if not (root / path.lstrip("/")).exists():
                errors.append(f"{page.relative_to(root)}: broken internal HTML link: {href}")

try:
    sitemap_tree = ET.parse(root / "sitemap.xml")
    if not sitemap_tree.getroot().tag.endswith("urlset"):
        errors.append("sitemap.xml: root element must be urlset")
    sitemap_source = (root / "sitemap.xml").read_text(encoding="utf-8")
    if "sitemap.xsl" in sitemap_source or "text/xsl" in sitemap_source:
        errors.append("sitemap.xml: XSLT is not permitted; use a CSS stylesheet")
    if '<?xml-stylesheet type="text/css" href="/assets/sitemap-xml.css"?>' not in sitemap_source:
        errors.append("sitemap.xml: missing direct CSS stylesheet reference")
    if not (root / "assets/sitemap-xml.css").is_file():
        errors.append("sitemap.xml: referenced CSS stylesheet is missing")
    locations = [
        node.text or "" for node in sitemap_tree.getroot()
        if node.tag.endswith("url") for node in node if node.tag.endswith("loc")
    ]
    allowed_html_locations = {
        "https://ametherian.foulfoxhacks.dev/llms.html",
        "https://ametherian.foulfoxhacks.dev/robots.html",
    }
    if any(location.lower().endswith(".html") and location not in allowed_html_locations for location in locations):
        errors.append("sitemap.xml: generated route locations must use clean URLs; only TXT companion pages may use .html")
    if any(location.rstrip("/").endswith("/llms") for location in locations):
        errors.append("sitemap.xml: obsolete /llms/ route must not be listed")
    for required_url in ("https://ametherian.foulfoxhacks.dev/llms.html", "https://ametherian.foulfoxhacks.dev/robots.html"):
        if required_url not in locations:
            errors.append(f"sitemap.xml: missing companion page {required_url}")
except Exception as exc:
    errors.append(f"invalid sitemap.xml: {exc}")

for required in (
    "sitemap/index.html",
    "assets/sitemap.js",
    "assets/sitemap.css",
    "assets/sitemap-xml.css",
    "assets/text-docs.css",
    "scripts/build_text_pages.py",
):
    if not (root / required).is_file():
        errors.append(f"missing required presentation asset: {required}")

for page_name, expected_raw in (("llms.html", "llms.txt"), ("robots.html", "robots.txt")):
    source = (root / page_name).read_text(encoding="utf-8") if (root / page_name).exists() else ""
    if f'href="/{expected_raw}"' not in source:
        errors.append(f"{page_name}: missing link to original {expected_raw}")
    if "/assets/text-docs.css" not in source:
        errors.append(f"{page_name}: missing companion stylesheet")

for raw_name in ("llms.txt", "robots.txt"):
    raw = (root / raw_name).read_text(encoding="utf-8")
    if "<link" in raw.lower() or "<style" in raw.lower():
        errors.append(f"{raw_name}: raw machine-readable text must not contain HTML styling")

if errors:
    print("\n".join(errors))
    sys.exit(1)
print("Ametherian static site checks passed.")
