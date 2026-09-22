import { env } from 'cloudflare:workers';
export type TeacherRole='admin'|'teacher'|'viewer';
export type Teacher={id:string;displayName:string;email:string;role:TeacherRole};
export type ManagedTeacher=Teacher&{disabledAt:number|null;sessionVersion:number};
export function configuredTeachers():Array<Teacher&{code:string}>{
 let values:Array<Teacher&{code:string}>=[];
 try{const parsed=JSON.parse(process.env.PILOT_TEACHERS_JSON??'[]');if(Array.isArray(parsed))values=parsed.filter(t=>t&&typeof t.id==='string'&&/^[\w-]+$/.test(t.id)&&typeof t.displayName==='string'&&typeof t.email==='string'&&typeof t.code==='string'&&t.code.length>=8)}catch{}
 if(!values.length&&process.env.PILOT_TEACHER_CODE)values=[{id:'local-pilot-teacher',displayName:'Pilot Teacher',email:'pilot-teacher@local.invalid',role:'admin',code:process.env.PILOT_TEACHER_CODE}];
 const admins=(process.env.PILOT_ADMIN_IDS??values[0]?.id??'').split(',').map(id=>id.trim());
 return values.map(t=>({...t,role:admins.includes(t.id)?'admin':'teacher'}));
}
export async function managedTeachers():Promise<ManagedTeacher[]>{return (await env.DB.prepare('SELECT id,display_name AS displayName,email,role,disabled_at AS disabledAt,session_version AS sessionVersion FROM teacher_accounts ORDER BY created_at,id').all<ManagedTeacher>()).results;}
export async function codeDigest(code:string){
 const secret=process.env.PILOT_TEACHER_SECRET;if(!secret)throw Error('Pilot teacher security is not configured.');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('teacher-access-code:'+code))),b=>b.toString(16).padStart(2,'0')).join('');
}
export function publicTeacher(t:Teacher):Teacher{return {id:t.id,displayName:t.displayName,email:t.email,role:t.role};}
