'use server';
import { env } from 'cloudflare:workers';
import { revalidatePath } from 'next/cache';
import { getPilotTeacherSession } from './pilot-auth';
async function administrator(){const actor=await getPilotTeacherSession();if(actor?.role!=='admin')throw Error('Only a teacher administrator can verify student identities.');return actor;}
async function student(number:string){
 if(typeof number!=='string'||!number.trim()||number.length>100)throw Error('Enter the exact roster student ID.');
 const rows=await env.DB.prepare('SELECT s.id FROM students s WHERE lower(trim(s.student_number))=? AND EXISTS (SELECT 1 FROM enrolments e WHERE e.student_id=s.id)').bind(number.trim().toLowerCase()).all<{id:string}>();
 if(rows.results.length!==1)throw Error('The student ID is missing or ambiguous. Existing conflicting records must be reviewed before linking.');
 return rows.results[0];
}
export async function correctStudentIdentity(input:{studentNumber:string;name:string;email:string;verified:boolean}){
 const actor=await administrator();if(input.verified!==true)throw Error('Confirm that these details were verified against the institutional record.');
 if(typeof input.name!=='string'||typeof input.email!=='string')throw Error('Enter valid identity details.');
 const name=input.name.trim(),email=input.email.trim().toLowerCase();
 if(!name||name.length>300||email.length>320||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw Error('Enter a valid name and email.');
 const matched=await student(input.studentNumber),time=Math.floor(Date.now()/1000),event=crypto.randomUUID();
 await env.DB.batch([
  env.DB.prepare(`INSERT INTO audit_log(id,course_id,actor_id,action,entity_type,entity_id,details,created_at) SELECT ?||':'||e.course_id,e.course_id,?,'student.identity_corrected','student',s.id,json_object('previousName',s.name,'previousEmail',s.email,'name',?,'email',?),? FROM students s JOIN enrolments e ON e.student_id=s.id WHERE s.id=?`).bind(event,actor.id,name,email,time,matched.id),
  env.DB.prepare("UPDATE students SET name=?,email=NULLIF(?,'') WHERE id=?").bind(name,email,matched.id)
 ]);
 revalidatePath('/');return {message:'Verified identity details updated across all courses. Attendance, points and sign-in links were preserved.'};
}
export async function linkStudentIdentity(input:{studentNumber:string;subject:string;verified:boolean}){
 const actor=await administrator();if(input.verified!==true)throw Error('Confirm the signed-in identity belongs to this student.');
 if(typeof input.subject!=='string'||!input.subject.trim()||input.subject.length>256)throw Error('Enter the exact sign-in reference.');
 const matched=await student(input.studentNumber),subject=input.subject.trim(),time=Math.floor(Date.now()/1000),event=crypto.randomUUID();
 const result=await env.DB.batch([
  env.DB.prepare("INSERT INTO student_identity_links(provider,subject,student_id,linked_by,linked_at) VALUES ('sites',?,?,?,?) ON CONFLICT DO NOTHING").bind(subject,matched.id,actor.id,time),
  env.DB.prepare("INSERT INTO audit_log(id,course_id,actor_id,action,entity_type,entity_id,details,created_at) SELECT ?||':'||course_id,course_id,?,'student.identity_linked','student',student_id,?,? FROM enrolments WHERE student_id=? AND changes()>0").bind(event,actor.id,JSON.stringify({provider:'sites',subject}),time,matched.id)
 ]);
 if(!result[0].meta.changes){const existing=await env.DB.prepare("SELECT student_id FROM student_identity_links WHERE provider='sites' AND subject=?").bind(subject).first<{student_id:string}>();if(existing?.student_id!==matched.id)throw Error('This sign-in reference or student already has another link. It was not reassigned.');}
 return {message:'Verified sign-in identity linked. Email addresses are never used to match sign-ins.'};
}
