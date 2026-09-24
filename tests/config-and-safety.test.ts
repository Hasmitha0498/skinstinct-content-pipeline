// Configuration validation, log redaction, and the product's hard boundary: no LinkedIn publishing path.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, DEFAULT_MODELS, pipelineSettings, readEnv, requireEnv } from '@/lib/config';
import { describeError, redact } from '@/lib/log';

describe('config', () => {
  it('applies documented defaults', () => {
    const s = pipelineSettings(readEnv({}));
    expect(s.models).toEqual({ scoring: DEFAULT_MODELS.scoring, transcription: DEFAULT_MODELS.transcription, drafting: DEFAULT_MODELS.drafting, fallback: DEFAULT_MODELS.fallback, draftingFallbacks: [...DEFAULT_MODELS.draftingFallbacks] });
    expect(s.newsRelevanceThreshold).toBe(0.7);
    expect(s.newsMaxAgeDays).toBe(30);
    expect(s.allowedChatIds).toBeNull();
  });

  it('reads overrides and allowed chat ids', () => {
    const s = pipelineSettings(readEnv({ GEMINI_MODEL_DRAFTING: 'custom', NEWS_RELEVANCE_THRESHOLD: '0.8', TELEGRAM_ALLOWED_CHAT_IDS: '12, -100345' }));
    expect(s.models.drafting).toBe('custom');
    expect(s.newsRelevanceThreshold).toBe(0.8);
    expect([...s.allowedChatIds!]).toEqual([12, -100345]);
  });

  it('rejects invalid values without echoing them', () => {
    expect(() => readEnv({ NEWS_RELEVANCE_THRESHOLD: '7' })).toThrow(ConfigError);
    expect(() => readEnv({ TELEGRAM_WEBHOOK_SECRET: 'short' })).toThrow(/TELEGRAM_WEBHOOK_SECRET/);
    expect(() => readEnv({ SUPABASE_URL: 'http://insecure.example' })).toThrow(ConfigError);
    try {
      readEnv({ TELEGRAM_WEBHOOK_SECRET: 'bad secret with spaces!!' });
    } catch (e) {
      expect(String(e)).not.toContain('bad secret with spaces');
    }
  });

  it('missing required secrets produce a named ConfigError', () => {
    expect(() => requireEnv('GEMINI_API_KEY', readEnv({}))).toThrow('Missing environment variable GEMINI_API_KEY');
  });
});

describe('log redaction', () => {
  it('removes Telegram tokens, Google keys and JWTs', () => {
    const text = redact(
      'GET https://api.telegram.org/bot123456789:AAHfakeTokenValue_abcdefghijklmnop/getFile key=AIzaSyFakeFakeFakeFakeFake123 eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZSJ9.abcdefghijklmnopqrstu',
    );
    expect(text).not.toMatch(/AAHfake|AIzaSy|eyJhbGci/);
    expect(describeError(new Error('bot123456789:AAHfakeTokenValue_abcdefghijklmnop failed'))).not.toContain('AAHfake');
  });
});

describe('human judgment boundary', () => {
  const ROOT = path.join(__dirname, '..');
  const SOURCE_DIRS = ['app', 'lib', 'scripts', 'supabase'];

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx|sql)$/.test(name) ? [full] : [];
    });
  }

  it('no source file calls a LinkedIn API or has a publish/schedule code path', () => {
    const offenders: string[] = [];
    for (const file of SOURCE_DIRS.flatMap((d) => files(path.join(ROOT, d)))) {
      const code = readFileSync(file, 'utf8');
      if (/api\.linkedin\.com|linkedin\.com\/(v2|rest|oauth)|ugcPosts|shares\?|LINKEDIN_(ACCESS|CLIENT|TOKEN)/i.test(code)) offenders.push(path.relative(ROOT, file));
      if (/\b(publishPost|schedulePost|postToLinkedIn|autoPublish)\b/.test(code)) offenders.push(path.relative(ROOT, file));
    }
    expect(offenders).toEqual([]);
  });

  it('draft statuses are only pending / approved / rejected', () => {
    const sql = readFileSync(path.join(ROOT, 'supabase', 'migrations', '001_initial_schema.sql'), 'utf8');
    expect(sql).toContain("check (status in ('pending', 'approved', 'rejected'))");
  });

  it('package.json has no LinkedIn SDK dependency', () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as Record<string, Record<string, string>>;
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter((d) => /linkedin/i.test(d))).toEqual([]);
    expect(deps.filter((d) => /anthropic|openai/i.test(d))).toEqual([]); // runtime AI is Gemini only
  });
});
