import { NextResponse } from 'next/server';
import { pilotLogout } from '../../pilot-auth';

export async function GET(request:Request){
 if(process.env.AUTH_PROVIDER==='oidc')return NextResponse.redirect(new URL('/api/auth/logout',request.url));
 await pilotLogout();return NextResponse.redirect(new URL('/pilot/login',request.url));
}
