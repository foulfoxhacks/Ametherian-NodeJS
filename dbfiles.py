import sqlite3, os, json
sid=os.environ.get('OPENCODE_SESSION_ID')
db=r'C:\Users\Sammy J. Belcastro\.local\share\opencode\opencode.db'
con=sqlite3.connect(db)
r=con.execute("select data from session_message where session_id=? and type='user' order by seq limit 1",(sid,)).fetchone()
d=json.loads(r[0])
print(json.dumps(d.get('files'), indent=2)[:5000])
print('text:', d.get('text','')[:1000])
