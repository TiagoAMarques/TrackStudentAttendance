const fs=require('node:fs');
const assert=require('node:assert/strict');
const {Miniflare}=require(require.resolve('miniflare',{paths:[require.resolve('wrangler/package.json')]}));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',d1Databases:['DB'],d1Persist:false,compatibilityDate:'2026-05-15'});
const statements=sql=>sql.replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean);
(async()=>{
 try{
  const db=await mf.getD1Database('DB');
  for(const file of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')&&n<'0008').sort())await db.batch(statements(fs.readFileSync('drizzle/'+file,'utf8')).map(s=>db.prepare(s)));
  const source=fs.readFileSync('qa/point-awards.test.cjs','utf8');
  const seed=source.match(/sqlite\.exec\(`([\s\S]*?)`\);/)[1];
  await db.batch(statements(seed).map(s=>db.prepare(s)));
  const before=(await db.prepare('SELECT * FROM point_transactions').all()).results;
  await db.batch(statements(fs.readFileSync('drizzle/0008_independent_point_awards.sql','utf8')).map(s=>db.prepare(s)));
  await db.batch(statements(fs.readFileSync('drizzle/0009_point_award_expiry_modes.sql','utf8')).map(s=>db.prepare(s)));
  await db.batch(statements(fs.readFileSync('drizzle/0010_permanent_onboarding_qr.sql','utf8')).map(s=>db.prepare(s)));
  await Promise.all(['first','second'].map(token=>db.prepare('INSERT INTO course_onboarding_qrs (course_id,token,token_digest) VALUES (?,?,?) ON CONFLICT(course_id) DO NOTHING').bind('course',token,token+'-digest').run()));
  const rows=(await db.prepare('SELECT * FROM course_onboarding_qrs').all()).results;
  assert.equal(rows.length,1);
  const found=await db.prepare('SELECT c.id FROM courses c WHERE ? IN (c.onboarding_token_digest,(SELECT token_digest FROM course_onboarding_qrs WHERE course_id=c.id))').bind(rows[0].token_digest).first();
  assert.equal(found.id,'course');
  await db.prepare('INSERT INTO course_onboarding_qrs VALUES (?,?,?)').bind('other','other-token','other-digest').run();
  assert.notEqual((await db.prepare('SELECT token FROM course_onboarding_qrs WHERE course_id=?').bind('other').first()).token,rows[0].token);
  assert.deepEqual((await db.prepare('SELECT * FROM point_transactions').all()).results,before);
  assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
  await db.prepare("INSERT INTO point_awards(id,course_id,points,reason,token_digest,awarded_by,expires_at,created_at,restricted) VALUES ('independent','course',3,'Independent coursework','new-token','teacher',1900000000,1,1)").run();
  await db.prepare("INSERT INTO point_award_recipients VALUES ('independent','s1')").run();
  const ts=require('typescript'),module={exports:{}};
  new Function('exports',ts.transpileModule(fs.readFileSync('app/point-award-policy.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module.exports);
  const {claimPointAward}=module.exports;
  const blocked=await db.prepare(claimPointAward).bind('blocked','s2','teacher','pilot_student_number',1800000000,'s2','new-token',1800000000).run();assert.equal(blocked.meta.changes,0);
  const accepted=await db.prepare(claimPointAward).bind('accepted','s1','teacher','pilot_student_number',1800000000,'s1','new-token',1800000000).run();assert.equal(accepted.meta.changes,1);
  console.log('PASS: D1/Workers runtime migration preserves history; recipient-restricted independent claims accepted/rejected correctly.');
 }finally{await mf.dispose()}
})().catch(e=>{console.error(e);process.exitCode=1});
