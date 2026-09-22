// Integration tests execute the actual server actions and queries against SQLite.
// All records are synthetic and in-memory; no live credentials or database used.
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const ts=require('typescript');
const assert=require('node:assert/strict');
const {createHash,randomUUID}=require('node:crypto');
const sqlite=new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON');
for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')&&n<'0008').sort())sqlite.exec(fs.readFileSync('drizzle/'+name,'utf8'));
let time=1800000000;
sqlite.exec(`
INSERT INTO users VALUES ('teacher','teacher@example.test','Teacher',1);
INSERT INTO courses(id,code,name,owner_id,created_at) VALUES ('course','TEST','Test course','teacher',1),('other','OTHER','Other course','teacher',1);
INSERT INTO course_teachers VALUES ('course','teacher','owner','teacher',1);
INSERT INTO class_sessions(id,course_id,title,attendance_token_digest,attendance_expires_at,opened_by,opened_at) VALUES ('session','course','Class 1','attendance',1900000000,'teacher',1),('foreign','other','Other class','foreign',1900000000,'teacher',1);
INSERT INTO students(id,student_number,name,email) VALUES ('s1','fc1','Student One','one@example.test'),('s2','fc2','Student Two','two@example.test'),('s3','fc3','Student Three','three@example.test'),('s4','fc4','Student Four','four@example.test'),('s5','fc5','Student Five','five@example.test');
INSERT INTO enrolments(course_id,student_id,active,checked_in_at) VALUES ('course','s1',1,1),('course','s2',1,1),('course','s3',1,1),('other','s4',1,1),('course','s5',1,NULL);
INSERT INTO point_awards(id,session_id,points,reason,token_digest,awarded_by,expires_at,created_at) VALUES ('legacy','session',2,'Legacy award','legacy-token','teacher',1900000000,1);
INSERT INTO point_transactions(id,award_id,course_id,student_id,points,reason,recorded_by,created_at) VALUES ('legacy-claim','legacy','course','s1',2,'Legacy award','teacher',1);
`);
const legacyBefore=sqlite.prepare('SELECT * FROM point_transactions').all();
sqlite.exec('BEGIN');
try {sqlite.exec(fs.readFileSync('drizzle/0008_independent_point_awards.sql','utf8'));assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}
assert.deepEqual(sqlite.prepare('SELECT * FROM point_transactions').all(),legacyBefore);
assert.equal(sqlite.prepare("SELECT restricted FROM point_awards WHERE id='legacy'").get().restricted,0);
sqlite.exec(fs.readFileSync('drizzle/0009_point_award_expiry_modes.sql','utf8'));
assert.equal(sqlite.prepare("SELECT expiry_mode FROM point_awards WHERE id='legacy'").get().expiry_mode,'timed');
sqlite.exec(fs.readFileSync('drizzle/0010_permanent_onboarding_qr.sql','utf8'));
sqlite.exec(fs.readFileSync('drizzle/0012_identity_integrity.sql','utf8'));
sqlite.exec(fs.readFileSync('drizzle/0013_point_transaction_source.sql','utf8'));
const db={prepare(sql){let params=[];return {bind(...p){params=p;return this},async first(){return sqlite.prepare(sql).get(...params)??null},async all(){return {results:sqlite.prepare(sql).all(...params)}},async run(){const r=sqlite.prepare(sql).run(...params);return {meta:{changes:Number(r.changes)}}}}},async batch(statements){sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}};
let user={userId:'teacher',email:'teacher@example.test',displayName:'Teacher'};
function load(file,imports={}){const module={exports:{}};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',js)(name=>{if(name in imports)return imports[name];throw Error('Unexpected import '+name)},module,module.exports);return module.exports;}
const policy=load('app/point-award-policy.ts');
const security=load('app/request-security.ts',{'cloudflare:workers':{env:{DB:db}},'next/headers':{headers:async()=>new Map()}});
const records=load('app/course-records.ts',{'cloudflare:workers':{env:{DB:db}}});
const actions=load('app/actions.ts',{
 'cloudflare:workers':{env:{DB:db}},'next/cache':{revalidatePath(){}},'next/headers':{headers:async()=>new Map(),cookies:async()=>({set(){}})},
 './request-security':security,
 './chatgpt-auth':{getChatGPTUser:async()=>user},'./point-award-policy':policy,'./student-number':load('app/student-number.ts'),'./redemption-errors':load('app/redemption-errors.ts'),
 './data':{ensureTeacher:async()=>({id:'course',code:'TEST',name:'Test course'}),id:randomUUID,now:()=>time,digestToken:async t=>createHash('sha256').update(t).digest('hex'),initials:()=>''},
 './roster-import':load('app/roster-import.ts'),'./attendance-import':load('app/attendance-import.ts'),'./animal-nicknames':{ANIMAL_NICKNAMES:['Owl','Fox','Bear']},'./pilot-auth':{},'./course-records':records,'./timetable':{},
});
process.env.PILOT_MODE='true';
process.env.PILOT_ALLOW_UNVERIFIED_STUDENTS='true';
const input={sessionId:null,points:3,reason:'Independent work',expiresSeconds:300};
const token=r=>r.urlPath.split('/').pop();
async function main(){
  const errors=load('app/redemption-errors.ts');
  assert.match((await errors.diagnoseRedemptionFailure(db,'attendance','attendance','s5',time)).message,/ATT-JOIN-FIRST/);
  assert.match((await errors.diagnoseRedemptionFailure(db,'attendance','attendance','s4',time)).message,/ATT-NOT-ENROLLED/);
  assert.match((await errors.diagnoseRedemptionFailure(db,'attendance','missing','s1',time)).message,/ATT-QR-UNKNOWN/);
  sqlite.exec("UPDATE class_sessions SET closed_at=2 WHERE id='session'");
  assert.match((await errors.diagnoseRedemptionFailure(db,'attendance','attendance','s1',time)).message,/ATT-CLASS-CLOSED/);
  sqlite.exec("UPDATE class_sessions SET closed_at=NULL,attendance_expires_at=1 WHERE id='session'");
  assert.match((await errors.diagnoseRedemptionFailure(db,'attendance','attendance','s1',time)).message,/ATT-QR-EXPIRED/);
  sqlite.exec("UPDATE class_sessions SET attendance_expires_at=1900000000 WHERE id='session'");
  assert.match((await actions.redeemPilot('onboarding','missing','not-a-number')).message,/JOIN-NUMBER-NOT-FOUND/);
  const all=await actions.createAward(input);
  assert.equal((await actions.redeemPilot('points',token(all),'fc1')).ok,true);
  assert.equal((await actions.redeemPilot('points',token(all),'fc2')).ok,true);
  assert.match((await actions.redeemPilot('points',token(all),'fc1')).message,/already/);
  assert.equal((await actions.redeemPilot('points',token(all),'fc4')).ok,false);
  assert.equal((await actions.redeemPilot('points',token(all),'fc5')).ok,false);
  const selected=await actions.createAward({...input,recipientStudentNumbers:['fc1','FC2','fc1']});
  assert.match((await actions.redeemPilot('points',token(selected),'fc3')).message,/PTS-NOT-SELECTED/);
  assert.equal((await actions.choosePilotNickname('points',token(selected),'fc3','Owl')).ok,false);
  assert.equal((await actions.redeemPilot('points',token(selected),'fc1')).ok,true);
  assert.equal((await actions.redeemPilot('points',token(selected),'fc2')).ok,true);
  assert.equal((await actions.choosePilotNickname('points',token(selected),'fc1','Owl')).ok,true);
  const single=await actions.createAward({...input,recipientStudentNumbers:['fc1']});
  assert.equal((await actions.redeemPilot('points',token(single),'fc2')).ok,false);
  const simultaneous=await Promise.all([actions.redeemPilot('points',token(single),'fc1'),actions.redeemPilot('points',token(single),'fc1')]);
  assert.equal(simultaneous.filter(r=>r.ok&&!r.message.includes('already')).length,1);
  assert.equal(simultaneous.filter(r=>r.message.includes('already')).length,1);
  for(const patch of [{recipientStudentNumbers:[]},{recipientStudentNumbers:['fc4']},{recipientStudentNumbers:['fc5']},{sessionId:'foreign'},{points:NaN},{points:1.2},{expiresSeconds:NaN}])await assert.rejects(()=>actions.createAward({...input,...patch}));
  const classAward=await actions.createAward({...input,sessionId:'session',recipientStudentNumbers:['fc2']});
  assert.equal((await actions.redeemPilot('points',token(classAward),'fc1')).ok,false);
  assert.equal((await actions.redeemPilot('points',token(classAward),'fc2')).ok,true);
  sqlite.exec("UPDATE class_sessions SET closed_at=2 WHERE id='session'");
  assert.equal((await actions.redeemPilot('points',token(classAward),'fc2')).ok,false);
  await assert.rejects(()=>actions.createAward({...input,sessionId:'session'}));
  assert.equal((await actions.redeemPilot('points',token(all),'fc3')).ok,true);
  sqlite.exec("UPDATE point_awards SET expires_at=1 WHERE reason='Independent work'");
  assert.equal((await actions.redeemPilot('points',token(all),'fc1')).ok,false);
  // Authenticated redemption must enforce exactly the same recipient policy.
  const signed=await actions.createAward({...input,recipientStudentNumbers:['fc1']});
  sqlite.exec("INSERT INTO student_identity_links VALUES ('sites','signed-two','s2','teacher',1),('sites','signed-one','s1','teacher',1)");
  user={userId:'signed-two',email:'two@example.test',displayName:'Student Two',identityProvider:'sites',identitySubject:'signed-two'};
  assert.equal((await actions.redeem('points',token(signed))).ok,false);
  user={userId:'signed-one',email:'one@example.test',displayName:'Student One',identityProvider:'sites',identitySubject:'signed-one'};
  assert.equal((await actions.redeem('points',token(signed))).ok,true);
  assert.match((await actions.redeem('points',token(signed))).message,/already/);
  user={userId:'teacher',email:'teacher@example.test',displayName:'Teacher'};
  const report=await records.loadCourseRecords('course');
  const independent=report.events.find(e=>e.eventType==='Points earned'&&e.session==='Independent coursework');
  assert.ok(independent);
  await actions.reversePointTransaction(independent.id,'Test correction');
  const corrected=await records.loadCourseRecords('course');
  assert.ok(corrected.events.some(e=>e.eventType==='Points reversed'&&e.session==='Independent coursework'));
  const backup=await records.loadCourseBackup('course');assert.ok(backup.awards.some(a=>a.session_id===null));assert.ok(backup.awardRecipients.length);
  assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
  const classTotal=sqlite.prepare("SELECT SUM(pt.points) AS n FROM point_transactions pt LEFT JOIN point_awards pa ON pa.id=pt.award_id WHERE pa.session_id='session'").get().n;
  assert.equal(classTotal,5); // legacy 2 + class award 3; independent work excluded.
  // Prefix mismatch regression: all pilot routes resolve fc1 and 1 identically.
  const numbers=load('app/student-number.ts');
  assert.equal((await numbers.findPilotStudent(db,' 1 ')).id,'s1');
  assert.equal((await numbers.findPilotStudent(db,'FC1')).id,'s1');
  assert.equal(await numbers.findPilotStudent(db,'one@example.test'),null);
  sqlite.exec("INSERT INTO students(id,student_number,name) VALUES ('numeric','12345','Synthetic numeric'); INSERT INTO enrolments(course_id,student_id,active,checked_in_at) VALUES ('course','numeric',1,1)");
  assert.equal((await numbers.findPilotStudent(db,'fc12345')).id,'numeric');
  const numericQr=await actions.createAward(input);
  assert.equal((await actions.redeemPilot('points',token(numericQr),'FC12345')).ok,true);
  assert.equal((await actions.choosePilotNickname('points',token(numericQr),'fc12345','Fox')).ok,true);
  sqlite.exec("INSERT INTO leaderboard_preferences(course_id,student_id,visibility,alias) VALUES ('other','numeric','private','Other-course animal')");
  sqlite.exec("INSERT INTO attendance(id,session_id,student_id,recorded_by,source,identity_verification,recorded_at) VALUES ('nickname-attendance','session','numeric','teacher','pilot','pilot_student_number',1800000000)");
  const nicknameRecords=await records.loadCourseRecords('course');
  for(const key of ['enrolments','league','events','attendance','checkedIn']){
    const matching=nicknameRecords[key].filter(row=>row.studentId==='12345');
    assert.ok(matching.length,key);
    assert.ok(matching.every(row=>row.nickname==='Fox'),key);
  }
  assert.equal(nicknameRecords.enrolments.find(row=>row.studentId==='fc5').nickname,'');
  assert.ok(nicknameRecords.events.filter(row=>!row.studentId).every(row=>row.nickname===''));
  const exportRoute=load('app/export/[courseId]/[kind]/route.ts',{'cloudflare:workers':{env:{DB:db}},'../../../chatgpt-auth':{getChatGPTUser:async()=>user},'../../../course-records':records});
  for(const kind of ['enrolments','league','events','attendance','checked-in']){
    const response=await exportRoute.GET(new Request('https://example.test'),{params:Promise.resolve({courseId:'course',kind})});
    assert.equal(response.status,200);
    const lines=(await response.text()).trim().split('\r\n');
    const columns=line=>JSON.parse('['+line.replace(/^\uFEFF/,'')+']');
    const nicknameIndex=columns(lines[0]).indexOf('Animal nickname');
    assert.ok(nicknameIndex>=0);
    const matching=lines.slice(1).map(columns).filter(row=>row.includes('12345'));
    assert.ok(matching.length);
    assert.ok(matching.every(row=>row[nicknameIndex]==='Fox'));
  }
  const namedBackup=await records.loadCourseBackup('course');
  assert.equal(namedBackup.students.find(row=>row.id==='numeric').nickname,'Fox');
  assert.equal(namedBackup.attendance.find(row=>row.student_id==='numeric').nickname,'Fox');
  assert.equal(namedBackup.points.find(row=>row.student_id==='numeric').nickname,'Fox');
  const onboarding='synthetic-joining';
  sqlite.prepare('UPDATE courses SET onboarding_token_digest=? WHERE id=?').run(createHash('sha256').update(onboarding).digest('hex'),'course');
  const [firstJoin,secondJoin]=await Promise.all([actions.generateOnboardingQr(),actions.generateOnboardingQr()]);
  assert.deepEqual(firstJoin,secondJoin);
  assert.deepEqual(await actions.generateOnboardingQr(),firstJoin);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM course_onboarding_qrs').get().n,1);
  const permanent=token(firstJoin),savedTime=time;
  time+=10*365*24*60*60;
  assert.equal((await actions.redeemPilot('onboarding',permanent,'fc12345')).ok,true);
  assert.equal((await actions.choosePilotNickname('onboarding',permanent,'fc12345','Fox')).ok,true);
  assert.match((await actions.redeemPilot('onboarding',permanent,'fc4')).message,/JOIN-NOT-ENROLLED/);
  sqlite.prepare("UPDATE courses SET archived_at=1 WHERE id='course'").run();
  assert.match((await actions.redeemPilot('onboarding',permanent,'fc1')).message,/JOIN-COURSE-INACTIVE/);
  sqlite.prepare("UPDATE courses SET archived_at=NULL WHERE id='course'").run();
  assert.deepEqual(await actions.generateOnboardingQr(),firstJoin);
  time=savedTime;
  assert.equal((await actions.redeemPilot('onboarding',onboarding,'fc12345')).ok,true);
  assert.match((await actions.redeemPilot('onboarding',onboarding,'fc4')).message,/JOIN-NOT-ENROLLED/);
  assert.match((await actions.redeemPilot('onboarding','obsolete','fc1')).message,/JOIN-QR-UNKNOWN/);
  // Joining a course needs no open class; s5 has not joined yet.
  assert.equal((await actions.redeemPilot('onboarding',onboarding,'fc5')).ok,true);
  assert.equal((await actions.choosePilotNickname('onboarding',onboarding,'fc12345','Fox')).ok,true);
  sqlite.exec("INSERT INTO students(id,student_number,name) VALUES ('ambiguous','fc12345','Different synthetic record')");
  assert.equal(await numbers.findPilotStudent(db,'12345'),null);
  // Longer lifetimes: fixed timer, session close, course active, manual revocation.
  const thirty=await actions.createAward({...input,expiresSeconds:1800});
  assert.equal(thirty.expiresAt,time+1800);
  time+=1799;assert.equal((await actions.redeemPilot('points',token(thirty),'fc1')).ok,true);
  time+=2;assert.equal((await actions.redeemPilot('points',token(thirty),'fc2')).ok,false);
  await assert.rejects(()=>actions.createAward({...input,expiryMode:'session'}));
  await assert.rejects(()=>actions.createAward({...input,expiryMode:'invalid'}));
  sqlite.exec("UPDATE class_sessions SET closed_at=NULL WHERE id='session'");
  const lecture=await actions.createAward({...input,sessionId:'session',expiryMode:'session'});
  const persistent=await actions.createAward({...input,sessionId:'session',expiryMode:'course',recipientStudentNumbers:['fc1']});
  assert.equal(lecture.expiresAt,null);assert.equal(persistent.expiresAt,null);
  time+=4*60*60;assert.equal((await actions.redeemPilot('points',token(lecture),'fc1')).ok,true);
  sqlite.exec("UPDATE class_sessions SET closed_at=2 WHERE id='session'");
  assert.equal((await actions.redeemPilot('points',token(lecture),'fc2')).ok,false);
  time+=365*24*60*60;
  assert.equal((await actions.redeemPilot('points',token(persistent),'fc2')).ok,false);
  assert.equal((await actions.redeemPilot('points',token(persistent),'fc1')).ok,true);
  const revoked=await actions.createAward({...input,expiryMode:'course'});
  await actions.closePointAward(revoked.awardId);
  assert.match((await actions.redeemPilot('points',token(revoked),'fc1')).message,/PTS-QR-DEACTIVATED/);
  const archived=await actions.createAward({...input,expiryMode:'course'});
  sqlite.exec("UPDATE courses SET archived_at=2 WHERE id='course'");
  assert.match((await actions.redeemPilot('points',token(archived),'fc1')).message,/PTS-COURSE-INACTIVE/);
  sqlite.exec("UPDATE courses SET archived_at=NULL WHERE id='course'");
  // A teacher can recover attendance from a two-column CSV, even when no QR session was opened.
  sqlite.exec("INSERT INTO scheduled_classes(id,course_id,class_id,class_date,week,class_time,room,teacher,comments,imported_by,created_at) VALUES ('scheduled-csv','course','T-CSV','2030-09-16',1,'10:00','Lab','Teacher','','teacher',1)");
  const attendanceRows=[{classId:'T-CSV',studentNumber:'fc2'},{classId:'T-CSV',studentNumber:'fc5'}];
  const imported=await actions.importClassAttendance('course','scheduled-csv',attendanceRows,randomUUID());
  assert.deepEqual(imported,{imported:2,skipped:0,classId:'T-CSV',sessionCreated:true});
  const csvSession=sqlite.prepare("SELECT cs.id,cs.closed_at closedAt FROM class_sessions cs JOIN scheduled_classes sc ON sc.session_id=cs.id WHERE sc.id='scheduled-csv'").get();
  assert.ok(csvSession.closedAt);assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM attendance WHERE session_id=? AND source='teacher_csv' AND identity_verification='teacher_confirmed'").get(csvSession.id).n,2);
  assert.deepEqual(await actions.importClassAttendance('course','scheduled-csv',attendanceRows,randomUUID()),{imported:0,skipped:2,classId:'T-CSV',sessionCreated:false});
  await assert.rejects(()=>actions.importClassAttendance('course','scheduled-csv',[{classId:'WRONG',studentNumber:'fc1'}],randomUUID()),/Class ID must be T-CSV/);
  await assert.rejects(()=>actions.importClassAttendance('course','scheduled-csv',[{classId:'T-CSV',studentNumber:'missing'}],randomUUID()),/Not enrolled/);
  user=null;await assert.rejects(()=>actions.createAward(input),/sign in/);
  user={userId:'outsider'};await assert.rejects(()=>actions.createAward(input),/cannot create/);
  console.log('PASS: migration preservation; recipients and both auth paths; student-number normalization and ambiguity; onboarding/nicknames; fixed, class and course lifetimes; CSV attendance recovery; revocation; duplicate, enrolment and permission checks; reporting, backup, reversal and class totals.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
