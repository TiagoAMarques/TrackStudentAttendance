const fs=require('fs');let source=fs.readFileSync('qa/point-awards.test.cjs','utf8');source=source.slice(0,source.lastIndexOf('main().catch'));
source+=String.raw`
const sql=load('app/public-ranking.ts').publicRankingSql;
sqlite.exec("INSERT INTO leaderboard_preferences VALUES ('course','s1','public','Owl'),('course','s2','public','Fox'),('course','s3','private','Hidden'),('course','s5','public','NotJoined'),('other','s4','public','OtherCourse')");
assert.deepEqual(sqlite.prepare(sql).all('course').map(r=>({...r})),[{nickname:'Owl',points:2,rank:1},{nickname:'Fox',points:0,rank:2}]);
sqlite.exec("INSERT INTO point_transactions(id,course_id,student_id,points,reason,recorded_by,created_at) VALUES ('correction','course','s1',-2,'Correction','teacher',2)");
assert.deepEqual(sqlite.prepare(sql).all('course').map(r=>({...r})),[{nickname:'Fox',points:0,rank:1},{nickname:'Owl',points:0,rank:1}]);
sqlite.exec("UPDATE enrolments SET active=0 WHERE student_id='s2'");assert.equal(sqlite.prepare(sql).all('course').length,1);
for(let i=0;i<65;i++){sqlite.prepare('INSERT INTO students(id,student_number,name) VALUES (?,?,?)').run('rank'+i,'rank'+i,'Private real name '+i);sqlite.prepare('INSERT INTO enrolments(course_id,student_id,checked_in_at) VALUES (?,?,1)').run('course','rank'+i);sqlite.prepare("INSERT INTO leaderboard_preferences VALUES (?,?,'public',?)").run('course','rank'+i,'Animal '+String(i).padStart(2,'0'));}
const rows=sqlite.prepare(sql).all('course');assert.equal(rows.length,50);assert.ok(rows.every(r=>Object.keys(r).sort().join(',')==='nickname,points,rank'));assert.ok(!JSON.stringify(rows).includes('Private real name'));
console.log('PASS: public/joined/active filters, course isolation, corrected totals, shared ranks and top-50 payload without personal fields.');
`;
new Function('require',source)(require);
