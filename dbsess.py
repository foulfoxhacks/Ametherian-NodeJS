import sqlite3, os, json
sid=os.environ.get('OPENCODE_SESSION_ID')
print('session', sid)
db=r'C:\Users\Sammy J. Belcastro\.local\share\opencode\opencode.db'
con=sqlite3.connect(db)
# find recent sessions
for r in con.execute("select id,title,directory,time_created from session_v2 order by time_created desc limit 10"):
    print(r)
print('--- parts with file/image for recent session ---')
for r in con.execute("select session_id,type,data from session_part where session_id=? order by time_created desc limit 20",(sid,)):
    print(r[1], r[2][:500])
