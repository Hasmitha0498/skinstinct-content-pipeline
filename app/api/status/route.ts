// GET /api/status - live component status for the public page. Booleans only; never secrets or details.
import { cachedSystemStatus } from '@/lib/system-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(): Promise<Response> {
  const status = await cachedSystemStatus();
  return Response.json(status, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } });
}
