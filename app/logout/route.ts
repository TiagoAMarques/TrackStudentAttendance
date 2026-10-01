import {NextResponse} from 'next/server';
import {authenticationSignOutPath,isPilotMode} from '../chatgpt-auth';
import {pilotLogout} from '../pilot-auth';
export async function GET(request:Request){
 if(isPilotMode())await pilotLogout();
 return NextResponse.redirect(new URL(authenticationSignOutPath('/'),request.url));
}
