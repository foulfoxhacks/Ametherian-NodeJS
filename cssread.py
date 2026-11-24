from pathlib import Path
s=Path('assets/site.css').read_text(encoding='utf-8')
for i,line in enumerate(s.splitlines(),1):
    print(f'{i:3}: {line[:240]}')
