// Draft generation in Meera's voice, followed by mechanical checks. Draft text is cleaned, never rewritten.
import type { DraftResult, NewsDecision, NewsItem } from '../types';
import { draftJsonSchema, draftSchema } from '../validation/schemas';
import { generateJson } from './gemini';
import { modelChain, type AiContext } from './context';
import { findUnsupportedFigures } from './fact-check';
import { draftSystem, draftUser } from './prompts';

export const LINKEDIN_MAX_CHARS = 3000;

export interface DraftInput {
  note: string;
  scoreReason: string;
  voiceSkill: string;
  news: NewsDecision | null;
}

/** Removes formatting Meera never uses and preambles the model sometimes adds. Wording is untouched. */
export function cleanPost(post: string): string {
  return post
    .replace(/\r\n/g, '\n')
    .replace(/^\s*(here(?:'s| is) (?:your|the|a) (?:draft|linkedin post|post)[^\n]*:?)\s*\n+/i, '')
    .replace(/\*\*|__/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\s*—\s*/g, ' - ') // she uses spaced hyphens, never em dashes
    .replace(/(\d)\s*–\s*(\d)/g, '$1-$2')
    .replace(/\s*–\s*/g, ' - ')
    .replace(/^(?:\s*#[\p{L}\p{N}_]+)+\s*$/gmu, '') // hashtag-only lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const STOPWORDS = new Set(['about', 'after', 'their', 'there', 'these', 'those', 'which', 'while', 'where', 'would', 'could', 'should', 'being', 'other', 'under', 'still', 'says', 'india', 'indian']);

/** Safety net for the mandatory source block: if the post visibly leans on the news item, treat it as used. */
export function postReferencesNews(post: string, item: NewsItem): boolean {
  const text = post.toLowerCase();
  if (item.source && item.source.length >= 3 && text.includes(item.source.toLowerCase())) return true;
  const tokens = [...new Set(item.title.toLowerCase().match(/[\p{L}\p{N}]{5,}/gu) ?? [])].filter((t) => !STOPWORDS.has(t));
  if (tokens.length < 3) return false;
  const hits = tokens.filter((t) => text.includes(t)).length;
  return hits / tokens.length >= 0.6;
}

function newsSourceText(item: NewsItem): string[] {
  return [item.title, item.source ?? '', item.snippet ?? '', item.publishedAt ? item.publishedAt.slice(0, 10) : ''];
}

export async function draftPost(ctx: AiContext, input: DraftInput, logFields?: Record<string, string | number>): Promise<DraftResult> {
  const sources = [input.note, ...(input.news ? newsSourceText(input.news.item) : [])];
  let revisionNotes: string[] = [];
  let last: DraftResult | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await generateJson(
      ctx.transport,
      {
        label: 'draft_post',
        models: modelChain(ctx.models.drafting, ctx),
        system: draftSystem(input.voiceSkill),
        parts: [
          {
            text: draftUser({
              note: input.note,
              scoreReason: input.scoreReason,
              news: input.news?.item ?? null,
              newsConnection: input.news?.usable_connection ?? null,
              revisionNotes,
            }),
          },
        ],
        jsonSchema: draftJsonSchema,
        schema: draftSchema,
        temperature: 0.7,
        logFields: { ...logFields, attempt },
      },
      ctx.retry,
    );

    const post = cleanPost(raw.post);
    const unsupportedFigures = findUnsupportedFigures(post, sources);
    // News can only count as used if we supplied it; if the text visibly uses it, show the block regardless of the flag.
    const newsUsed = input.news ? raw.news_used || postReferencesNews(post, input.news.item) : false;
    last = { post, newsUsed, unsupportedFigures };

    const problems: string[] = [];
    if (unsupportedFigures.length) {
      problems.push(`It contained figures that appear in neither the note nor the news metadata: ${unsupportedFigures.join(', ')}. Remove them; do not substitute other figures.`);
    }
    if (post.length > LINKEDIN_MAX_CHARS - 100) problems.push(`It was ${post.length} characters; keep it under 2,900.`);
    if (problems.length === 0) return last;
    revisionNotes = problems;
  }
  // Second attempt still has issues: return it anyway. Unsupported figures are shown to Meera as a warning.
  return last as DraftResult;
}
