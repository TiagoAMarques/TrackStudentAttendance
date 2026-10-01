import { NextResponse } from 'next/server';
import * as oidc from 'openid-client';
import { getDatabase } from '#database';
import { getOidcConfiguration, getOidcSettings, oidcEnabled, safeReturnPath } from '../../../oidc-config';
import { digestOpaqueToken } from '../../../oidc-session';

export const dynamic='force-dynamic';

export async function GET(request:Request){
  if(!oidcEnabled())return Response.json({error:'University sign-in is not enabled.'},{status:404});
  try{
    const settings=getOidcSettings(),configuration=await getOidcConfiguration(),url=new URL(request.url);
    const state=oidc.randomState(),nonce=oidc.randomNonce(),codeVerifier=oidc.randomPKCECodeVerifier();
    const codeChallenge=await oidc.calculatePKCECodeChallenge(codeVerifier),time=Math.floor(Date.now()/1000);
    await getDatabase().batch([
      getDatabase().prepare('DELETE FROM oidc_auth_requests WHERE expires_at<=?').bind(time),
      getDatabase().prepare('INSERT INTO oidc_auth_requests(state_hash,nonce,code_verifier,return_to,created_at,expires_at) VALUES (?,?,?,?,?,?)')
        .bind(await digestOpaqueToken(state),nonce,codeVerifier,safeReturnPath(url.searchParams.get('return_to')),time,time+600),
    ]);
    const destination=oidc.buildAuthorizationUrl(configuration,{redirect_uri:settings.redirectUri,scope:settings.scopes,response_type:'code',state,nonce,code_challenge:codeChallenge,code_challenge_method:'S256'});
    return NextResponse.redirect(destination,{headers:{'Cache-Control':'no-store'}});
  }catch(error){console.error('OIDC sign-in initialization failed:',error instanceof Error?error.message:'unknown error');return NextResponse.redirect(new URL('/auth/error?reason=configuration',request.url));}
}
