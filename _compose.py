from pathlib import Path
part = Path('scripts/_content_home.py').read_text(encoding='utf-8')
part = part.replace('return site_shell(current, body)\n', 'return site_shell(current, body, FAQS)\n')
header = '''"""Page content for the Ametherian site."""\n\nfrom .common import *\n\n'''
Path('scripts/sitegen/pages.py').write_text(header + part, encoding='utf-8')
print('pages.py lines:', len(Path('scripts/sitegen/pages.py').read_text(encoding='utf-8').splitlines()))
