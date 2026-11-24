import sqlite3, os, json
sid=os.environ.get('OPENCODE_SESSION_ID')
db=r'C:\Users\Sammy J. Belcastro\.local\share\opencode\opencode.db'
con=sqlite3.connect(db)
for r in con.execute("select id,type,seq,data from session_message where session_id=? and type='user' order by seq",(sid,)):
    d=json.loads(r[3])
    print('SEQ',r[2], 'keys', d.keys())
    for part in d.get('content',[]):
        t=part.get('type')
        print(' part',t, {k:(str(v)[:200]) for k,v in part.items() if k!='type'})
    print('---')
