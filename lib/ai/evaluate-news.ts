// Asks Gemini whether any retrieved headline genuinely fits the note, then applies a conservative
// code-level threshold. Returning null means "draft without news", which is always acceptable.
import type { NewsDecision, NewsItem } from '../types';
import { newsRelevanceJsonSchema, newsRelevanceSchema } from '../validation/schemas';
import { generateJson } from './gemini';
import { modelChain, type AiContext } from './context';
import { RELEVANCE_SYSTEM, relevanceUser } from './prompts';

export interface NewsEvaluation {
  decision: NewsDecision | null;
  /** Why no item was used, for logs and the notes table. */
  rejectedBecause: string | null;
}

export async function evaluateNews(
  ctx: AiContext,
  note: string,
  candidates: NewsItem[],
  threshold: number,
  logFields?: Record<string, string | number>,
): Promise<NewsEvaluation> {
  if (candidates.length === 0) return { decision: null, rejectedBecause: 'no candidates' };
  const result = await generateJson(
    ctx.transport,
    {
      label: 'evaluate_news',
      models: modelChain(ctx.models.scoring, ctx),
      system: RELEVANCE_SYSTEM,
      parts: [{ text: relevanceUser(note, candidates) }],
      jsonSchema: newsRelevanceJsonSchema,
      schema: newsRelevanceSchema,
      temperature: 0,
      lowThinking: true,
      logFields,
    },
    ctx.retry,
  );

  if (!result.relevant || result.candidate_number === 0) return { decision: null, rejectedBecause: `not relevant: ${result.reason}` };
  const item = candidates[result.candidate_number - 1];
  if (!item) return { decision: null, rejectedBecause: 'model chose a candidate that does not exist' };
  if (result.confidence < threshold) {
    return { decision: null, rejectedBecause: `confidence ${result.confidence.toFixed(2)} below threshold ${threshold.toFixed(2)}` };
  }
  if (!result.usable_connection) return { decision: null, rejectedBecause: 'no usable connection described' };
  return { decision: { item, confidence: result.confidence, reason: result.reason, usable_connection: result.usable_connection }, rejectedBecause: null };
}
