// Diagnostic probes: intentionally confirm current defects using synthetic, in-memory data.
// This is an assessment tool, not a regression suite that should retain these behaviours.
const fs=require('node:fs');
let source=fs.readFileSync('qa/point-awards.test.cjs','utf8');
source=source.replace("'./roster-import':{}","'./roster-import':load('app/roster-import.ts')");
source=source.slice(0,source.lastIndexOf('main().catch'));
const probes=String.raw`
async function assess(){
 const findings=[];
 const note=(id,detail)=>{findings.push({id,detail});console.log(id+': '+detail)};
 const attendanceToken='synthetic-audit-attendance';
 sqlite.prepare("UPDATE class_sessions SET attendance_token_digest=?,attendance_expires_at=?,closed_at=NULL WHERE id='session'").run(createHash('sha256').update(attendanceToken).digest('hex'),time+3600);
 let response=await actions.redeemPilot('attendance',attendanceToken,'fc1');assert.equal(response.ok,true);assert.ok(response.message.includes('Student One'));note('A01','Unauthenticated student-number redemption returns the matched student name.');
 const attendanceId=sqlite.prepare("SELECT id FROM attendance WHERE student_id='s1' AND session_id='session'").get().id;
 await actions.voidAttendance(attendanceId,'Synthetic teacher correction');
 assert.ok(sqlite.prepare('SELECT voided_at FROM attendance WHERE id=?').get(attendanceId).voided_at);
 await actions.redeemPilot('attendance',attendanceToken,'fc1');
 assert.equal(sqlite.prepare('SELECT voided_at FROM attendance WHERE id=?').get(attendanceId).voided_at,null);note('A02','Rescanning restores teacher-voided attendance and clears its correction fields.');
 sqlite.prepare("UPDATE courses SET archived_at=? WHERE id='course'").run(time);
 assert.equal((await actions.redeemPilot('attendance',attendanceToken,'fc2')).ok,true);note('A03','Open attendance token is accepted even when its course is archived.');
 sqlite.exec("UPDATE courses SET archived_at=NULL WHERE id='course'; UPDATE class_sessions SET closed_at=1 WHERE course_id='course'");
 await Promise.all([actions.openSession({title:'Synthetic A',room:'R',attendanceMinutes:30}),actions.openSession({title:'Synthetic B',room:'R',attendanceMinutes:30})]);
 assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM class_sessions WHERE course_id='course' AND closed_at IS NULL").get().n,2);note('A04','Two simultaneous manual starts create two active class sessions in one course.');
 await actions.importRoster('course','courseid_TEST_participants.csv',[{studentId:'fc1',name:'Student One',email:'one@example.test',groups:''}],true);
 assert.equal(sqlite.prepare("SELECT checked_in_at FROM enrolments WHERE course_id='course' AND student_id='s1'").get().checked_in_at,null);note('A05','Replacing a roster resets joining status even for a retained student.');
 await actions.importRoster('course','courseid_TEST_participants.csv',[{studentId:'fc4',name:'Changed from different course',email:'new@example.test',groups:''}]);
 assert.equal(sqlite.prepare("SELECT s.name FROM enrolments e JOIN students s ON s.id=e.student_id WHERE e.course_id='other' AND s.id='s4'").get().name,'Changed from different course');note('A06','An authorised import in one course changes the shared identity shown in another course.');
 await actions.importRoster('course','courseid_TEST_participants.csv',[{studentId:'fc1',name:'=1+1',email:'one@example.test',groups:''}]);
 const route=load('app/export/[courseId]/[kind]/route.ts',{'cloudflare:workers':{env:{DB:db}},'../../../chatgpt-auth':{getChatGPTUser:async()=>user},'../../../course-records':records});
 response=await route.GET(new Request('https://example.test'),{params:Promise.resolve({courseId:'course',kind:'enrolments'})});
 assert.ok((await response.text()).includes('"=1+1"'));note('A07','CSV output contains an unneutralised formula-leading cell.');
 await actions.importRoster('course','courseid_TEST_participants.csv',[{studentId:'FC1',name:'Case variant',email:'case@example.test',groups:''}]);
 assert.equal(await load('app/student-number.ts').findPilotStudent(db,'fc1'),null);note('A08','Case-variant roster import creates ambiguous identities and blocks redemption.');
 const secretToken='synthetic-onboarding';sqlite.prepare("UPDATE courses SET onboarding_token_digest=? WHERE id='course'").run(createHash('sha256').update(secretToken).digest('hex'));
 sqlite.exec("UPDATE enrolments SET active=1 WHERE course_id='course'; INSERT INTO leaderboard_preferences(course_id,student_id,visibility,alias) VALUES ('course','s1','public','Owl'),('course','s2','public','Fox'),('course','s3','public','Bear')");
 response=await actions.redeemPilot('onboarding',secretToken,'fc5');assert.equal(response.ok,true);assert.deepEqual(response.availableNicknames,[]);note('A09','Exhausting the allowed nickname list leaves a new student with no joining option. Actual production list size: '+load('app/animal-nicknames.ts').ANIMAL_NICKNAMES.length+'.');
 const backup=await records.loadCourseBackup('course');assert.equal(backup.course.onboarding_token_digest,undefined);assert.equal(backup.courseOnboardingQrs,undefined);note('A10','Course backup omits onboarding credentials and cannot restore a complete course independently.');
 const auth=load('app/pilot-auth.ts',{'next/headers':{cookies:async()=>({get(){return undefined}})}});
 process.env.PILOT_TEACHERS_JSON=JSON.stringify([{id:'synthetic-staff',displayName:'Synthetic teacher',email:'synthetic@example.test',code:'synthetic-code-only'}]);
 assert.equal((await auth.getPilotTeacherDirectory()).length,1);note('A11','Exported server function returns teacher directory without checking authentication.');
 fs.mkdirSync('outputs/assessment',{recursive:true});fs.writeFileSync('outputs/assessment/probes.json',JSON.stringify(findings,null,2));
}
assess().catch(e=>{console.error(e);process.exitCode=1});
`;
new Function('require',source+'\n'+probes)(require);
