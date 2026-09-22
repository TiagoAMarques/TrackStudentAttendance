import sqlite3,pathlib
d=sqlite3.connect(':memory:')
for p in sorted(pathlib.Path('drizzle').glob('*.sql')): d.executescript(p.read_text())
d.execute("INSERT INTO users VALUES ('u','u@test','Teacher',0)")
d.execute("INSERT INTO courses(id,code,name,owner_id,created_at) VALUES ('c','EN2026','Course','u',0)")
q='INSERT INTO scheduled_classes(id,course_id,class_id,class_date,week,class_time,room,teacher,imported_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(course_id,class_id) DO NOTHING'
d.execute(q,('s','c','ENT1','2026-09-14',1,'12:00','3.2.15','TAM','u',0))
d.execute(q,('s2','c','ent1','2026-09-14',1,'12:00','3.2.15','TAM','u',0))
assert d.execute('SELECT count(*) FROM scheduled_classes').fetchone()[0]==1
assert d.execute('SELECT count(*) FROM class_sessions').fetchone()[0]==0
print('Migration and duplicate import passed; scheduled imports open no live sessions.')
