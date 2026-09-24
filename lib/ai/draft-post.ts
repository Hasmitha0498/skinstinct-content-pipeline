// Draft generation in Meera's voice, followed by mechanical checks. Draft text is cleaned, never rewritten.
import type { DraftResult, NewsDecision, NewsItem } from '../types';
import { draftJsonSchema, draftSchema } from '../validation/schemas';
import { generateJsonWithModel } from './gemini';
import { draftingChain, type AiContext } from './context';
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

/** Her own recurring frames (e.g. "I want to explain" appears in 3 of 15 pieces): reusing them isn't pastiche. */
const HABITUAL_FRAMES = ['I want to explain why'];

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

/** Lower-cased words with contractions expanded, so "don't" and "do not" compare equal. */
function words(text: string): string[] {
  const expanded = text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\bcan't\b/g, 'can not')
    .replace(/\bwon't\b/g, 'will not')
    .replace(/n't\b/g, ' not')
    .replace(/'m\b/g, ' am')
    .replace(/'re\b/g, ' are')
    .replace(/'ve\b/g, ' have')
    .replace(/'ll\b/g, ' will')
    .replace(/\b(it|that|there|here|what|she|he)'s\b/g, '$1 is');
  return expanded.match(/[\p{L}\p{N}']+/gu) ?? [];
}

/**
 * Runs of `n`+ words the draft copies from the Voice Skill's quoted examples (text in double quotes).
 * Those quotes illustrate Meera's patterns; reproducing them makes a draft read as a collage of old posts.
 * Wording that also appears in the note itself is allowed.
 */
export function findCopiedPhrases(post: string, voiceSkill: string, note: string, n = 5): string[] {
  // Match every quote pair first, then drop short ones: filtering inside the regex would mis-pair quotes.
  const quotes = [...voiceSkill.matchAll(/"([^"]*)"/g)].map((m) => m[1]!).filter((q) => q.length >= 12);
  const grams = (tokens: string[]) => new Set(tokens.slice(0, Math.max(0, tokens.length - n + 1)).map((_, i) => tokens.slice(i, i + n).join(' ')));
  const reference = new Set(quotes.flatMap((q) => [...grams(words(q))]));
  const allowed = new Set([...grams(words(note)), ...HABITUAL_FRAMES.flatMap((f) => [...grams(words(f))])]);
  const tokens = words(post);
  const covered = new Array<boolean>(tokens.length).fill(false);
  for (let i = 0; i + n <= tokens.length; i++) {
    const gram = tokens.slice(i, i + n).join(' ');
    if (reference.has(gram) && !allowed.has(gram)) for (let k = i; k < i + n; k++) covered[k] = true;
  }
  const phrases: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!covered[i]) continue;
    let j = i;
    while (j + 1 < tokens.length && covered[j + 1]) j++;
    phrases.push(tokens.slice(i, j + 1).join(' '));
    i = j;
  }
  return phrases;
}

/** Absolute words Meera almost never uses (6 in ~7,000 published words). A draft must not add them. */
const ABSOLUTES = ['entirely', 'completely', 'totally', 'perfectly', 'absolutely', 'always', 'never', 'guaranteed', 'guarantee', 'guarantees', 'proven', 'definitely', 'certainly', 'undoubtedly', 'impossible', 'impermeable'];
const stem = (w: string) => w.toLowerCase().replace(/ly$/, '');

/**
 * Absolute wording in the draft that the note doesn't use ("isn't unsafe" becoming "entirely safe").
 * Returns each occurrence with the following word for context.
 */
export function findCertaintyUpgrades(post: string, note: string): string[] {
  const noteStems = new Set(words(note).map(stem));
  const found = new Set<string>();
  const pattern = new RegExp(`\\b(${ABSOLUTES.join('|')})\\b(\\s+[\\p{L}-]+)?`, 'giu');
  for (const m of post.matchAll(pattern)) {
    if (!noteStems.has(stem(m[1]!))) found.add(m[0]!.toLowerCase().trim());
  }
  return [...found];
}

/** Meera never writes a wall of text: a long post must be broken into paragraphs. */
export function isWallOfText(post: string): boolean {
  return post.length > 700 && post.split(/\n\s*\n/).length < 3;
}

function newsSourceText(item: NewsItem): string[] {
  return [item.title, item.source ?? '', item.snippet ?? '', item.publishedAt ? item.publishedAt.slice(0, 10) : ''];
}

export async function draftPost(ctx: AiContext, input: DraftInput, logFields?: Record<string, string | number>): Promise<DraftResult> {
  const sources = [input.note, ...(input.news ? newsSourceText(input.news.item) : [])];
  let revisionNotes: string[] = [];
  let last: DraftResult | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const { data: raw, model } = await generateJsonWithModel(
      ctx.transport,
      {
        label: 'draft_post',
        models: draftingChain(ctx),
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

    const problems: string[] = [];
    if (unsupportedFigures.length) {
      problems.push(`It contained figures that appear in neither the note nor the news metadata: ${unsupportedFigures.join(', ')}. Remove them; do not substitute other figures.`);
    }
    if (post.length > LINKEDIN_MAX_CHARS - 100) problems.push(`It was ${post.length} characters; keep it under 2,900.`);
    const copied = findCopiedPhrases(post, input.voiceSkill, input.note);
    if (copied.length) {
      problems.push(`It copied wording from the Voice Skill examples: "${copied.join('"; "')}". Say it in new words, or leave the move out.`);
    }
    const upgrades = findCertaintyUpgrades(post, input.note);
    if (upgrades.length) {
      problems.push(`It used more absolute wording than the note: "${upgrades.join('"; "')}". Keep the note's own level of certainty and its hedges.`);
    }
    if (isWallOfText(post)) problems.push('It was one block of text. Break it into 6 to 10 short paragraphs separated by blank lines.');

    // Plain-language notes for Meera about anything the redraft didn't fix (figures are listed separately).
    const warnings = [
      ...(copied.length ? [`Wording copied from your past posts: "${copied.join('"; "')}"`] : []),
      ...(upgrades.length ? [`Stronger wording than your note: "${upgrades.join('"; "')}"`] : []),
      ...(isWallOfText(post) ? ['One long paragraph: needs breaking up'] : []),
      ...(model !== ctx.models.drafting ? [`Written by the backup model (${model}); check the voice closely`] : []),
    ];
    last = { post, newsUsed, unsupportedFigures, model, warnings };
    if (problems.length === 0) return last;
    revisionNotes = problems;
  }
  // The second attempt still has issues: return it anyway, with warnings Meera will see in Telegram.
  return last as DraftResult;
}
