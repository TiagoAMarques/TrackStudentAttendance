// Regression checks for the identity and data-integrity assessment findings.
// Uses actual application functions and a synthetic in-memory database.
const fs=require('node:fs');
let source=fs.readFileSync('qa/point-awards.test.cjs','utf8');source=source.slice(0,source.lastIndexOf('main().catch'));
source+=String.raw`
async function integrityChecks(){
 const dbState=()=>JSON.stringify(['students','enrolments','attendance','point_transactions','audit_log','leaderboard_preferences','users','class_sessions'].map(t=>[t,sqlite.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()]));
 const teacher=user;
 const token='synthetic-integrity-attendance';sqlite.prepare("UPDATE class_sessions SET attendance_token_digest=?,attendance_expires_at=? WHERE id='session'").run(createHash('sha256').update(token).digest('hex'),time+3600);
 // No implicit student-number identity, even when teacher pilot is enabled.
 delete process.env.PILOT_ALLOW_UNVERIFIED_STUDENTS;
 const disabledBefore=dbState();assert.equal((await actions.redeemPilot('attendance',token,'fc1')).ok,false);assert.equal((await actions.choosePilotNickname('onboarding',token,'fc1','Owl')).ok,false);assert.equal(dbState(),disabledBefore);
 process.env.PILOT_ALLOW_UNVERIFIED_STUDENTS='true';
 const accepted=await actions.redeemPilot('attendance',token,'fc1');assert.equal(accepted.ok,true);assert.ok(!JSON.stringify(accepted).includes('Student One'));
 const attendance=sqlite.prepare("SELECT * FROM attendance WHERE student_id='s1' AND session_id='session'").get();
 await actions.voidAttendance(attendance.id,'Absent in reality');
 const corrected=sqlite.prepare('SELECT * FROM attendance WHERE id=?').get(attendance.id);
 assert.equal((await actions.redeemPilot('attendance',token,'fc1')).ok,false);assert.deepEqual(sqlite.prepare('SELECT * FROM attendance WHERE id=?').get(attendance.id),corrected);
 sqlite.exec("UPDATE courses SET archived_at=1 WHERE id='course'");assert.equal((await actions.redeemPilot('attendance',token,'fc2')).ok,false);sqlite.exec("UPDATE courses SET archived_at=NULL WHERE id='course'");
 // Archive between the initial eligibility lookup and the actual write.
 const prepare=db.prepare;
 db.prepare=function(sql){const statement=prepare.call(db,sql);if(sql.startsWith('INSERT INTO attendance')&&sql.includes('SELECT ?,cs.id')){const run=statement.run;statement.run=async()=>{sqlite.exec("UPDATE courses SET archived_at=1 WHERE id='course'");return run.call(statement)}}return statement};
 assert.equal((await actions.redeemPilot('attendance',token,'fc2')).ok,false);db.prepare=prepare;
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM attendance WHERE student_id='s2'").get().n,0);sqlite.exec("UPDATE courses SET archived_at=NULL WHERE id='course'");
 // Corrections are auditable and explicit. Lost-response retries cannot duplicate points.
 const manual={kind:'points',sessionId:'session',studentNumber:'fc1',points:3,reason:'Manual synthetic award',requestId:randomUUID()};
 await actions.addManualRecord(manual);const afterManual=dbState();await actions.addManualRecord(manual);assert.equal(dbState(),afterManual);
 await assert.rejects(()=>actions.addManualRecord({...manual,points:4}),/different details/);
 const restore={kind:'attendance',sessionId:'session',studentNumber:'fc1',reason:'Teacher verified attendance',requestId:randomUUID()};
 await actions.addManualRecord(restore);assert.equal(sqlite.prepare('SELECT voided_at FROM attendance WHERE id=?').get(attendance.id).voided_at,null);
 // Force an audit insertion failure and prove the business write rolls back.
 sqlite.exec("CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT,'Synthetic audit failure'); END");
 let before=dbState();await assert.rejects(()=>actions.addManualRecord({...manual,requestId:randomUUID()}),/Synthetic audit/);assert.equal(dbState(),before);
 await assert.rejects(()=>actions.voidAttendance(attendance.id,'Failure probe'),/Synthetic audit/);assert.equal(dbState(),before);
 await assert.rejects(()=>actions.reversePointTransaction('legacy-claim','Failure probe'),/Synthetic audit/);assert.equal(dbState(),before);
 sqlite.exec('DROP TRIGGER synthetic_audit_failure');
 // Replace keeps retained onboarding and all historical records.
 const roster=[{studentId:'FC1',name:'Student One',email:'one@example.test',groups:'A'}];
 await actions.importRoster('course','courseid_TEST_participants.csv',roster,true);
 assert.equal(sqlite.prepare("SELECT checked_in_at FROM enrolments WHERE course_id='course' AND student_id='s1'").get().checked_in_at,1);
 assert.equal(sqlite.prepare("SELECT active FROM enrolments WHERE course_id='course' AND student_id='s2'").get().active,0);
 before=dbState();await assert.rejects(()=>actions.importRoster('course','courseid_TEST_participants.csv',[{studentId:'fc4',name:'Wrong shared identity',email:'wrong@example.test',groups:''}],true),/Identity details/);assert.equal(dbState(),before);
 await actions.importRoster('course','courseid_TEST_participants.csv',[{studentId:'FC4',name:'Student Four',email:'four@example.test',groups:''}]);
 assert.equal(sqlite.prepare("SELECT name FROM students WHERE id='s4'").get().name,'Student Four');
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM students WHERE lower(student_number)='fc1'").get().n,1);
 assert.throws(()=>sqlite.exec("INSERT INTO students(id,student_number,name) VALUES ('collision',' FC1 ','Duplicate')"),/conflicts/);
 assert.throws(()=>sqlite.exec("UPDATE students SET student_number='FC1' WHERE id='s2'"),/conflicts/);
 // Untrusted spreadsheet cells are neutralised, while numeric points remain numeric.
 await actions.importRoster('course','courseid_TEST_participants.csv',[{studentId:'NEWID',name:'=1+1',email:'formula@example.test',groups:'@SUM(A1)'}]);
 assert.equal(sqlite.prepare("SELECT student_number FROM students WHERE email='formula@example.test'").get().student_number,'newid');
 const exporter=load('app/export/[courseId]/[kind]/route.ts',{'cloudflare:workers':{env:{DB:db}},'../../../chatgpt-auth':{getChatGPTUser:async()=>user},'../../../course-records':records});
 const csv=await exporter.GET(new Request('https://example.test'),{params:Promise.resolve({courseId:'course',kind:'enrolments'})});
 assert.equal(csv.headers.get('cache-control'),'private, no-store');const content=await csv.text();assert.ok(content.includes("\"'=1+1\""));assert.ok(content.includes("\"'@SUM(A1)\""));
 // Exhaust the base nickname list, then join with the next numbered variant.
 sqlite.exec("UPDATE enrolments SET active=1 WHERE course_id='course'; INSERT INTO leaderboard_preferences(course_id,student_id,visibility,alias) VALUES ('course','s1','public','Owl'),('course','s2','public','Fox'),('course','s3','public','Bear')");
 const joining='synthetic-integrity-joining';sqlite.prepare("UPDATE courses SET onboarding_token_digest=? WHERE id='course'").run(createHash('sha256').update(joining).digest('hex'));
 const state=await actions.redeemPilot('onboarding',joining,'fc5');assert.ok(state.availableNicknames.includes('Owl #2'));
 sqlite.exec("CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT,'Synthetic audit failure'); END");
 before=dbState();await assert.rejects(()=>actions.choosePilotNickname('onboarding',joining,'fc5','Owl #2'),/Synthetic audit/);assert.equal(dbState(),before);sqlite.exec('DROP TRIGGER synthetic_audit_failure');
 assert.equal((await actions.choosePilotNickname('onboarding',joining,'fc5','Owl #2')).ok,true);
 const joined=dbState();assert.equal((await actions.choosePilotNickname('onboarding',joining,'fc5','Fox #2')).nickname,'Owl #2');assert.equal(dbState(),joined);
 // A signed-in email match, legacy user_id, or wrong provider grants no identity.
 user={userId:'unlinked',email:'one@example.test',displayName:'Someone else',identityProvider:'sites',identitySubject:'unlinked'};
 sqlite.exec("UPDATE students SET user_id='teacher' WHERE id='s1'");before=dbState();assert.equal((await actions.redeem('attendance',token)).ok,false);assert.equal(dbState(),before);
 sqlite.exec("INSERT INTO student_identity_links VALUES ('sites','approved-subject','s2','teacher',1)");
 user={userId:'approved-subject',email:'two@example.test',displayName:'Student Two',identityProvider:'other',identitySubject:'approved-subject'};assert.equal((await actions.redeem('attendance',token)).ok,false);
 user.identityProvider='sites';assert.equal((await actions.redeem('attendance',token)).ok,true);
 assert.equal(sqlite.prepare("SELECT identity_verification FROM attendance WHERE student_id='s2'").get().identity_verification,'sites');
 // A fresh platform user cannot create a teacher role by opening the dashboard.
 const data=load('app/data.ts',{'cloudflare:workers':{env:{DB:db}},'next/headers':{cookies:async()=>({get(){}})}});
 before=dbState();await assert.rejects(()=>data.ensureTeacher({userId:'stranger',email:'stranger@example.test',displayName:'Stranger'}),/not been granted/);assert.equal(dbState(),before);
 const identity=load('app/chatgpt-auth.ts',{'next/headers':{headers:async()=>new Map([['oai-authenticated-user-id','forged'],['oai-authenticated-user-email','forged@example.test']])},'next/navigation':{redirect(){throw Error('redirect')}}});
 process.env.PILOT_MODE='false';delete process.env.AUTH_PROVIDER;assert.equal(await identity.getChatGPTUser(),null);process.env.PILOT_MODE='true';
 user=teacher;sqlite.exec("UPDATE class_sessions SET closed_at=1 WHERE course_id='course'");
 const open=await actions.openSession({title:'One active session',room:'Lab',attendanceMinutes:30});assert.ok(open.urlPath);
 before=dbState();await assert.rejects(()=>actions.openSession({title:'Duplicate',room:'Lab',attendanceMinutes:30}),/Close the active/);assert.equal(dbState(),before);
 console.log('PASS: default-denied student identity, explicit links, no email linking, teacher-role isolation, correction persistence, archived write race, retry idempotency, audit rollback, roster preservation, cross-course isolation, canonical IDs, safe CSV, nickname capacity and session guard.');
}
integrityChecks().catch(e=>{console.error(e);process.exitCode=1});
`;
new Function('require',source)(require);
