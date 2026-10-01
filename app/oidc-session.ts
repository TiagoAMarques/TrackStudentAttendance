import { cookies } from 'next/headers';
import { getDatabase } from '#database';
import type { ChatGPTUser } from './chatgpt-auth';

export const OIDC_SESSION_COOKIE = 'pulse_oidc_session';
export const OIDC_SESSION_SECONDS = 8 * 60 * 60;

export async function digestOpaqueToken(value: string) {
  const secret=process.env.AUTH_SESSION_SECRET;
  if(!secret||secret.length<32)throw Error('AUTH_SESSION_SECRET must contain at least 32 characters.');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes = await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export function randomOpaqueToken() { return crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', ''); }

export function oidcProvider(issuer: string) { return `oidc:${issuer}`; }

export async function oidcUserId(issuer: string, subject: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${issuer}\0${subject}`));
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return `oidc:${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}`;
}

export async function getOidcSessionUser(): Promise<ChatGPTUser | null> {
  const token = (await cookies()).get(OIDC_SESSION_COOKIE)?.value;
  if (!token || token.length > 256) return null;
  const time = Math.floor(Date.now() / 1000);
  const row = await getDatabase().prepare(`SELECT issuer,subject,user_id AS userId,email,display_name AS displayName,teacher_access AS teacherAccess
    FROM oidc_sessions WHERE token_hash=? AND expires_at>?`).bind(await digestOpaqueToken(token), time)
    .first<{issuer:string;subject:string;userId:string;email:string;displayName:string;teacherAccess:number}>();
  if (!row) return null;
  return { userId: row.userId, email: row.email, displayName: row.displayName, fullName: row.displayName,
    identityProvider: oidcProvider(row.issuer), identitySubject: row.subject, teacherAccess: row.teacherAccess === 1 };
}
