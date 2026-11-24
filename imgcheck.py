from pathlib import Path
import base64,re
for f in ['assets/ametherian-mark.svg','assets/ametherian-logo.svg']:
    s=Path(f).read_text(encoding='utf-8')
    m=re.search(r'base64,([^"\']+)',s)
    data=base64.b64decode(m.group(1))
    out=Path('_test_'+Path(f).stem+'.png'); out.write_bytes(data)
    print(f, 'embedded bytes', len(data), 'header', data[:8].hex())
from PIL import Image
for f in ['_test_ametherian-mark.png','_test_ametherian-logo.png']:
    try:
        im=Image.open(f); print(f, im.size, im.mode, im.format)
    except Exception as e: print(f,'ERROR',e)
p=Path('assets/ametherian-logo.png').read_bytes()
print('assets/ametherian-logo.png bytes', len(p), 'header', p[:16].hex())
