import { getDatabase } from '#database';
import { idNumberCandidates } from './id-number';
import { oidcProvider } from './oidc-session';

export async function linkAuthoritativeStudentIdentity(issuer:string,subject:string,idNumber:string,userId:string) {
  const candidates=idNumberCandidates(idNumber);
  const students=await getDatabase().prepare(`SELECT id FROM students WHERE lower(trim(student_number)) IN (?,?)`)
    .bind(candidates[0],candidates[1]??candidates[0]).all<{id:string}>();
  if(students.results.length===0)return {linked:false as const,reason:'not-imported' as const};
  if(students.results.length!==1)throw Error('The institutional ID number matches multiple student records. An administrator must resolve the conflict.');
  const studentId=students.results[0].id,provider=oidcProvider(issuer),time=Math.floor(Date.now()/1000);
  const bySubject=await getDatabase().prepare('SELECT student_id AS studentId FROM student_identity_links WHERE provider=? AND subject=?')
    .bind(provider,subject).first<{studentId:string}>();
  if(bySubject&&bySubject.studentId!==studentId)throw Error('This institutional sign-in is already linked to a different student record.');
  const byStudent=await getDatabase().prepare('SELECT subject FROM student_identity_links WHERE provider=? AND student_id=?')
    .bind(provider,studentId).first<{subject:string}>();
  if(byStudent&&byStudent.subject!==subject)throw Error('This student record is already linked to a different institutional sign-in.');
  if(!bySubject){
    const event=crypto.randomUUID();
    await getDatabase().batch([
      getDatabase().prepare('INSERT INTO student_identity_links(provider,subject,student_id,linked_by,linked_at) VALUES (?,?,?,?,?)').bind(provider,subject,studentId,userId,time),
      getDatabase().prepare(`INSERT INTO audit_log(id,course_id,actor_id,action,entity_type,entity_id,details,created_at)
        SELECT ?||':'||course_id,course_id,?,'student.identity_linked_oidc','student',student_id,?,? FROM enrolments WHERE student_id=?`)
        .bind(event,userId,JSON.stringify({provider}),time,studentId),
    ]);
  }
  return {linked:true as const,studentId};
}

