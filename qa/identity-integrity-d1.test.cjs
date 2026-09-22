// Exercise SQLite triggers and transaction/race behaviour in the actual Workers D1 runtime.
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),{randomUUID,createHash}=require('node:crypto');
const {Miniflare}=require(require.resolve('miniflare',{paths:[require.resolve('wrangler/package.json')]}));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',d1Databases:['DB'],d1Persist:false,compatibilityDate:'2026-05-15'});
function statements(sql){return sql.replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean)}
function load(file,imports={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(key=>{if(key in imports)return imports[key];throw Error('Unexpected import '+key)},m,m.exports);return m.exports;}
(async()=>{try{
 const db=await mf.getD1Database('DB');
 for(const file of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')&&n<'0012').sort())await db.batch(statements(fs.readFileSync('drizzle/'+file,'utf8')).map(sql=>db.prepare(sql)));
 const seed=fs.readFileSync('qa/point-awards.test.cjs','utf8').match(/sqlite\.exec\(`([\s\S]*?)`\);/)[1];await db.batch(statements(seed).map(sql=>db.prepare(sql)));
 // Existing ambiguous identities and duplicate sessions must not be destroyed by migration.
 await db.prepare("INSERT INTO students(id,student_number,name) VALUES ('old-collision','FC1','Legacy ambiguity')").run();
 await db.prepare("INSERT INTO class_sessions(id,course_id,title,attendance_token_digest,attendance_expires_at,opened_by,opened_at) VALUES ('old-session','course','Legacy extra session','legacy-extra',1900000000,'teacher',1)").run();
 const before=(await db.prepare('SELECT * FROM students ORDER BY id').all()).results;
 for(const sql of fs.readFileSync('drizzle/0012_identity_integrity.sql','utf8').split('--> statement-breakpoint').filter(s=>s.trim()))await db.prepare(sql).run();
 assert.deepEqual((await db.prepare('SELECT * FROM students ORDER BY id').all()).results,before);
 await assert.rejects(()=>db.prepare("INSERT INTO students(id,student_number,name) VALUES ('new-collision',' fc1 ','Another')").run(),/conflicts/);
 await db.prepare("UPDATE class_sessions SET closed_at=1 WHERE course_id='course'").run();
 const user={userId:'teacher',email:'teacher@example.test',displayName:'Teacher'},time=1800000000;
 const security=load('app/request-security.ts',{'cloudflare:workers':{env:{DB:db}},'next/headers':{headers:async()=>new Map()}});
 const actions=load('app/actions.ts',{'cloudflare:workers':{env:{DB:db}},'./request-security':security,'next/cache':{revalidatePath(){}},'next/headers':{cookies:async()=>({set(){}})},'./chatgpt-auth':{getChatGPTUser:async()=>user},'./data':{ensureTeacher:async()=>({id:'course',code:'TEST',name:'Test course'}),id:randomUUID,now:()=>time,digestToken:async t=>createHash('sha256').update(t).digest('hex'),initials:()=>''},'./student-number':load('app/student-number.ts'),'./redemption-errors':load('app/redemption-errors.ts'),'./point-award-policy':load('app/point-award-policy.ts'),'./roster-import':load('app/roster-import.ts'),'./animal-nicknames':{ANIMAL_NICKNAMES:['Owl','Fox']},'./pilot-auth':{},'./course-records':{},'./timetable':{}});
 const starts=await Promise.allSettled([actions.openSession({title:'Concurrent A',room:'',attendanceMinutes:30}),actions.openSession({title:'Concurrent B',room:'',attendanceMinutes:30})]);
 assert.equal(starts.filter(r=>r.status==='fulfilled').length,1);assert.equal((await db.prepare("SELECT COUNT(*) n FROM class_sessions WHERE course_id='course' AND closed_at IS NULL").first()).n,1);
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM audit_log WHERE action='session.opened'").first()).n,1);
 const input={kind:'points',sessionId:'session',studentNumber:'fc2',points:4,reason:'D1 retry',requestId:randomUUID()};
 await Promise.all([actions.addManualRecord(input),actions.addManualRecord(input)]);
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM point_transactions WHERE reason='D1 retry'").first()).n,1);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM audit_log WHERE id=?').bind(input.requestId).first()).n,1);
 await db.prepare("CREATE TRIGGER audit_failure BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT,'Synthetic audit failure'); END").run();
 await assert.rejects(()=>actions.addManualRecord({...input,reason:'Rollback',requestId:randomUUID()}),/Synthetic audit/);
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM point_transactions WHERE reason='Rollback'").first()).n,0);
 await db.prepare('DROP TRIGGER audit_failure').run();
 const attempts=await Promise.all(Array.from({length:12},()=>security.consumeAttempt('concurrent-rate-key',5,600)));assert.equal(attempts.filter(Boolean).length,5);
 assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 console.log('PASS: D1 migration preserves legacy conflicts/history, rejects new collisions, allows only one concurrent session, deduplicates simultaneous manual retries, rolls back failed audits and enforces atomic attempt limits.');
}finally{await mf.dispose()}})().catch(e=>{console.error(e);process.exitCode=1});
