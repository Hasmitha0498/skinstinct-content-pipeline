// All configuration comes from environment variables and is validated here. Nothing secret is
// hard-coded. Values are read lazily so /api/health and scripts work with only what they need.
import { z } from 'zod';

/** Notes scoring below this are not drafted. Fixed by the product spec, so not configurable. */
export const PUBLISHABILITY_THRESHOLD = 6;

/**
 * Default Gemini models. These are the IDs this Gemini account already used successfully in the
 * flat-decider-bot project; `npm run gemini:models` lists what your key can actually reach.
 * flash-lite has the largest free-tier allowance, so it handles the classification calls.
 */
export const DEFAULT_MODELS = {
  scoring: 'gemini-3.1-flash-lite',
  transcription: 'gemini-3.1-flash-lite',
  drafting: 'gemini-3.5-flash',
  fallback: 'gemini-3.1-flash-lite',
  // Drafting needs a Flash-class writer; each model has its own free-tier quota, so try another Flash
  // model before dropping to flash-lite (which follows the Voice Skill noticeably less well).
  draftingFallbacks: ['gemini-3.8-flash', 'gemini-3.1-flash-lite'],
} as const;

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : undefined));

function optionalNumber(min: number, max: number, integer = false) {
  return optionalString.transform((value, ctx) => {
    if (value === undefined) return undefined;
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
      ctx.addIssue({ code: 'custom', message: `must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}` });
      return z.NEVER;
    }
    return n;
  });
}

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: optionalString,
  TELEGRAM_WEBHOOK_SECRET: optionalString.refine(
    (v) => v === undefined || /^[A-Za-z0-9_-]{16,256}$/.test(v),
    'TELEGRAM_WEBHOOK_SECRET must be 16-256 characters of A-Z, a-z, 0-9, _ or -',
  ),
  TELEGRAM_ALLOWED_CHAT_IDS: optionalString,
  GEMINI_API_KEY: optionalString,
  GEMINI_MODEL_SCORING: optionalString,
  GEMINI_MODEL_TRANSCRIPTION: optionalString,
  GEMINI_MODEL_DRAFTING: optionalString,
  GEMINI_FALLBACK_MODEL: optionalString,
  GEMINI_DRAFTING_FALLBACK_MODELS: optionalString,
  SUPABASE_URL: optionalString.refine((v) => v === undefined || /^https:\/\//.test(v), 'SUPABASE_URL must start with https://'),
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  NEWS_RELEVANCE_THRESHOLD: optionalNumber(0, 1),
  NEWS_MAX_AGE_DAYS: optionalNumber(1, 365, true),
});

export type Env = z.infer<typeof envSchema>;
type SecretName = 'TELEGRAM_BOT_TOKEN' | 'TELEGRAM_WEBHOOK_SECRET' | 'GEMINI_API_KEY' | 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function readEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    // Only the variable names and rule text are reported, never the values.
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ConfigError(`Invalid environment configuration: ${problems}`);
  }
  return parsed.data;
}

export function requireEnv(name: SecretName, env: Env = readEnv()): string {
  const value = env[name];
  if (!value) throw new ConfigError(`Missing environment variable ${name}`);
  return value;
}

export interface PipelineSettings {
  models: { scoring: string; transcription: string; drafting: string; fallback?: string; draftingFallbacks?: string[] };
  newsRelevanceThreshold: number;
  newsMaxAgeDays: number;
  allowedChatIds: Set<number> | null; // null = anyone may use the bot (setup mode)
}

export function pipelineSettings(env: Env = readEnv()): PipelineSettings {
  const drafting = env.GEMINI_MODEL_DRAFTING ?? DEFAULT_MODELS.drafting;
  const fallback = env.GEMINI_FALLBACK_MODEL ?? DEFAULT_MODELS.fallback;
  return {
    models: {
      scoring: env.GEMINI_MODEL_SCORING ?? DEFAULT_MODELS.scoring,
      transcription: env.GEMINI_MODEL_TRANSCRIPTION ?? DEFAULT_MODELS.transcription,
      drafting,
      fallback,
      draftingFallbacks: env.GEMINI_DRAFTING_FALLBACK_MODELS
        ? env.GEMINI_DRAFTING_FALLBACK_MODELS.split(',').map((m) => m.trim()).filter(Boolean)
        : [...DEFAULT_MODELS.draftingFallbacks],
    },
    newsRelevanceThreshold: env.NEWS_RELEVANCE_THRESHOLD ?? 0.7,
    newsMaxAgeDays: env.NEWS_MAX_AGE_DAYS ?? 30,
    allowedChatIds: parseChatIds(env.TELEGRAM_ALLOWED_CHAT_IDS),
  };
}

function parseChatIds(value: string | undefined): Set<number> | null {
  if (!value) return null;
  const ids = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      if (!/^-?\d+$/.test(s)) throw new ConfigError('TELEGRAM_ALLOWED_CHAT_IDS must be comma-separated numeric chat IDs');
      return Number(s);
    });
  return ids.length ? new Set(ids) : null;
}
