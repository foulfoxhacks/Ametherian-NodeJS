#!/usr/bin/env python3
from pathlib import Path
import re, sys, xml.etree.ElementTree as ET
root=Path(__file__).resolve().parents[1]
errors=[]
for p in root.rglob('*.html'):
 s=p.read_text(encoding='utf-8')
 for token in ['<title>','name="description"','rel="canonical"','property="og:title"','property="og:description"','property="og:image"','property="og:image:alt"','name="twitter:card"','application/ld+json']:
  if token not in s: errors.append(f'{p.relative_to(root)} missing {token}')
 for m in re.finditer(r'<img\\b([^>]*)>',s,re.I):
  if not re.search(r'\\balt\\s*=',m.group(1),re.I): errors.append(f'{p.relative_to(root)} image missing alt')
for name in ['robots.txt','sitemap.xml','llms.txt']:
 if not (root/name).exists(): errors.append(f'missing {name}')
try: ET.parse(root/'sitemap.xml')
except Exception as e: errors.append(f'invalid sitemap: {e}')
if errors:
 print('\\n'.join(errors)); sys.exit(1)
print('Ametherian static site checks passed.')
