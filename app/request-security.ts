import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';

// Trust only the provider-controlled client address. Forwarded headers supplied
// by a visitor are deliberately ignored; a VM adapter must supply a trusted key.
export async function requestKey(scope:string){
 const h=await headers(),address=h.get('cf-connecting-ip')??'unknown';
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(scope+':'+address));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function consumeAttempt(key:string,limit:number,seconds:number){
 const time=Math.floor(Date.now()/1000);
 const row=await env.DB.prepare(`INSERT INTO pilot_rate_limits(client_key,window_started_at,failed_attempts,blocked_until) VALUES (?,?,1,NULL)
 ON CONFLICT(client_key) DO UPDATE SET
 failed_attempts=CASE WHEN window_started_at<=? THEN 1 ELSE failed_attempts+1 END,
 window_started_at=CASE WHEN window_started_at<=? THEN excluded.window_started_at ELSE window_started_at END,
 blocked_until=NULL RETURNING failed_attempts AS attempts`).bind(key,time,time-seconds,time-seconds).first<{attempts:number}>();
 return !!row&&row.attempts<=limit;
}
export async function studentAttemptAllowed(number:string,token:string){
 if(!await consumeAttempt(await requestKey('student-network'),5000,600))return false;
 return consumeAttempt(await requestKey('student:'+number.trim().toLowerCase()+':'+token),30,600);
}
export function validRedemption(kind:unknown,token:unknown){return ['attendance','points','onboarding'].includes(String(kind))&&typeof token==='string'&&token.length>0&&token.length<=256;}
