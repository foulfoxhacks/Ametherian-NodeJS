from pathlib import Path
import re
s = Path('index.html').read_text(encoding='utf-8')
print('FAQPage count', s.count('FAQPage'))
print('nav hrefs', re.findall(r'<nav class="site-nav".*?</nav>', s, re.S)[0][:400])
d = Path('docs/vision.html').read_text(encoding='utf-8')
print('vision links:')
for h in re.findall(r'href="([^"]+)"', d):
    print(h)
