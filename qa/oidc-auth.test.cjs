// Synthetic OIDC configuration and identity-linking regression tests. No network or real credentials.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');
function load(file,imports={}){const module={exports:{}};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',js)(name=>{if(name in imports)return imports[name];throw Error('Unexpected import '+name)},module,module.exports);return module.exports;}

const oidcStub={ClientSecretPost(){},ClientSecretBasic(){},discovery(){throw Error('Network discovery must not run in unit tests')}};
const config=load('app/oidc-config.ts',{'openid-client':oidcStub});
assert.equal(config.safeReturnPath('/redeem/attendance/token?x=1'),'/redeem/attendance/token?x=1');
assert.equal(config.safeReturnPath('https://evil.example/'),'/');
assert.equal(config.safeReturnPath('//evil.example/'),'/');
assert.equal(config.safeReturnPath('/api/auth/callback/oidc'),'/');
assert.equal(config.claimValue({realm:{roles:['teacher']}},'realm.roles')[0],'teacher');
assert.deepEqual(config.claimStrings('teachers, staff;faculty'),['teachers','staff','faculty']);
assert.equal(config.classifyUpn(' FC123@ALUNOS.CIENCIAS.ULISBOA.PT ','alunos.ciencias.ulisboa.pt','ciencias.ulisboa.pt'),'student');
assert.equal(config.classifyUpn('teacher@ciencias.ulisboa.pt','alunos.ciencias.ulisboa.pt','ciencias.ulisboa.pt'),'teacher');
assert.equal(config.classifyUpn('teacher@sub.ciencias.ulisboa.pt','alunos.ciencias.ulisboa.pt','ciencias.ulisboa.pt'),null);
assert.equal(config.classifyUpn('teacher@ciencias.ulisboa.pt.evil.example','alunos.ciencias.ulisboa.pt','ciencias.ulisboa.pt'),null);
assert.equal(config.classifyUpn('teacher@@ciencias.ulisboa.pt','alunos.ciencias.ulisboa.pt','ciencias.ulisboa.pt'),null);
assert.equal(config.classifyUpn(null,'alunos.ciencias.ulisboa.pt','ciencias.ulisboa.pt'),null);

Object.assign(process.env,{NODE_ENV:'production',AUTH_PROVIDER:'oidc',PULSE_PUBLIC_ORIGIN:'https://pulse.example.test',OIDC_ISSUER_URL:'https://id.example.test',OIDC_CLIENT_ID:'pulse',OIDC_CLIENT_SECRET:'synthetic-secret',OIDC_CLIENT_AUTH_METHOD:'client_secret_basic',OIDC_SCOPES:'openid profile email userPrincipalName',OIDC_REDIRECT_URI:'https://pulse.example.test/api/auth/callback/oidc',OIDC_POST_LOGOUT_REDIRECT_URI:'https://pulse.example.test/',OIDC_STUDENT_ID_CLAIM:'student.id',OIDC_USER_PRINCIPAL_NAME_CLAIM:'userPrincipalName',OIDC_STUDENT_UPN_DOMAIN:'ALUNOS.CIENCIAS.ULISBOA.PT',OIDC_TEACHER_UPN_DOMAIN:'ciencias.ulisboa.pt',OIDC_TEACHER_GROUP_CLAIM:'groups',OIDC_TEACHER_GROUPS:'teachers,faculty',AUTH_SESSION_SECRET:'synthetic-session-secret-with-32-characters'});
const settings=config.getOidcSettings();assert.equal(settings.publicOrigin,'https://pulse.example.test');assert.equal(settings.teacherGroups.has('faculty'),true);assert.equal(settings.studentUpnDomain,'alunos.ciencias.ulisboa.pt');
assert.equal(config.teacherAccessFromClaims({userPrincipalName:'teacher@ciencias.ulisboa.pt',groups:[]},settings),true);
assert.equal(config.teacherAccessFromClaims({userPrincipalName:'student@alunos.ciencias.ulisboa.pt',groups:['teachers']},settings),false);
assert.throws(()=>config.teacherAccessFromClaims({userPrincipalName:'person@sub.ciencias.ulisboa.pt'},settings),/outside the configured/);
assert.throws(()=>config.teacherAccessFromClaims({},settings),/missing, malformed/);
assert.equal(config.teacherAccessFromClaims({groups:['faculty']},{...settings,userPrincipalNameClaim:null,studentUpnDomain:null,teacherUpnDomain:null}),true);
process.env.OIDC_REDIRECT_URI='https://evil.example.test/api/auth/callback/oidc';assert.throws(()=>config.getOidcSettings(),/PULSE_PUBLIC_ORIGIN/);process.env.OIDC_REDIRECT_URI='https://pulse.example.test/api/auth/callback/oidc';
process.env.OIDC_SCOPES='profile email';assert.throws(()=>config.getOidcSettings(),/include openid/);process.env.OIDC_SCOPES='openid profile email';
delete process.env.OIDC_TEACHER_UPN_DOMAIN;assert.throws(()=>config.getOidcSettings(),/must be configured together/);process.env.OIDC_TEACHER_UPN_DOMAIN='ciencias.ulisboa.pt';
process.env.OIDC_TEACHER_UPN_DOMAIN='@ciencias.ulisboa.pt';assert.throws(()=>config.getOidcSettings(),/exact DNS domain/);process.env.OIDC_TEACHER_UPN_DOMAIN='ciencias.ulisboa.pt';
process.env.OIDC_TEACHER_UPN_DOMAIN='alunos.ciencias.ulisboa.pt';assert.throws(()=>config.getOidcSettings(),/must be different/);process.env.OIDC_TEACHER_UPN_DOMAIN='ciencias.ulisboa.pt';

const sqlite=new DatabaseSync(':memory:');sqlite.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE students(id TEXT PRIMARY KEY,student_number TEXT,name TEXT);
CREATE TABLE enrolments(course_id TEXT,student_id TEXT,active INTEGER);
CREATE TABLE student_identity_links(provider TEXT,subject TEXT,student_id TEXT,linked_by TEXT,linked_at INTEGER,PRIMARY KEY(provider,subject));
CREATE UNIQUE INDEX idx_identity_provider_student ON student_identity_links(provider,student_id);
CREATE TABLE audit_log(id TEXT PRIMARY KEY,course_id TEXT,actor_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,details TEXT,created_at INTEGER);
INSERT INTO students VALUES ('one','fc123','One'),('two','fc456','Two');INSERT INTO enrolments VALUES ('course','one',1),('course','two',1);`);
const db={prepare(sql){let values=[];return{bind(...input){values=input;return this},async first(){return sqlite.prepare(sql).get(...values)??null},async all(){return{results:sqlite.prepare(sql).all(...values)}},async run(){const r=sqlite.prepare(sql).run(...values);return{meta:{changes:Number(r.changes)}}}}},async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.run());sqlite.exec('COMMIT');return out}catch(error){sqlite.exec('ROLLBACK');throw error}}};
const idNumber=load('app/id-number.ts');
const session={oidcProvider:issuer=>'oidc:'+issuer};
const identity=load('app/oidc-identity.ts',{'#database':{getDatabase:()=>db},'./id-number':idNumber,'./oidc-session':session});
(async()=>{
 const linked=await identity.linkAuthoritativeStudentIdentity('https://id.example.test/','subject-one','123','oidc:user');assert.equal(linked.linked,true);
 assert.equal(sqlite.prepare('SELECT student_id FROM student_identity_links').get().student_id,'one');
 await identity.linkAuthoritativeStudentIdentity('https://id.example.test/','subject-one','fc123','oidc:user');assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM student_identity_links').get().n,1);
 await assert.rejects(()=>identity.linkAuthoritativeStudentIdentity('https://id.example.test/','subject-one','456','oidc:user'),/different student/);
 await assert.rejects(()=>identity.linkAuthoritativeStudentIdentity('https://id.example.test/','subject-two','123','oidc:user'),/different institutional/);
 const absent=await identity.linkAuthoritativeStudentIdentity('https://id.example.test/','unimported','999','oidc:user');assert.deepEqual(absent,{linked:false,reason:'not-imported'});
 console.log('PASS: OIDC configuration, redirect safety, claim parsing and authoritative roster linking.');
})().catch(error=>{console.error(error);process.exitCode=1});
