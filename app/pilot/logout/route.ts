import { NextResponse } from 'next/server';
import { pilotLogout } from '../../pilot-auth';

export async function GET(request:Request){await pilotLogout();return NextResponse.redirect(new URL('/pilot/login',request.url))}
