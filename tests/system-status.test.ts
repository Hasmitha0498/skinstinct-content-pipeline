// The public status endpoint: real checks, booleans only, nothing secret in the response.
import { describe, expect, it, vi } from 'vitest';
import { readEnv } from '@/lib/config';
import { checkSystemStatus } from '@/lib/system-status';

const ENV = readEnv({
  GEMINI_API_KEY: 'AIzaFakeKeyForStatusTest1234567890',
  TELEGRAM_BOT_TOKEN: '123456789:AAFakeTokenForStatusTests_abcdefghijk',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fake_status_key_1234567890',
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function fakeFetch(overrides: Partial<Record<'gemini' | 'telegram' | 'supabase', () => Response | Promise<Response>>> = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('generativelanguage')) return (overrides.gemini ?? (() => json({ name: 'models/x' })))();
    if (url.includes('api.telegram.org')) return (overrides.telegram ?? (() => json({ ok: true, result: { url: 'https://x.vercel.app/api/webhook' } })))();
    if (url.includes('supabase.co')) return (overrides.supabase ?? (() => json([{ id: 'v1' }])))();
    throw new Error(`unexpected ${url}`);
  });
}

describe('checkSystemStatus', () => {
  it('reports every component healthy, as booleans only', async () => {
    const status = await checkSystemStatus({ env: ENV, fetchImpl: fakeFetch() as unknown as typeof fetch });
    expect(status).toMatchObject({ app: 'online', gemini: true, telegram: true, supabase: true, voiceSkill: true });
    expect(Object.keys(status).sort()).toEqual(['app', 'checkedAt', 'gemini', 'supabase', 'telegram', 'voiceSkill']);
  });

  it('never includes secrets in its output, even when checks fail with errors', async () => {
    const boom = () => Promise.reject(new Error(`failed for ${ENV.GEMINI_API_KEY} ${ENV.TELEGRAM_BOT_TOKEN}`));
    const status = await checkSystemStatus({
      env: ENV,
      fetchImpl: fakeFetch({ gemini: boom, telegram: boom, supabase: boom }) as unknown as typeof fetch,
      readVoiceFile: async () => '',
    });
    const text = JSON.stringify(status);
    for (const secret of [ENV.GEMINI_API_KEY!, ENV.TELEGRAM_BOT_TOKEN!, ENV.SUPABASE_SERVICE_ROLE_KEY!, 'example.supabase.co']) expect(text).not.toContain(secret);
    expect(status).toMatchObject({ gemini: false, telegram: false, supabase: false, voiceSkill: false });
  });

  it('marks Gemini unconfigured when the key is rejected, and Telegram disconnected when no webhook is set', async () => {
    const status = await checkSystemStatus({
      env: ENV,
      fetchImpl: fakeFetch({ gemini: () => json({ error: 'bad key' }, 400), telegram: () => json({ ok: true, result: { url: '' } }) }) as unknown as typeof fetch,
    });
    expect(status.gemini).toBe(false);
    expect(status.telegram).toBe(false);
  });

  it('Voice Skill: missing DB row but bundled file present still counts as loaded (the pipeline falls back to it)', async () => {
    const status = await checkSystemStatus({
      env: ENV,
      fetchImpl: fakeFetch({ supabase: () => json([]) }) as unknown as typeof fetch,
      readVoiceFile: async () => 'x'.repeat(500),
    });
    expect(status).toMatchObject({ supabase: true, voiceSkill: true });
  });

  it('with no configuration at all, everything except the app is off and no request is made', async () => {
    const fetchImpl = fakeFetch();
    const status = await checkSystemStatus({ env: readEnv({}), fetchImpl: fetchImpl as unknown as typeof fetch, readVoiceFile: async () => '' });
    expect(status).toMatchObject({ app: 'online', gemini: false, telegram: false, supabase: false, voiceSkill: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
