import sqlite3, os
sid=os.environ.get('OPENCODE_SESSION_ID')
db=r'C:\Users\Sammy J. Belcastro\.local\share\opencode\opencode.db'
con=sqlite3.connect(db)
print('messages')
for r in con.execute("select id,type,seq,substr(data,1,1000) from session_message where session_id=? order by seq desc limit 10",(sid,)):
    print(r[:3]); print(r[3]); print('---')
print('parts')
for r in con.execute("select message_id,ordinal,type,substr(data,1,1500) from session_part where session_id=? order by time_created desc limit 12",(sid,)):
    print(r[0],r[1],r[2]); print(r[3]); print('---')
