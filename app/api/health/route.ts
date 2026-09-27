import { getDatabase } from '#database';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const result = await getDatabase().prepare('SELECT 1 AS ok').first<{ ok: number }>();
    if (result?.ok !== 1) throw new Error('Database readiness query failed.');
    return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
