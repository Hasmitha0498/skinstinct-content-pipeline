// POST /api/webhook - Telegram delivers every update here.
//
// Why respond first and work afterwards: drafting takes several Gemini calls (often 15-60 s). If Telegram
// doesn't get a quick 200 it re-sends the update. So inside the request we only verify the secret and
// atomically claim the update id in Supabase; the slow work runs in `after()`, which Vercel keeps alive
// (up to maxDuration) after the response is sent. A re-sent update finds its id already claimed and stops.
import { timingSafeEqual } from 'node:crypto';
import { after } from 'next/server';
import { ConfigError, readEnv } from '@/lib/config';
import { describeError, log } from '@/lib/log';
import { receiveUpdate } from '@/lib/pipeline/handle-update';
import { productionDeps } from '@/lib/pipeline/production';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // seconds; the Vercel Hobby plan maximum

function secretMatches(received: string | null, expected: string): boolean {
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  let expected: string | undefined;
  try {
    expected = readEnv().TELEGRAM_WEBHOOK_SECRET;
  } catch (error) {
    log.error('webhook.config_invalid', { error: describeError(error) });
    return new Response('Server misconfigured', { status: 500 });
  }
  // The webhook is never left open: without a configured secret it refuses everything.
  if (!expected) {
    log.error('webhook.secret_not_configured');
    return new Response('Server misconfigured', { status: 500 });
  }
  if (!secretMatches(request.headers.get('x-telegram-bot-api-secret-token'), expected)) {
    log.warn('webhook.bad_secret');
    return new Response('Unauthorized', { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  let deps;
  try {
    deps = productionDeps();
  } catch (error) {
    log.error('webhook.deps_failed', { error: error instanceof ConfigError ? error.message : describeError(error) });
    return new Response('Server misconfigured', { status: 500 });
  }

  const receipt = await receiveUpdate(deps, body);
  if (receipt.work) after(receipt.work);
  return new Response(receipt.status, { status: receipt.httpStatus });
}

export function GET(): Response {
  return new Response('This endpoint accepts Telegram webhook POSTs only.', { status: 405 });
}
