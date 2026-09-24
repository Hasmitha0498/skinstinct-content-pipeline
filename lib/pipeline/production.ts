// Builds the real dependencies from environment variables. Throws ConfigError if a required one is missing.
import { createGeminiTransport } from '../ai/gemini';
import { pipelineSettings, readEnv, requireEnv } from '../config';
import { searchGoogleNews } from '../news/google-news';
import { supabaseAdmin } from '../supabase/client';
import { createSupabaseRepository } from '../supabase/repository';
import { createTelegramApi } from '../telegram/client';
import { loadActiveVoiceSkill } from '../voice-skill';
import { createAiService, type PipelineDeps } from './deps';

let cached: PipelineDeps | null = null;

export function productionDeps(): PipelineDeps {
  if (cached) return cached;
  const env = readEnv();
  const settings = pipelineSettings(env);
  const repo = createSupabaseRepository(supabaseAdmin());
  cached = {
    repo,
    telegram: createTelegramApi(requireEnv('TELEGRAM_BOT_TOKEN', env)),
    ai: createAiService({ transport: createGeminiTransport(requireEnv('GEMINI_API_KEY', env)), models: settings.models }),
    searchNews: (query) => searchGoogleNews(query),
    loadVoiceSkill: () => loadActiveVoiceSkill(repo),
    settings,
  };
  return cached;
}
