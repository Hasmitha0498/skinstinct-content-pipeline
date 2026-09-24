// Shared by the evaluation scripts: the same AI service the deployed app uses, built from .env.local.
import { createHash } from 'node:crypto';
import { createGeminiTransport } from '../lib/ai/gemini';
import { SCORE_SYSTEM, draftSystem } from '../lib/ai/prompts';
import { pipelineSettings, readEnv, requireEnv } from '../lib/config';
import { createAiService } from '../lib/pipeline/deps';

export function liveAi() {
  const env = readEnv();
  const settings = pipelineSettings(env);
  return { ai: createAiService({ transport: createGeminiTransport(requireEnv('GEMINI_API_KEY', env)), models: settings.models }), settings };
}

/** Short fingerprint of a prompt, so reports show exactly which prompt version produced a result. */
export function fingerprint(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 10);
}
export const scorePromptVersion = () => fingerprint(SCORE_SYSTEM);
export const draftPromptVersion = (voice: string) => fingerprint(draftSystem(voice));

export const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
