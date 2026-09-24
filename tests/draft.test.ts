// Draft post-processing, the figure check, the news-used safety net and the Telegram draft format.
import { describe, expect, it } from 'vitest';
import type { AiContext } from '@/lib/ai/context';
import { cleanPost, draftPost, postReferencesNews } from '@/lib/ai/draft-post';
import { extractFigures, findUnsupportedFigures } from '@/lib/ai/fact-check';
import type { GeminiRequest } from '@/lib/ai/gemini';
import { draftMessage, newsSourceBlock } from '@/lib/telegram/messages';
import { newsItem } from './helpers/fakes';

const NOTE = 'Batch fourteen came back. The pH dropped by about 0.4 units. The supplier sent a revised spec sheet three months ago.';
const LONG = ' The supplier changed the preservative blend without telling us, and the texture changed.'.repeat(3);

function ctxReturning(...posts: Array<{ post: string; news_used?: boolean }>) {
  const calls: GeminiRequest[] = [];
  const ctx: AiContext = {
    transport: async (request) => {
      calls.push(request);
      const next = posts.shift();
      if (!next) throw new Error('unexpected call');
      return JSON.stringify({ news_used: false, ...next });
    },
    models: { scoring: 'lite', transcription: 'lite', drafting: 'flash' },
    retry: { sleep: async () => {} },
  };
  return { ctx, calls };
}

describe('figure check', () => {
  it('extracts digits and number words', () => {
    expect(extractFigures('Batch fourteen, pH 5.5-5.8, 1,200 units, 23%')).toEqual(expect.arrayContaining(['14', '5.5', '5.8', '1200', '23']));
  });

  it('accepts figures from the note (including spelled-out ones) and flags invented ones', () => {
    expect(findUnsupportedFigures('Batch 14 dropped 0.4 units over 3 months.', [NOTE])).toEqual([]);
    expect(findUnsupportedFigures('Returns rose 38% and pH hit 3.2.', [NOTE])).toEqual(['38', '3.2']);
  });
});

describe('cleanPost', () => {
  it('removes preambles, markdown, hashtags and em dashes without changing the words', () => {
    const raw = "Here's your LinkedIn post:\n\n**Bold** claim — with an aside.\n\n## Heading\n5–6 months\n\n#skincare #founder";
    expect(cleanPost(raw)).toBe('Bold claim - with an aside.\n\nHeading\n5-6 months');
  });
});

describe('draftPost', () => {
  it('asks for a redraft when figures are not in the note, then accepts a clean draft', async () => {
    const { ctx, calls } = ctxReturning({ post: `Returns went up 38%.${LONG}` }, { post: `Returns went up.${LONG}` });
    const result = await draftPost(ctx, { note: NOTE, scoreReason: 'r', voiceSkill: 'voice', news: null });
    expect(calls).toHaveLength(2);
    expect((calls[1]!.parts[0] as { text: string }).text).toContain('38');
    expect(result.unsupportedFigures).toEqual([]);
    expect(calls[0]).toMatchObject({ model: 'flash', temperature: 0.7 });
  });

  it('returns remaining unsupported figures after the second attempt, for Meera to see', async () => {
    const { ctx } = ctxReturning({ post: `Up 38%.${LONG}` }, { post: `Up 38% again.${LONG}` });
    const result = await draftPost(ctx, { note: NOTE, scoreReason: 'r', voiceSkill: 'voice', news: null });
    expect(result.unsupportedFigures).toEqual(['38']);
  });

  it('never marks news as used when none was supplied, even if the model claims it', async () => {
    const { ctx } = ctxReturning({ post: `A clean post.${LONG}`, news_used: true });
    const result = await draftPost(ctx, { note: NOTE, scoreReason: 'r', voiceSkill: 'voice', news: null });
    expect(result.newsUsed).toBe(false);
  });

  it('shows the source block if the text visibly uses the news even when the flag says false', async () => {
    const item = newsItem();
    const { ctx } = ctxReturning({ post: `The Economic Times reports that a regulator tightens cosmetic batch testing rules.${LONG}`, news_used: false });
    const result = await draftPost(ctx, { note: NOTE, scoreReason: 'r', voiceSkill: 'voice', news: { item, confidence: 0.9, reason: 'r', usable_connection: 'c' } });
    expect(result.newsUsed).toBe(true);
  });

  it('allows figures that come from the supplied news metadata', async () => {
    const item = newsItem({ title: 'Regulator proposes 12 new cosmetic testing rules' });
    const { ctx } = ctxReturning({ post: `A report mentions 12 new rules.${LONG}`, news_used: true });
    const result = await draftPost(ctx, { note: NOTE, scoreReason: 'r', voiceSkill: 'voice', news: { item, confidence: 0.9, reason: 'r', usable_connection: 'c' } });
    expect(result.unsupportedFigures).toEqual([]);
  });
});

describe('postReferencesNews', () => {
  it('detects the publication name or most of the headline', () => {
    const item = newsItem();
    expect(postReferencesNews('as reported in the economic times', item)).toBe(true);
    expect(postReferencesNews('a regulator tightens cosmetic batch testing', item)).toBe(true);
    expect(postReferencesNews('a post about preservatives', item)).toBe(false);
  });
});

