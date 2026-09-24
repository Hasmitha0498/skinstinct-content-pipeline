// Everything the pipeline talks to, bundled so tests can swap in fakes for Gemini, Telegram, RSS and the DB.
import type { PipelineSettings } from '../config';
import type { AiContext } from '../ai/context';
import { draftPost, type DraftInput } from '../ai/draft-post';
import { evaluateNews, type NewsEvaluation } from '../ai/evaluate-news';
import { extractKeywords } from '../ai/extract-keywords';
import { scoreNote } from '../ai/score-note';
import { transcribeAudio } from '../ai/transcribe';
import type { NewsSearchResult } from '../news/google-news';
import type { TelegramApi } from '../telegram/client';
import type { ActiveVoiceSkill, DraftResult, KeywordResult, NewsItem, NoteScore, Repository } from '../types';

type LogFields = Record<string, string | number>;

export interface AiService {
  transcribe(audio: Uint8Array, mimeType: string | undefined, logFields?: LogFields): Promise<string>;
  score(note: string, logFields?: LogFields): Promise<NoteScore>;
  keywords(note: string, logFields?: LogFields): Promise<KeywordResult>;
  evaluateNews(note: string, candidates: NewsItem[], threshold: number, logFields?: LogFields): Promise<NewsEvaluation>;
  draft(input: DraftInput, logFields?: LogFields): Promise<DraftResult>;
}

export function createAiService(ctx: AiContext): AiService {
  return {
    transcribe: (audio, mime, f) => transcribeAudio(ctx, audio, mime, f),
    score: (note, f) => scoreNote(ctx, note, f),
    keywords: (note, f) => extractKeywords(ctx, note, f),
    evaluateNews: (note, candidates, threshold, f) => evaluateNews(ctx, note, candidates, threshold, f),
    draft: (input, f) => draftPost(ctx, input, f),
  };
}

export interface PipelineDeps {
  repo: Repository;
  telegram: TelegramApi;
  ai: AiService;
  searchNews: (query: string) => Promise<NewsSearchResult>;
  loadVoiceSkill: () => Promise<ActiveVoiceSkill>;
  settings: PipelineSettings;
  now?: () => Date;
}
