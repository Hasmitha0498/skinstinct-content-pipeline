// Fakes for Telegram, Gemini-backed AI steps and Google News, with call recording.
import { vi } from 'vitest';
import type { PipelineSettings } from '@/lib/config';
import type { AiService, PipelineDeps } from '@/lib/pipeline/deps';
import type { NewsSearchResult } from '@/lib/news/google-news';
import type { TelegramApi } from '@/lib/telegram/client';
import type { NewsItem, NoteScore } from '@/lib/types';
import { createMemoryRepo, type MemoryRepo } from './memory-repo';

export const CHAT_ID = 5550001;
export const NOW = new Date('2026-09-24T10:00:00Z');

export interface SentMessage {
  chatId: number;
  text: string;
  replyTo?: number;
  messageId: number;
}

export function fakeTelegram(options: { audio?: Uint8Array; downloadError?: Error } = {}) {
  let nextId = 1000;
  const sent: SentMessage[] = [];
  const downloads: string[] = [];
  const api = {
    sent,
    downloads,
    sendMessage: vi.fn<TelegramApi['sendMessage']>(async (chatId, text, opts) => {
      const messageId = nextId++;
      sent.push({ chatId, text, replyTo: opts?.replyToMessageId, messageId });
      return messageId;
    }),
    downloadFile: vi.fn<TelegramApi['downloadFile']>(async (fileId) => {
      downloads.push(fileId);
      if (options.downloadError) throw options.downloadError;
      return options.audio ?? new Uint8Array([79, 103, 103, 83, 1, 2, 3]);
    }),
  };
  return api;
}

export function score(total: number, overrides: Partial<NoteScore> = {}): NoteScore {
  // Spread the total across the five 0-2 dimensions.
  const parts = [0, 0, 0, 0, 0].map((_, i) => Math.min(2, Math.max(0, total - 2 * i)));
  const [insight, specificity, relevance, evidence, completeness] = parts as [number, number, number, number, number];
  return {
    insight,
    specificity,
    relevance,
    evidence,
    completeness,
    total_score: total,
    decision: total >= 6 ? 'develop' : 'reject',
    reason: total >= 6 ? 'Specific, first-hand manufacturing insight.' : 'This is a reminder, not an insight.',
    improvement_hint: total >= 6 ? 'Keep the reorder angle.' : 'Add the observation behind it.',
    ...overrides,
  };
}

export const SAMPLE_POST =
  'A reorder is not always the same formula. Batch fourteen came back with a pH drift of about 0.4 units.\n\n' +
  'The supplier had changed the preservative blend and sent a revised spec sheet that got buried. ' +
  'The batch is not unsafe, but the texture is different enough that customers would notice. We are holding it.\n\n' +
  'If you are not checking the CoA against a baseline every batch, you will not catch this until the customer does.';

export function newsItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    title: 'Regulator tightens cosmetic batch testing rules',
    source: 'The Economic Times',
    publishedAt: '2026-09-20T06:30:00.000Z',
    link: 'https://news.google.com/rss/articles/abc123',
    snippet: null,
    ...overrides,
  };
}

export function fakeAi(overrides: Partial<Record<keyof AiService, unknown>> = {}) {
  const ai = {
    transcribe: vi.fn(async () => 'Okay so batch fourteen came back and the pH stability data looked off.'),
    score: vi.fn(async () => score(9)),
    keywords: vi.fn(async () => ({ keywords: ['preservative', 'batch testing', 'CoA'], search_query: 'cosmetic batch testing preservative' })),
    evaluateNews: vi.fn(async () => ({ decision: null, rejectedBecause: 'not relevant' })),
    draft: vi.fn(async () => ({ post: SAMPLE_POST, newsUsed: false, unsupportedFigures: [] as string[] })),
    ...overrides,
  };
  return ai as unknown as { [K in keyof AiService]: ReturnType<typeof vi.fn> & AiService[K] };
}

export const settings: PipelineSettings = {
  models: { scoring: 'test-lite', transcription: 'test-lite', drafting: 'test-flash', fallback: undefined },
  newsRelevanceThreshold: 0.7,
  newsMaxAgeDays: 30,
  allowedChatIds: null,
};

export function buildDeps(overrides: Partial<PipelineDeps> & { repo?: MemoryRepo } = {}) {
  const repo = overrides.repo ?? createMemoryRepo();
  const telegram = (overrides.telegram as ReturnType<typeof fakeTelegram>) ?? fakeTelegram();
  const ai = (overrides.ai as ReturnType<typeof fakeAi>) ?? fakeAi();
  const searchNews = overrides.searchNews ?? vi.fn(async (): Promise<NewsSearchResult> => ({ ok: true, items: [newsItem()] }));
  const deps: PipelineDeps = {
    repo,
    telegram,
    ai,
    searchNews,
    loadVoiceSkill: overrides.loadVoiceSkill ?? (async () => ({ content: 'VOICE SKILL CONTENT', source: 'database' as const, id: null, version: 1 })),
    settings: overrides.settings ?? settings,
    now: () => NOW,
  };
  return { deps, repo, telegram, ai, searchNews };
}

let updateSeq = 1;
export function textUpdate(text: string, extra: { replyTo?: number; chatId?: number; updateId?: number } = {}) {
  const updateId = extra.updateId ?? updateSeq++;
  return {
    update_id: updateId,
    message: {
      message_id: 10_000 + updateId,
      date: 1,
      chat: { id: extra.chatId ?? CHAT_ID, type: 'private' },
      from: { id: 42, is_bot: false, first_name: 'Meera' },
      text,
      ...(extra.replyTo ? { reply_to_message: { message_id: extra.replyTo, date: 1, chat: { id: CHAT_ID, type: 'private' } } } : {}),
    },
  };
}

export function voiceUpdate(extra: { fileSize?: number } = {}) {
  const updateId = updateSeq++;
  return {
    update_id: updateId,
    message: {
      message_id: 10_000 + updateId,
      date: 1,
      chat: { id: CHAT_ID, type: 'private' },
      from: { id: 42, is_bot: false, first_name: 'Meera' },
      voice: { file_id: 'VOICE_FILE_ID', file_unique_id: 'u1', duration: 42, mime_type: 'audio/ogg', file_size: extra.fileSize ?? 60_000 },
    },
  };
}
