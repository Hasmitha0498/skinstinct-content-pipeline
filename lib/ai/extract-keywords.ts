// Turns a developed note into one concise Google News query.
import type { KeywordResult } from '../types';
import { keywordJsonSchema, keywordSchema } from '../validation/schemas';
import { generateJson } from './gemini';
import { modelChain, type AiContext } from './context';
import { KEYWORDS_SYSTEM, keywordsUser } from './prompts';

export async function extractKeywords(ctx: AiContext, note: string, logFields?: Record<string, string | number>): Promise<KeywordResult> {
  const result = await generateJson(
    ctx.transport,
    {
      label: 'extract_keywords',
      models: modelChain(ctx.models.scoring, ctx),
      system: KEYWORDS_SYSTEM,
      parts: [{ text: keywordsUser(note) }],
      jsonSchema: keywordJsonSchema,
      schema: keywordSchema,
      temperature: 0,
      lowThinking: true,
      logFields,
    },
    ctx.retry,
  );
  // Strip search operators the model may add anyway; Google News treats them specially.
  const search_query = result.search_query.replace(/["']|\b(site|when|intitle|inurl):\S*/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  return { keywords: result.keywords, search_query: search_query || result.keywords.join(' ') };
}
