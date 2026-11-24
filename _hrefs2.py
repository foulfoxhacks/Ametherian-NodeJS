from html.parser import HTMLParser
from pathlib import Path
class P(HTMLParser):
    def __init__(self):
        super().__init__(); self.hrefs=[]
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        if tag=='a' and 'href' in d: self.hrefs.append((d.get('aria-label') or d.get('title') or '', d['href']))
p=P(); p.feed(Path('index.html').read_text(encoding='utf-8'))
for a,h in p.hrefs:
    if 'http' in h and 'foulfoxhacks' not in h and 'github.com' not in h: print(a,'=>',h)
