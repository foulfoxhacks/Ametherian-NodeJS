import sqlite3
db=r'C:\Users\Sammy J. Belcastro\.local\share\opencode\opencode.db'
con=sqlite3.connect(db)
for row in con.execute("select name, sql from sqlite_master where type='table'"):
    print(row[0])
    print(row[1][:500])
    print()
