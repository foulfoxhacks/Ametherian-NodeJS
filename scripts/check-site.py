#!/usr/bin/env python3
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
errors = []

for page in root.rglob("*.html"):
    if "design-preview" in page.parts or page.name == "_asset_test.html" or "node_modules" in page.parts:
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
    "/modules/": "modules/index.html",
    "/changelog/": "changelog/index.html",
}
for route, output in clean_routes.items():
    if not (root / output).is_file():
        errors.append(f"missing clean route {route}: expected {output}")

for page in root.rglob("*.html"):
    if "design-preview" in page.parts or page.name == "_asset_test.html" or "node_modules" in page.parts:
        continue
    source = page.read_text(encoding="utf-8")
    for href in re.findall(r'href="([^"]+)"', source, flags=re.I):
        if href.startswith(("http://", "https://", "mailto:", "tel:", "#")):
            continue
        path = href.split("#", 1)[0].split("?", 1)[0]
        if path.lower().endswith(".html") and path.lower() != "/404.html":
            if not (root / path.lstrip("/")).exists():
                errors.append(f"{page.relative_to(root)}: broken internal HTML link: {href}")

sys.path.insert(0, str(root / "scripts"))
from sitegen import i18n  # noqa: E402

BASE = "https://ametherian.foulfoxhacks.dev"
NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
CSS_PI = '<?xml-stylesheet type="text/css" href="/assets/sitemap-xml.css"?>'
all_locations = []
try:
    index_source = (root / "sitemap.xml").read_text(encoding="utf-8")
    index_tree = ET.parse(root / "sitemap.xml")
    if index_tree.getroot().tag != NS + "sitemapindex":
        errors.append("sitemap.xml: root element must be sitemapindex")
    if "text/xsl" in index_source:
        errors.append("sitemap.xml: XSLT is not permitted; use a CSS stylesheet")
    if CSS_PI not in index_source:
        errors.append("sitemap.xml: missing direct CSS stylesheet reference")
    children = [n.findtext(NS + "loc") for n in index_tree.getroot().findall(NS + "sitemap")]
    expected = [f"{BASE}/sitemaps/{l['code']}.xml" for l in i18n.ALL]
    if children != expected:
        errors.append(f"sitemap.xml: index must list exactly one sitemap per language: {expected}")
    for child in expected:
        rel = child.replace(BASE + "/", "")
        if not (root / rel).is_file():
            errors.append(f"{rel}: missing language sitemap")
            continue
        source = (root / rel).read_text(encoding="utf-8")
        if CSS_PI not in source:
            errors.append(f"{rel}: missing CSS stylesheet reference")
        tree = ET.parse(root / rel)
        if tree.getroot().tag != NS + "urlset":
            errors.append(f"{rel}: root element must be urlset")
        for url in tree.getroot().findall(NS + "url"):
            loc = url.findtext(NS + "loc") or ""
            all_locations.append(loc)
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", url.findtext(NS + "lastmod") or ""):
                errors.append(f"{rel}: {loc} missing lastmod")
            local = loc.replace(BASE, "")
            target = root / (local.lstrip("/") + ("index.html" if local.endswith("/") else ""))
            if not target.is_file():
                errors.append(f"{rel}: {loc} does not exist in the build")
    if len(set(all_locations)) != len(all_locations):
        errors.append("sitemaps: duplicate URLs across language sitemaps")
    allowed_html = {f"{BASE}/llms.html", f"{BASE}/robots.html"}
    if any(l.endswith(".html") and l not in allowed_html for l in all_locations):
        errors.append("sitemaps: only the TXT companion pages may use .html URLs")
    if any(l.rstrip("/").endswith("/llms") for l in all_locations):
        errors.append("sitemaps: obsolete /llms/ route must not be listed")
    for required_url in allowed_html:
        if required_url not in all_locations:
            errors.append(f"sitemaps: missing companion page {required_url}")
except Exception as exc:
    errors.append(f"invalid sitemaps: {exc}")

robots_txt = (root / "robots.txt").read_text(encoding="utf-8")
if f"Sitemap: {BASE}/sitemap.xml" not in robots_txt:
    errors.append("robots.txt: must point to the sitemap index")

# Every localized page: lang, canonical, hreflang set, language switcher.
for loc in all_locations:
    local = loc.replace(BASE, "")
    if local.endswith(".html"):
        continue
    page = root / (local.lstrip("/") + "index.html")
    if not page.is_file():
        continue
    source = page.read_text(encoding="utf-8")
    locale = next((l for l in i18n.LOCALES if local.startswith(l["prefix"] + "/")), i18n.DEFAULT)
    if f'<html lang="{locale["lang"]}"' not in source:
        errors.append(f"{local}: html lang must be {locale['lang']}")
    if f'<link rel="canonical" href="{loc}">' not in source:
        errors.append(f"{local}: canonical must be {loc}")
    for l in i18n.ALL:
        if f'hreflang="{l["hreflang"]}"' not in source:
            errors.append(f"{local}: missing hreflang {l['hreflang']}")
    if 'hreflang="x-default"' not in source:
        errors.append(f"{local}: missing hreflang x-default")
    if "data-lang-switch" not in source or "data-theme-toggle" not in source:
        errors.append(f"{local}: missing language switcher or theme toggle")
    if "<!--HREFLANG-->" in source or "<!--LANG-SWITCH-->" in source:
        errors.append(f"{local}: unreplaced build marker")

# Companion pages use the real site header and footer.
for name in ("llms.html", "robots.html"):
    source = (root / name).read_text(encoding="utf-8")
    if 'class="site-header"' not in source or 'class="site-footer"' not in source:
        errors.append(f"{name}: must use the site header and footer")

# No page may link the removed /llms/ route.
for page in root.rglob("*.html"):
    if any(part in {"node_modules", ".git"} for part in page.parts):
        continue
    if 'href="/llms/"' in page.read_text(encoding="utf-8"):
        errors.append(f"{page.relative_to(root)}: links the removed /llms/ route")

# Translation coverage: every translatable English segment must exist in every catalog.
english = sorted({p for p in all_locations if not any(p.startswith(BASE + l["prefix"] + "/") for l in i18n.LOCALES) and not p.endswith(".html")})
segments = set()
for loc in english:
    local = loc.replace(BASE, "")
    segments.update(i18n.extract((root / (local.lstrip("/") + "index.html")).read_text(encoding="utf-8")))
for l in i18n.LOCALES:
    table = i18n.catalog(l["code"])
    missing = sorted(seg for seg in segments if seg not in table)
    if missing:
        errors.append(f"i18n/{l['code']}.json: {len(missing)} untranslated segment(s), e.g. {missing[0][:80]!r}")

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
