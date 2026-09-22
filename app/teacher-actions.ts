'use server';
import { env } from 'cloudflare:workers';
import { revalidatePath } from 'next/cache';
import { getPilotTeacherSession } from './pilot-auth';
import { codeDigest,configuredTeachers,managedTeachers,publicTeacher } from './teacher-store';
async function admin(){const user=await getPilotTeacherSession();if(user?.role!=='admin')throw Error('Only a teacher administrator can manage access.');return user;}
export async function getTeacherAccounts(){await admin();return [...configuredTeachers().map(t=>({...publicTeacher(t),managed:false,disabledAt:null})),...(await managedTeachers()).map(t=>({...publicTeacher(t),managed:true,disabledAt:t.disabledAt}))];}
export async function addTeacherAccount(input:{displayName:string;email:string;readOnly:boolean;courseIds:string[]}){
 const actor=await admin();
 if(typeof input?.displayName!=='string'||typeof input.email!=='string'||typeof input.readOnly!=='boolean'||!Array.isArray(input.courseIds))throw Error('Enter valid teacher details.');
 const displayName=input.displayName.trim(),email=input.email.trim().toLowerCase();
 if(displayName.length<2||displayName.length>100)throw Error('Enter a name between 2 and 100 characters.');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw Error('Enter a valid email address.');
 const existing=[...configuredTeachers(),...await managedTeachers()];
 if(existing.some(t=>t.email.toLowerCase()===email)||await env.DB.prepare('SELECT id FROM users WHERE lower(email)=?').bind(email).first())throw Error('This email already belongs to a teacher or user.');
 const courseIds=[...new Set(input.courseIds)];if(courseIds.length>100||courseIds.some(id=>typeof id!=='string'))throw Error('Choose valid courses.');
 for(const courseId of courseIds){if(!await env.DB.prepare("SELECT 1 FROM course_teachers ct JOIN courses c ON c.id=ct.course_id WHERE ct.course_id=? AND ct.teacher_id=? AND ct.role='owner' AND c.archived_at IS NULL").bind(courseId,actor.id).first())throw Error('You may assign teachers only to courses you own.');}
 const id=crypto.randomUUID(),code=newCode(),time=Math.floor(Date.now()/1000);
 const statements=[env.DB.prepare('INSERT INTO users (id,email,display_name,created_at) VALUES (?,?,?,?)').bind(id,email,displayName,time),env.DB.prepare('INSERT INTO teacher_accounts (id,email,display_name,role,code_digest,created_by,created_at) VALUES (?,?,?,?,?,?,?)').bind(id,email,displayName,input.readOnly?'viewer':'teacher',await codeDigest(code),actor.id,time)];
 if(!input.readOnly)for(const courseId of courseIds)statements.push(env.DB.prepare("INSERT INTO course_teachers (course_id,teacher_id,role,invited_by,joined_at) VALUES (?,?,'editor',?,?)").bind(courseId,id,actor.id,time));
 await env.DB.batch(statements);revalidatePath('/');revalidatePath('/teachers');return {code,displayName};
}
export async function resetTeacherCode(id:string){await admin();const code=newCode();const result=await env.DB.prepare('UPDATE teacher_accounts SET code_digest=?,session_version=session_version+1 WHERE id=? AND disabled_at IS NULL').bind(await codeDigest(code),id).run();if(!result.meta.changes)throw Error('Choose an active managed account.');return {code};}
export async function setTeacherAccountEnabled(id:string,enabled:boolean){await admin();if(typeof enabled!=='boolean')throw Error('Invalid account status.');const result=await env.DB.prepare('UPDATE teacher_accounts SET disabled_at=?,session_version=session_version+1 WHERE id=?').bind(enabled?null:Math.floor(Date.now()/1000),id).run();if(!result.meta.changes)throw Error('This account is managed in the server configuration.');revalidatePath('/teachers');}
function newCode(){return 'Pulse-'+crypto.randomUUID().replaceAll('-','').slice(0,20);}
