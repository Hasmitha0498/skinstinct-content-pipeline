// Live, server-side health checks for the public status panel. Only booleans leave this module:
// no keys, URLs, model names, error messages or counts are ever returned to the browser.
import { readFile } from 'node:fs/promises';
import { pipelineSettings, readEnv, type Env } from './config';
import { describeError, log } from './log';
import { VOICE_SKILL_FILE } from './voice-skill';

export interface SystemStatus {
  app: 'online';
  gemini: boolean;
  telegram: boolean;
  supabase: boolean;
  voiceSkill: boolean;
  checkedAt: string;
}

export interface StatusDeps {
  fetchImpl?: typeof fetch;
  env?: Env;
  readVoiceFile?: () => Promise<string>;
  timeoutMs?: number;
}

async function ok(label: string, run: () => Promise<boolean>): Promise<boolean> {
  try {
    return await run();
  } catch (error) {
    log.warn('status.check_failed', { check: label, error: describeError(error) });
    return false;
  }
}

export async function checkSystemStatus(deps: StatusDeps = {}): Promise<SystemStatus> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeout = () => AbortSignal.timeout(deps.timeoutMs ?? 4000);
  let env: Env;
  try {
    env = deps.env ?? readEnv();
  } catch {
    return { app: 'online', gemini: false, telegram: false, supabase: false, voiceSkill: false, checkedAt: new Date().toISOString() };
  }

  // Gemini: fetch the configured model's metadata (a real authenticated call that uses no generation quota).
  const gemini = ok('gemini', async () => {
    if (!env.GEMINI_API_KEY) return false;
    const model = pipelineSettings(env).models.scoring;
    const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`, {
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY },
      signal: timeout(),
    });
    return res.ok;
  });

  // Telegram: the bot token works AND Telegram is delivering to this app's /api/webhook.
  const telegram = ok('telegram', async () => {
    if (!env.TELEGRAM_BOT_TOKEN) return false;
    const res = await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`, { signal: timeout() });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean; result?: { url?: string } };
    return Boolean(body.ok && body.result?.url?.endsWith('/api/webhook'));
  });

  // Supabase + Voice Skill: one query for the active Voice Skill row.
  const supabaseAndVoice = (async (): Promise<{ supabase: boolean; voiceInDb: boolean }> => {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { supabase: false, voiceInDb: false };
    try {
      const res = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/voice_skills?select=id&is_active=eq.true&limit=1`, {
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
        signal: timeout(),
      });
      if (!res.ok) return { supabase: false, voiceInDb: false };
      const rows = (await res.json()) as unknown[];
      return { supabase: true, voiceInDb: Array.isArray(rows) && rows.length > 0 };
    } catch (error) {
      log.warn('status.check_failed', { check: 'supabase', error: describeError(error) });
      return { supabase: false, voiceInDb: false };
    }
  })();

  const [g, t, s] = await Promise.all([gemini, telegram, supabaseAndVoice]);
  // The pipeline falls back to the bundled file if the database copy is unreachable, so either counts.
  const voiceSkill =
    s.voiceInDb || (await ok('voice_skill_file', async () => ((await (deps.readVoiceFile ?? (() => readFile(VOICE_SKILL_FILE, 'utf8')))()).trim().length > 200)));

  return { app: 'online', gemini: g, telegram: t, supabase: s.supabase, voiceSkill, checkedAt: new Date().toISOString() };
}

// Cache per server instance so a busy page can't hammer Gemini, Telegram or Supabase.
let cached: { at: number; value: SystemStatus } | null = null;
export async function cachedSystemStatus(maxAgeMs = 60_000): Promise<SystemStatus> {
  if (cached && Date.now() - cached.at < maxAgeMs) return cached.value;
  const value = await checkSystemStatus();
  cached = { at: Date.now(), value };
  return value;
}
