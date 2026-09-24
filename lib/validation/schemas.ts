// Shapes of every Gemini response. The JSON schema is sent to Gemini (structured output); the Zod schema
// re-checks the answer on our side, because structured output is a request, not a guarantee.
import { z } from 'zod';

const dimension = z.number().int().min(0).max(2);

export const transcriptionSchema = z.object({
  is_intelligible: z.boolean(),
  transcript: z.string().max(20_000),
});
export const transcriptionJsonSchema = {
  type: 'object',
  properties: {
    is_intelligible: { type: 'boolean', description: 'false if there is no clearly intelligible speech' },
    transcript: { type: 'string', description: 'verbatim transcript; empty if not intelligible' },
  },
  required: ['is_intelligible', 'transcript'],
};

export const scoreSchema = z.object({
  insight: dimension,
  specificity: dimension,
  relevance: dimension,
  evidence: dimension,
  completeness: dimension,
  // Accepted but never trusted: the server recomputes the total and the decision.
  total_score: z.number().optional(),
  decision: z.string().optional(),
  reason: z.string().trim().min(1).max(1000),
  improvement_hint: z.string().trim().max(600).default(''),
});
export type RawScore = z.infer<typeof scoreSchema>;

const dimensionJson = { type: 'integer', minimum: 0, maximum: 2 };
export const scoreJsonSchema = {
  type: 'object',
  properties: {
    insight: dimensionJson,
    specificity: dimensionJson,
    relevance: dimensionJson,
    evidence: dimensionJson,
    completeness: dimensionJson,
    total_score: { type: 'integer', minimum: 0, maximum: 10 },
    decision: { type: 'string', enum: ['develop', 'reject'] },
    reason: { type: 'string' },
    improvement_hint: { type: 'string' },
  },
  required: ['insight', 'specificity', 'relevance', 'evidence', 'completeness', 'total_score', 'decision', 'reason', 'improvement_hint'],
};

export const keywordSchema = z.object({
  keywords: z.array(z.string().trim().min(1).max(60)).min(1).max(5),
  search_query: z.string().trim().min(2).max(100),
});
export const keywordJsonSchema = {
  type: 'object',
  properties: {
    keywords: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 },
    search_query: { type: 'string' },
  },
  required: ['keywords', 'search_query'],
};

export const newsRelevanceSchema = z.object({
  candidate_number: z.number().int().min(0), // 0 = none of the candidates
  relevant: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().min(1).max(1000),
  usable_connection: z.string().trim().max(600),
});
export const newsRelevanceJsonSchema = {
  type: 'object',
  properties: {
    candidate_number: { type: 'integer', minimum: 0, description: '1-based number of the chosen candidate, or 0 for none' },
    relevant: { type: 'boolean' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reason: { type: 'string' },
    usable_connection: { type: 'string' },
  },
  required: ['candidate_number', 'relevant', 'confidence', 'reason', 'usable_connection'],
};

export const draftSchema = z.object({
  post: z.string().trim().min(200).max(4000),
  news_used: z.boolean(),
});
export const draftJsonSchema = {
  type: 'object',
  properties: {
    post: { type: 'string', description: 'The LinkedIn post text only, plain text' },
    news_used: { type: 'boolean', description: 'true only if the post references the supplied news item' },
  },
  required: ['post', 'news_used'],
};
