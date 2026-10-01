import { getDatabase } from '#database';
import {getOidcSettings} from '../../oidc-config';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const result = await getDatabase().prepare('SELECT 1 AS ok').first<{ ok: number }>();
    if (result?.ok !== 1) throw new Error('Database readiness query failed.');
    if(process.env.AUTH_PROVIDER==='oidc'){
      getOidcSettings();
      await getDatabase().prepare('SELECT COUNT(*) AS count FROM oidc_sessions').first<{count:number}>();
    }
    return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
