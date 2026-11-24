import sqlite3, os, json, base64
from pathlib import Path
sid=os.environ.get('OPENCODE_SESSION_ID')
db=r'C:\Users\Sammy J. Belcastro\.local\share\opencode\opencode.db'
con=sqlite3.connect(db)
r=con.execute("select data from session_message where session_id=? and type='user' order by seq limit 1",(sid,)).fetchone()
d=json.loads(r[0])
out=Path('_brand_uploads'); out.mkdir(exist_ok=True)
for i,f in enumerate(d.get('files',[])):
    print(i, {k:v for k,v in f.items() if k not in ('data',)})
    data=f.get('data','')
    head,_,b64=data.partition(',')
    raw=base64.b64decode(b64 or data)
    name=f.get('name') or f'upload-{i}.png'
    p=out/name
    p.write_bytes(raw)
    print('  saved', p, len(raw), head[:60])
    try:
        from PIL import Image
        im=Image.open(p); print('  dims', im.size, im.mode, im.format)
    except Exception as e: print('  PIL error', e)
