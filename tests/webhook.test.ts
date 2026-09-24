// The HTTP layer: webhook authentication, background hand-off, and the health endpoint.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDeps, textUpdate } from './helpers/fakes';

const SECRET = 'test_secret_value_1234567890';
const background: Array<() => Promise<void>> = [];
let current = buildDeps();

vi.mock('next/server', () => ({ after: (task: () => Promise<void>) => background.push(task) }));
vi.mock('@/lib/pipeline/production', () => ({ productionDeps: () => current.deps }));

const { POST, GET } = await import('@/app/api/webhook/route');
const health = await import('@/app/api/health/route');

function post(body: unknown, secret: string | null = SECRET) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secret !== null) headers['x-telegram-bot-api-secret-token'] = secret;
  return POST(new Request('https://example.test/api/webhook', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }));
}

beforeEach(() => {
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', SECRET);
  current = buildDeps();
  background.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

describe('POST /api/webhook', () => {
  it('rejects requests without the secret header or with a wrong one', async () => {
    expect((await post(textUpdate('hi'), null)).status).toBe(401);
    expect((await post(textUpdate('hi'), 'wrong_secret_value_000000000')).status).toBe(401);
    expect(current.ai.score).not.toHaveBeenCalled();
    expect(current.repo.updates.size).toBe(0);
  });

  it('refuses to run unauthenticated when no secret is configured', async () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', '');
    expect((await post(textUpdate('hi'), '')).status).toBe(500);
  });

  it('claims the update, answers 200 immediately and processes in the background', async () => {
    const response = await post(textUpdate('A strong note about batch fourteen'));
    expect(response.status).toBe(200);
    expect(current.repo.updates.size).toBe(1);
    expect(current.ai.score).not.toHaveBeenCalled(); // not yet: work was deferred
    expect(background).toHaveLength(1);
    await background[0]!();
    expect(current.ai.score).toHaveBeenCalledOnce();
    expect(current.repo.drafts).toHaveLength(1);
  });

  it('a retried update gets 200 and schedules no work', async () => {
    const update = textUpdate('note');
    await post(update);
    const retry = await post(update);
    expect(retry.status).toBe(200);
    expect(background).toHaveLength(1);
  });

  it('invalid JSON -> 400', async () => {
    expect((await post('{not json')).status).toBe(400);
  });

  it('GET is not allowed', () => {
    expect(GET().status).toBe(405);
  });
});

describe('GET /api/health', () => {
  it('returns status ok and nothing about configuration', async () => {
    const body = await health.GET().json();
    expect(body).toEqual({ status: 'ok' });
  });
});
