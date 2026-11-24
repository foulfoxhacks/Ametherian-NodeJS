import sqlite3, datetime
db=r'C:\Users\Sammy J. Belcastro\.local\share\opencode\opencode.db'
con=sqlite3.connect(db)
rows=con.execute("select hash,mime,bytes,width,height,time_created,length(data) from blob where mime like 'image/%' order by time_created desc limit 40").fetchall()
for r in rows:
    print(r[0][:16], r[1], r[2], r[3], r[4], datetime.datetime.fromtimestamp(r[5]/1000 if r[5]>10**12 else r[5]), r[6])
print('count', con.execute("select count(*) from blob where mime like 'image/%'").fetchone())
