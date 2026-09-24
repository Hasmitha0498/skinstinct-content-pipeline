// Publishability scoring: five 0-2 dimensions from Gemini, total and decision computed here.
import { PUBLISHABILITY_THRESHOLD } from '../config';
import type { NoteScore } from '../types';
import { scoreJsonSchema, scoreSchema, type RawScore } from '../validation/schemas';
import { generateJson } from './gemini';
import { modelChain, type AiContext } from './context';
import { SCORE_SYSTEM, scoreUser } from './prompts';

/** Never trusts the model's arithmetic or decision: both are derived from the five validated parts. */
export function finaliseScore(raw: RawScore): NoteScore {
  const total = raw.insight + raw.specificity + raw.relevance + raw.evidence + raw.completeness;
  return {
    insight: raw.insight,
    specificity: raw.specificity,
    relevance: raw.relevance,
    evidence: raw.evidence,
    completeness: raw.completeness,
    total_score: total,
    decision: total >= PUBLISHABILITY_THRESHOLD ? 'develop' : 'reject',
    reason: raw.reason,
    improvement_hint: raw.improvement_hint,
  };
}

export async function scoreNote(ctx: AiContext, note: string, logFields?: Record<string, string | number>): Promise<NoteScore> {
  const raw = await generateJson(
    ctx.transport,
    {
      label: 'score_note',
      models: modelChain(ctx.models.scoring, ctx),
      system: SCORE_SYSTEM,
      parts: [{ text: scoreUser(note) }],
      jsonSchema: scoreJsonSchema,
      schema: scoreSchema,
      temperature: 0,
      lowThinking: true,
      logFields,
    },
    ctx.retry,
  );
  return finaliseScore(raw);
}
