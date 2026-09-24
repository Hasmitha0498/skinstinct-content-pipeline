// GET /api/health - a liveness check for deployment verification. Deliberately reveals nothing about
// configuration or which secrets exist.
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ status: 'ok' });
}
