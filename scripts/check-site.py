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

for name in ("robots.txt", "sitemap.xml", "llms.txt", "llms-full.txt", "site.config.json"):
    if not (root / name).exists():
        errors.append(f"missing required root file: {name}")

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
    "/llms/": "llms/index.html",
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
            errors.append(f"{page.relative_to(root)}: internal link uses legacy .html URL: {href}")

try:
    sitemap_tree = ET.parse(root / "sitemap.xml")
    if not sitemap_tree.getroot().tag.endswith("urlset"):
        errors.append("sitemap.xml: root element must be urlset")
    sitemap_source = (root / "sitemap.xml").read_text(encoding="utf-8")
    if "xml-stylesheet" in sitemap_source or "sitemap.xsl" in sitemap_source:
        errors.append("sitemap.xml: must not depend on XSLT; use the CSS-first /sitemap/ viewer")
    sitemap_locations = [
        node.text or ""
        for node in sitemap_tree.getroot()
        if node.tag.endswith("url")
        for node in node
        if node.tag.endswith("loc")
    ]
    if any(location.lower().endswith(".html") for location in sitemap_locations):
        errors.append("sitemap.xml: public locations must use clean URLs without .html")
except Exception as exc:
    errors.append(f"invalid sitemap.xml: {exc}")

for required in (
    "sitemap/index.html",
    "llms/index.html",
    "assets/sitemap.js",
    "assets/sitemap.css",
    "assets/resources.css",
    "assets/resources.js",
):
    if not (root / required).is_file():
        errors.append(f"missing required presentation asset: {required}")

sitemap_script = (root / "assets/sitemap.js").read_text(encoding="utf-8")
if "XSLTProcessor" in sitemap_script or "sitemap.xsl" in sitemap_script:
    errors.append("assets/sitemap.js: visual sitemap must not use XSLT")

if errors:
    print("\n".join(errors))
    sys.exit(1)

print("Ametherian static site checks passed.")
