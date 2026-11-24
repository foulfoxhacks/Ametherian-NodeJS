from pathlib import Path
from PIL import Image
import os, datetime
base=Path(r'C:\Users\Sammy J. Belcastro\AppData\Local\Temp')
files=[p for p in base.glob('*.png') if p.is_file()]
files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
for p in files[:25]:
    try:
        im=Image.open(p)
        print(f'{p.name}\t{im.size}\t{im.mode}\t{p.stat().st_size}\t{datetime.datetime.fromtimestamp(p.stat().st_mtime)}')
    except Exception as e:
        print(f'{p.name}\tERROR {e}\t{p.stat().st_size}')
