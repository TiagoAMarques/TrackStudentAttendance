import fs from 'node:fs';
let p='app/Dashboard.tsx',s=fs.readFileSync(p,'utf8');
s=s.replace(/type ImportStudent = .*?;/,"import { parseRoster, type ImportStudent } from './roster-import';");
const start=s.indexOf('  const readRoster='),end=s.indexOf('\n  const rosterCount',start);
s=s.slice(0,start)+`  const readRoster=async(file?:File)=>{if(!file)return;setRows([]);setError('');setFileName(file.name);try{if(file.size>5*1024*1024)throw Error('Choose a CSV smaller than 5 MB.');const wb=XLSX.read(await file.text(),{type:'string',raw:true}),sheet=wb.Sheets[wb.SheetNames[0]];if(!sheet)throw Error('The file is empty.');setRows(parseRoster(XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,raw:true,defval:''}),file.name,initial.course.code,initial.roster.map(s=>s.studentId)))}catch(e){setError(e instanceof Error?e.message:'Could not read this file.')}};`+s.slice(end);
s=s.replace('accept=".csv,.xlsx,.xls"','accept=".csv"').replace('Choose a CSV or Excel file','Choose a participants CSV').replace('Student ID and name required · Email optional in pilot mode','Name: courseid_COURSEID_participants.csv · Columns: First name, Last name, ID number, Email address, Groups');
s=s.replace('<strong>{fileName}</strong>','<strong>{fileName}</strong><p>Import into {initial.course.code} · {initial.course.name}</p>');
s=s.replace('<th>Name</th><th>Email</th></tr></thead><tbody>{rows.map','<th>Name</th><th>Email</th><th>Groups</th></tr></thead><tbody>{rows.map');
s=s.replace("<td>{r.email||'—'}</td></tr>","<td>{r.email||'—'}</td><td>{r.groups||'—'}</td></tr>");
s=s.replace("disabled={pending} onClick={()=>task(async()=>{await importRoster(rows.filter(r=>r.status!=='error'));location.reload()})}","disabled={pending||rows.some(r=>r.status==='error')} onClick={()=>task(async()=>{await importRoster(initial.course.id,fileName,rows);location.reload()})}");
s=s.replace('<div className="import-actions"><button className="dark" disabled={pending||rows.some','<div className="import-actions"><button disabled={pending} onClick={()=>{setRows([]);setError(\'\')}}>Choose another file</button><button className="dark" disabled={pending||rows.some');
s=s.replace(/\nfunction norm\(v:string\|number\)[\s\S]*$/,'\n');fs.writeFileSync(p,s);
p='app/actions.ts';s=fs.readFileSync(p,'utf8').replace("import { ANIMAL_NICKNAMES }","import { rosterCourseCode, validateRoster, type RosterStudent } from './roster-import';\nimport { ANIMAL_NICKNAMES }");
const a=s.indexOf('export async function importRoster('),b=s.indexOf('\nexport async function openSession',a);
s=s.slice(0,a)+`export async function importRoster(courseId:string,filename:string,rows:RosterStudent[]) {
  const {user,course,db}=await timetableContext(courseId);
  if(rosterCourseCode(filename).toLowerCase()!==course.code.toLowerCase())throw Error('The filename does not match the selected course.');
  const clean=validateRoster(rows),statements=[];
  for(const row of clean){
    statements.push(
      db.prepare(\x60INSERT INTO students (id,student_number,name,email) VALUES (?,?,?,NULLIF(?,'')) ON CONFLICT(student_number) DO UPDATE SET name=excluded.name,email=excluded.email\x60).bind(id(),row.studentId,row.name,row.email),
      db.prepare(\x60INSERT INTO enrolments (course_id,student_id,active,groups) SELECT ?,id,1,? FROM students WHERE student_number=? ON CONFLICT(course_id,student_id) DO UPDATE SET active=1,groups=excluded.groups\x60).bind(course.id,row.groups,row.studentId)
    );
  }
  statements.push(db.prepare('INSERT INTO audit_log (id,course_id,actor_id,action,entity_type,entity_id,details,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id(),course.id,user.userId,'roster.imported','course',course.id,JSON.stringify({count:clean.length,filename}),now()));
  await db.batch(statements);
  revalidatePath('/');return {count:clean.length};
}
`+s.slice(b);fs.writeFileSync(p,s);
fs.appendFileSync('.gitignore','\n# Private operational input data\n/local-data/\n');