describe('Telegram draft message', () => {
  it('matches the required layout with the verification block before the review instruction', () => {
    const text = draftMessage({ score: 8, post: 'POST BODY', news: newsItem(), unsupportedFigures: [] });
    expect(text).toBe(
      [
        'Draft ready — score 8/10',
        'POST BODY',
        '─────────────────────────────────\nNEWS SOURCE: Regulator tightens cosmetic batch testing rules\nFROM: The Economic Times · 20 Sept 2026\nLINK: https://news.google.com/rss/articles/abc123\n⚠ Check this before publishing — you are the author of this claim\n─────────────────────────────────',
        '─────────────────\nReply to this message with APPROVE or REJECT.',
      ].join('\n\n'),
    );
  });

  it('never invents missing news metadata', () => {
    const block = newsSourceBlock(newsItem({ source: null, publishedAt: null }));
    expect(block).toContain('FROM: publication not provided · date not provided');
  });

  it('has no source block when news was not used', () => {
    expect(draftMessage({ score: 7, post: 'P', news: null, unsupportedFigures: [] })).not.toContain('NEWS SOURCE');
  });
});

describe('voice guards', () => {
  const VOICE = 'She deflates: "It is not a particularly inspiring story." and "If the answer is vague or doesn\'t arrive, that is also useful information."';

  it('finds wording copied from the Voice Skill quotes, but not wording from the note', async () => {
    const { findCopiedPhrases } = await import('@/lib/ai/draft-post');
    expect(findCopiedPhrases('Honestly, it is not a particularly inspiring story at all.', VOICE, 'a note')).toEqual(['it is not a particularly inspiring story']);
    expect(findCopiedPhrases('If nobody replies, that is also useful information.', VOICE, 'a note')).toEqual(['that is also useful information']);
    expect(findCopiedPhrases('It is not a particularly inspiring story.', VOICE, 'I know it is not a particularly inspiring story')).toEqual([]);
    expect(findCopiedPhrases('A completely original sentence about pH drift.', VOICE, 'n')).toEqual([]);
  });

  it('flags a long single-paragraph wall of text', async () => {
    const { isWallOfText } = await import('@/lib/ai/draft-post');
    expect(isWallOfText('word '.repeat(200))).toBe(true);
    expect(isWallOfText(`${'a '.repeat(150)}\n\n${'b '.repeat(150)}\n\n${'c '.repeat(150)}`)).toBe(false);
    expect(isWallOfText('short post')).toBe(false);
  });

  it('asks for a redraft when the first attempt copies examples or is one block', async () => {
    const wall = `It is not a particularly inspiring story. ${'The supplier changed the blend. '.repeat(30)}`;
    const good = `A clean opening.\n\n${'The supplier changed the blend. '.repeat(10)}\n\nA plain ending.`;
    const { ctx, calls } = ctxReturning({ post: wall }, { post: good });
    const result = await draftPost(ctx, { note: NOTE, scoreReason: 'r', voiceSkill: VOICE, news: null });
    const feedback = (calls[1]!.parts[0] as { text: string }).text;
    expect(feedback).toContain('copied wording from the Voice Skill examples');
    expect(feedback).toContain('one block of text');
    expect(result.post).toBe(good);
  });
});

describe('drafting model chain and warnings', () => {
  it('tries Flash-class drafting fallbacks before the lite fallback, and warns when a backup wrote it', async () => {
    const calls: string[] = [];
    const quota = Object.assign(new Error('{"error":{"code":429,"message":"quota. Please retry in 3600s"}}'), { status: 429 });
    const ctx: AiContext = {
      transport: async (req) => {
        calls.push(req.model);
        if (req.model === 'flash') throw quota;
        return JSON.stringify({ post: `Clean post.\n\n${LONG}\n\nEnd.`, news_used: false });
      },
      models: { scoring: 'lite', transcription: 'lite', drafting: 'flash', fallback: 'lite', draftingFallbacks: ['flash-2', 'lite'] },
      retry: { sleep: async () => {} },
    };
    const result = await draftPost(ctx, { note: NOTE, scoreReason: 'r', voiceSkill: 'v', news: null });
    expect(calls).toEqual(['flash', 'flash-2']);
    expect(result.model).toBe('flash-2');
    expect(result.warnings).toEqual(['Written by the backup model (flash-2); check the voice closely']);
  });

  it('shows remaining warnings in the Telegram draft', () => {
    const text = draftMessage({ score: 8, post: 'P', news: null, unsupportedFigures: [], warnings: ['One long paragraph: needs breaking up'] });
    expect(text).toContain('⚠ One long paragraph: needs breaking up');
    expect(text.indexOf('⚠ One long')).toBeLessThan(text.indexOf('Reply to this message'));
  });
});

describe('copy check ignores contraction differences', () => {
  it('catches "I do not have a medical degree" against the quote "I don\'t have a medical degree"', async () => {
    const { findCopiedPhrases } = await import('@/lib/ai/draft-post');
    const voice = 'She states limits ("I\'m not a dermatologist. I don\'t have a medical degree.").';
    expect(findCopiedPhrases('To be clear, I do not have a medical degree.', voice, 'note')).toEqual(['i do not have a medical degree']);
  });
});

describe('copy check against the real Voice Skill file', () => {
  it('catches the phrases observed being copied in live validation runs', async () => {
    const { readFileSync } = await import('node:fs');
    const { findCopiedPhrases } = await import('@/lib/ai/draft-post');
    const voice = readFileSync(`${__dirname}/../data/voice-skill.txt`, 'utf8');
    const copied = (text: string) => findCopiedPhrases(text, voice, 'an unrelated note about batch testing');
    expect(copied('If the explanation remains vague, that is also useful information.')).toEqual(['that is also useful information']);
    expect(copied('It is not a particularly inspiring story.')).toEqual(['it is not a particularly inspiring story']);
    expect(copied('I do not have a medical degree or a background in dermatology.')).toEqual(['i do not have a medical degree']);
    expect(copied('The vehicle, the base that carries the actives, matters.')).toEqual(['the vehicle the base that carries the actives']);
    expect(copied('The supplier changed the preservative blend without telling us.')).toEqual([]);
  });
});
