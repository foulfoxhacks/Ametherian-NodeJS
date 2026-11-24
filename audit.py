from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlparse, unquote
import re, json

root = Path('.').resolve()
pages = sorted([p for p in root.rglob('*.html') if 'design-preview' not in p.parts])
all_ids = {}
for p in root.rglob('*.html'):
    src = p.read_text(encoding='utf-8')
    all_ids[p.relative_to(root).as_posix()] = set(re.findall(r'\bid=["\']([^"\']+)["\']', src))

class P(HTMLParser):
    def __init__(self):
        super().__init__(); self.links=[]; self.imgs=[]; self.ids=[]; self.title=''; self.intitle=False; self.headings=[]
    def handle_starttag(self, tag, attrs):
        d=dict(attrs)
        if tag=='a' and 'href' in d: self.links.append(d['href'])
        if tag in ('img','script','link') and ('src' in d or 'href' in d): self.imgs.append((tag,d.get('src') or d.get('href')))
        if 'id' in d: self.ids.append(d['id'])
        if tag in ('h1','h2','h3','h4'):
            self.headings.append(tag)
        if tag=='title': self.intitle=True
    def handle_endtag(self, tag):
        if tag=='title': self.intitle=False
    def handle_data(self, data):
        if self.intitle: self.title += data

print('PAGES')
for p in pages:
    src=p.read_text(encoding='utf-8')
    par=P(); par.feed(src)
    dup=[i for i in set(par.ids) if par.ids.count(i)>1]
    h1=par.headings.count('h1')
    print(f'\n{p.relative_to(root).as_posix()} | title="{par.title.strip()}" | h1={h1} | ids={len(par.ids)} dup={dup}')
    for href in par.links:
        if href.startswith(('#','mailto:','tel:','javascript:')): continue
        u=urlparse(href)
        if u.scheme in ('http','https'):
            continue
        target=(p.parent / unquote(u.path)).resolve()
        if not target.exists():
            print(f'  BROKEN LINK -> {href}')
        elif u.fragment and target.suffix in ('.html','.htm'):
            frag=unquote(u.fragment)
            rel=target.relative_to(root).as_posix()
            if rel in all_ids and frag not in all_ids[rel]:
                print(f'  BROKEN ANCHOR -> {href} (no #{frag})')
    for tag,ref in par.imgs:
        if ref.startswith('http'): continue
        target=(p.parent / ref.split('?')[0]).resolve()
        if not target.exists():
            print(f'  BROKEN {tag.upper()} -> {ref}')
