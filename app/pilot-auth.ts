'use server';
import { cookies } from 'next/headers';
import { consumeAttempt, requestKey } from './request-security';
import { env } from 'cloudflare:workers';
import { codeDigest,configuredTeachers,managedTeachers,publicTeacher,type Teacher } from './teacher-store';
export type PilotTeacher=Teacher;
const COOKIE='pulse_pilot_teacher',encoder=new TextEncoder();
async function signature(value:string){
 const secret=process.env.PILOT_TEACHER_SECRET;if(!secret)throw Error('Pilot teacher security is not configured.');
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value))));
}
export async function getPilotTeacherSession():Promise<Teacher|null>{
 if(process.env.PILOT_MODE!=='true')return null;
 const raw=(await cookies()).get(COOKIE)?.value;if(!raw)return null;
 const parts=raw.split('.'),[id,expires]=parts;
 if(!id||!Number.isFinite(Number(expires))||Number(expires)<Date.now()||![3,4].includes(parts.length))return null;
 if(!timingSafeEqual(parts.at(-1)!,await signature(parts.slice(0,-1).join('.'))))return null;
 const configured=configuredTeachers().find(t=>t.id===id);if(configured)return publicTeacher(configured);
 const account=(await managedTeachers()).find(t=>t.id===id);
 if(!account||account.disabledAt!==null||parts.length!==4||String(account.sessionVersion)!==parts[2])return null;
 return publicTeacher(account);
}
export async function hasPilotTeacherSession(){return !!(await getPilotTeacherSession());}
export async function pilotLogin(code:string){
 if(process.env.PILOT_MODE!=='true'||typeof code!=='string'||code.length>256)return {ok:false,message:'Incorrect teacher access code.'};
 if(!await consumeAttempt(await requestKey('teacher-login'),30,600))return {ok:false,message:'Too many sign-in attempts. Wait ten minutes and try again.'};
 const clean=code.trim();let teacher:Teacher|undefined=configuredTeachers().find(t=>timingSafeEqual(clean,t.code));let version:string|undefined;
 if(!teacher){const match=await env.DB.prepare('SELECT id,display_name AS displayName,email,role,session_version AS sessionVersion FROM teacher_accounts WHERE code_digest=? AND disabled_at IS NULL').bind(await codeDigest(clean)).first<Teacher&{sessionVersion:number}>();if(match){teacher=match;version=String(match.sessionVersion)}}
 if(!teacher)return {ok:false,message:'Incorrect teacher access code.'};
 const expires=String(Date.now()+12*60*60*1000),payload=[teacher.id,expires,...(version?[version]:[])].join('.');
 (await cookies()).set(COOKIE,`${payload}.${await signature(payload)}`,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:12*60*60});
 return {ok:true,message:`Welcome, ${teacher.displayName}.`};
}
export async function pilotLogout(){(await cookies()).delete(COOKIE);}
export async function getPilotTeacherDirectory():Promise<Teacher[]>{
 if(!await getPilotTeacherSession())throw Error('Sign in required.');
 return [...configuredTeachers(),...(await managedTeachers()).filter(t=>t.disabledAt===null)].filter(t=>t.role!=='viewer').map(publicTeacher);
}
function timingSafeEqual(a:string,b:string){if(a.length!==b.length)return false;let value=0;for(let i=0;i<a.length;i++)value|=a.charCodeAt(i)^b.charCodeAt(i);return value===0;}
function toBase64Url(bytes:Uint8Array){let binary='';bytes.forEach(byte=>binary+=String.fromCharCode(byte));return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
