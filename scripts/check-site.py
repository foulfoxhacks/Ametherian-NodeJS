#!/usr/bin/env python3
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
errors = []

for page in root.rglob("*.html"):
    if "design-preview" in page.parts:
        continue
    source = page.read_text(encoding="utf-8")
    for token in (
        "<title>", 'name="description"', 'rel="canonical"',
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

for name in ("robots.txt", "sitemap.xml", "llms.txt"):
    if not (root / name).exists():
        errors.append(f"missing required root file: {name}")

try:
    ET.parse(root / "sitemap.xml")
except Exception as exc:
    errors.append(f"invalid sitemap.xml: {exc}")

if errors:
    print("\n".join(errors))
    sys.exit(1)

print("Ametherian static site checks passed.")
