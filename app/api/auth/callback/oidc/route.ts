import { NextResponse } from 'next/server';
import * as oidc from 'openid-client';
import { getDatabase } from '#database';
import { claimValue, getOidcConfiguration, getOidcSettings, oidcEnabled, teacherAccessFromClaims } from '../../../../oidc-config';
import { digestOpaqueToken, OIDC_SESSION_COOKIE, OIDC_SESSION_SECONDS, oidcUserId, randomOpaqueToken } from '../../../../oidc-session';
import { linkAuthoritativeStudentIdentity } from '../../../../oidc-identity';

export const dynamic='force-dynamic';

export async function GET(request:Request){
  if(!oidcEnabled())return Response.json({error:'University sign-in is not enabled.'},{status:404});
  const requestUrl=new URL(request.url),state=requestUrl.searchParams.get('state');
  if(!state)return fail(request,'state');
  const stateHash=await digestOpaqueToken(state),time=Math.floor(Date.now()/1000);
  const transaction=await getDatabase().prepare('SELECT nonce,code_verifier AS codeVerifier,return_to AS returnTo,expires_at AS expiresAt FROM oidc_auth_requests WHERE state_hash=?')
    .bind(stateHash).first<{nonce:string;codeVerifier:string;returnTo:string;expiresAt:number}>();
  await getDatabase().prepare('DELETE FROM oidc_auth_requests WHERE state_hash=?').bind(stateHash).run();
  if(!transaction||transaction.expiresAt<=time)return fail(request,'expired');
  try{
    const settings=getOidcSettings(),configuration=await getOidcConfiguration();
    const externalUrl=new URL(settings.redirectUri);externalUrl.search=requestUrl.search;
    const tokens=await oidc.authorizationCodeGrant(configuration,externalUrl,{pkceCodeVerifier:transaction.codeVerifier,expectedState:state,expectedNonce:transaction.nonce});
    const idClaims=tokens.claims() as Record<string,unknown>|undefined;
    if(!idClaims||typeof idClaims.sub!=='string'||typeof idClaims.iss!=='string')throw Error('The identity provider did not return validated issuer and subject claims.');
    if(idClaims.iss!==settings.issuer)throw Error('The returned issuer does not exactly match OIDC_ISSUER_URL.');
    let claims=idClaims;
    if(tokens.access_token&&configuration.serverMetadata().userinfo_endpoint){
      const userInfo=await oidc.fetchUserInfo(configuration,tokens.access_token,idClaims.sub);
      claims={...idClaims,...userInfo,sub:idClaims.sub,iss:idClaims.iss};
    }
    const idNumberValue=claimValue(claims,settings.studentIdClaim);
    if(typeof idNumberValue!=='string'&&typeof idNumberValue!=='number')throw Error(`The ${settings.studentIdClaim} claim is missing.`);
    const idNumber=String(idNumberValue).trim();if(!idNumber)throw Error(`The ${settings.studentIdClaim} claim is empty.`);
    const teacherAccess=teacherAccessFromClaims(claims,settings);
    const subject=idClaims.sub,userId=await oidcUserId(settings.issuer,subject);
    const email=typeof claims.email==='string'?claims.email.trim().toLowerCase():'';
    const displayName=[claims.name,claims.preferred_username,email,idNumber].find(value=>typeof value==='string'&&value.trim()) as string;
    await linkAuthoritativeStudentIdentity(settings.issuer,subject,idNumber,userId);
    const sessionToken=randomOpaqueToken(),expiresAt=time+OIDC_SESSION_SECONDS;
    await getDatabase().batch([
      getDatabase().prepare('DELETE FROM oidc_sessions WHERE expires_at<=?').bind(time),
      getDatabase().prepare('INSERT INTO oidc_sessions(token_hash,issuer,subject,user_id,email,display_name,teacher_access,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(await digestOpaqueToken(sessionToken),settings.issuer,subject,userId,email,displayName,teacherAccess?1:0,time,expiresAt),
    ]);
    const response=NextResponse.redirect(new URL(transaction.returnTo,settings.publicOrigin));
    response.cookies.set(OIDC_SESSION_COOKIE,sessionToken,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:OIDC_SESSION_SECONDS});
    response.headers.set('Cache-Control','no-store');return response;
  }catch(error){console.error('OIDC callback failed:',error instanceof Error?error.message:'unknown error');return fail(request,'callback');}
}

function fail(request:Request,reason:string){return NextResponse.redirect(new URL(`/auth/error?reason=${encodeURIComponent(reason)}`,request.url),{headers:{'Cache-Control':'no-store'}});}
