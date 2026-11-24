import sys
sys.path.insert(0,'scripts')
from sitegen.common import PAGES
print(repr(PAGES['index.html']['title']))
from pathlib import Path
b=Path('index.html').read_bytes()
i=b.find(b'<title>')
print(b[i:i+70])
