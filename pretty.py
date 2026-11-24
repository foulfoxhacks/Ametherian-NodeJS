from pathlib import Path
import re
for name in ['index.html','docs/vision.html','SECURITY.html','CONTRIBUTING.html']:
    p=Path(name)
    s=p.read_text(encoding='utf-8')
    s=re.sub(r'><', '>\n<', s)
    Path('_inspect_'+p.name.replace('.html','')+'.txt').write_text(s, encoding='utf-8')
    print(name, len(s.splitlines()), 'lines')
