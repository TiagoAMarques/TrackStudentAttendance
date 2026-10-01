import { NextResponse } from 'next/server';
import * as oidc from 'openid-client';
import { cookies } from 'next/headers';
import { getDatabase } from '#database';
import { getOidcConfiguration, getOidcSettings, oidcEnabled } from '../../../oidc-config';
import { digestOpaqueToken, OIDC_SESSION_COOKIE } from '../../../oidc-session';

export const dynamic='force-dynamic';
export async function GET(request:Request){
  if(!oidcEnabled())return NextResponse.redirect(new URL('/',request.url));
  const settings=getOidcSettings(),token=(await cookies()).get(OIDC_SESSION_COOKIE)?.value;
  if(token)await getDatabase().prepare('DELETE FROM oidc_sessions WHERE token_hash=?').bind(await digestOpaqueToken(token)).run();
  let destination=settings.postLogoutRedirectUri;
  try{
    const configuration=await getOidcConfiguration();
    if(configuration.serverMetadata().end_session_endpoint)destination=oidc.buildEndSessionUrl(configuration,{client_id:settings.clientId,post_logout_redirect_uri:settings.postLogoutRedirectUri}).toString();
  }catch(error){console.error('OIDC provider logout discovery failed; local session was still closed:',error instanceof Error?error.message:'unknown error');}
  const response=NextResponse.redirect(destination);response.cookies.set(OIDC_SESSION_COOKIE,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:0});response.headers.set('Cache-Control','no-store');return response;
}
