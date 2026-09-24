// The note pipeline: capture -> (transcribe) -> score -> [reject | research -> draft] -> store -> Telegram.
// It ends at a PENDING draft. Nothing here, or anywhere in this codebase, publishes to LinkedIn.
import { PUBLISHABILITY_THRESHOLD } from '../config';
import { describeError, log } from '../log';
import { recentItems } from '../news/google-news';
import { MAX_VOICE_BYTES, TelegramError } from '../telegram/client';
import { draftMessage, MSG, rejectionMessage } from '../telegram/messages';
import type { NewsDecision, NoteRow, NoteScore } from '../types';
import { VoiceSkillUnavailableError } from '../voice-skill';
import type { PipelineDeps } from './deps';

export type IncomingNote =
  | { kind: 'text_note'; updateId: number; chatId: number; messageId: number; text: string }
  | { kind: 'voice_note'; updateId: number; chatId: number; messageId: number; fileId: string; mimeType?: string; fileSize?: number };

const MAX_NEWS_CANDIDATES = 5;

export async function processNote(deps: PipelineDeps, input: IncomingNote): Promise<void> {
  const { repo } = deps;
  let note: NoteRow;
  try {
    note = await repo.createNote({
      telegram_update_id: input.updateId,
      telegram_chat_id: input.chatId,
      telegram_message_id: input.messageId,
      input_type: input.kind === 'text_note' ? 'text' : 'voice',
      raw_text: input.kind === 'text_note' ? input.text : null,
      telegram_file_id: input.kind === 'voice_note' ? input.fileId : null,
      processing_status: 'received',
    });
  } catch (error) {
    log.error('note.store_failed', { updateId: input.updateId, stage: 'received', error: describeError(error) });
    await notify(deps, input.chatId, MSG.storageFailed, input.messageId);
    return;
  }

  const fields = { updateId: input.updateId, noteId: note.id };
  const fail = async (stage: string, error: unknown, userMessage: string) => {
    log.error('note.failed', { ...fields, stage, error: describeError(error) });
    await safeUpdate(deps, note.id, { processing_status: 'failed', error_message: `${stage}: ${describeError(error)}` });
    await notify(deps, input.chatId, userMessage, input.messageId);
  };

  // 1. Text: use as-is. Voice: download + transcribe. A failed transcription never produces text.
  let content: string;
  if (input.kind === 'text_note') {
    content = input.text;
  } else {
    await safeUpdate(deps, note.id, { processing_status: 'transcribing' });
    if (input.fileSize && input.fileSize > MAX_VOICE_BYTES) return fail('transcribing', new Error('voice note over 20 MB'), MSG.voiceTooLarge);
    try {
      const audio = await deps.telegram.downloadFile(input.fileId);
      content = await deps.ai.transcribe(audio, input.mimeType, { ...fields, stage: 'transcribing' });
    } catch (error) {
      const message = error instanceof TelegramError && /20 MB/.test(error.message) ? MSG.voiceTooLarge : MSG.transcriptionFailed;
      return fail('transcribing', error, message);
    }
    if (!(await safeUpdate(deps, note.id, { transcription: content }))) {
      return fail('transcribing', new Error('could not store transcription'), MSG.storageFailed);
    }
    log.info('note.transcribed', { ...fields, chars: content.length });
  }

  // 2. Score before any research or drafting.
  await safeUpdate(deps, note.id, { processing_status: 'scoring' });
  let score: NoteScore;
  try {
    score = await deps.ai.score(content, { ...fields, stage: 'scoring' });
  } catch (error) {
    return fail('scoring', error, MSG.scoringFailed);
  }
  const developed = score.total_score >= PUBLISHABILITY_THRESHOLD;
  await safeUpdate(deps, note.id, {
    score_insight: score.insight,
    score_specificity: score.specificity,
    score_relevance: score.relevance,
    score_evidence: score.evidence,
    score_completeness: score.completeness,
    total_score: score.total_score,
    score_decision: score.decision,
    score_reason: score.reason,
    processing_status: developed ? 'researching' : 'rejected',
  });
  log.info('note.scored', { ...fields, total: score.total_score, decision: score.decision });

  // 3. Below the threshold: explain and stop. No news call, no drafting call.
  if (!developed) {
    await notify(deps, input.chatId, rejectionMessage(score), input.messageId);
    return;
  }

  // 4. Optional news angle. Any failure here just means "no news".
  const news = await findNewsAngle(deps, note.id, content, fields);

  // 5. Draft in Meera's voice.
  await safeUpdate(deps, note.id, { processing_status: 'drafting' });
  let voice;
  try {
    voice = await deps.loadVoiceSkill();
  } catch (error) {
    return fail('drafting', error, error instanceof VoiceSkillUnavailableError ? MSG.voiceSkillMissing : MSG.draftingFailed);
  }
  let draft;
  try {
    draft = await deps.ai.draft({ note: content, scoreReason: score.reason, voiceSkill: voice.content, news }, { ...fields, stage: 'drafting' });
  } catch (error) {
    return fail('drafting', error, MSG.draftingFailed);
  }
  const usedNews = draft.newsUsed && news ? news : null;

  // 6. Persist as PENDING before telling Meera, so the record exists even if Telegram is down.
  let stored;
  try {
    stored = await deps.repo.createDraft({
      note_id: note.id,
      telegram_chat_id: input.chatId,
      draft_text: draft.post,
      news_used: usedNews !== null,
      news_headline: usedNews?.item.title ?? null,
      news_source: usedNews?.item.source ?? null,
      news_published_at: usedNews?.item.publishedAt ?? null,
      news_url: usedNews?.item.link ?? null,
      news_summary: usedNews?.item.snippet ?? null,
      news_relevance_confidence: usedNews ? Math.round(usedNews.confidence * 100) / 100 : null,
      news_relevance_reason: usedNews?.reason ?? null,
      unsupported_figures: draft.unsupportedFigures,
      voice_skill_id: voice.id,
      drafting_model: draft.model,
      review_warnings: draft.warnings,
    });
  } catch (error) {
    return fail('drafting', error, MSG.storageFailed);
  }
  const draftFields = { ...fields, draftId: stored.id };
  log.info('draft.created', { ...draftFields, newsUsed: usedNews !== null, voiceSource: voice.source, unsupportedFigures: draft.unsupportedFigures.length });

  // 7. Send for review. The draft replies to the original note so it's clear which thought it came from.
  const text = draftMessage({ score: score.total_score, post: draft.post, news: usedNews?.item ?? null, unsupportedFigures: draft.unsupportedFigures, warnings: draft.warnings });
  try {
    const messageId = await deps.telegram.sendMessage(input.chatId, text, { replyToMessageId: input.messageId });
    await deps.repo.setDraftMessageId(stored.id, messageId);
    await safeUpdate(deps, note.id, { processing_status: 'completed' });
  } catch (error) {
    log.error('draft.delivery_failed', { ...draftFields, stage: 'delivering', error: describeError(error) });
    await safeUpdate(deps, note.id, { processing_status: 'completed', error_message: `delivery: ${describeError(error)}` });
  }
}

async function findNewsAngle(deps: PipelineDeps, noteId: string, content: string, fields: Record<string, string | number>): Promise<NewsDecision | null> {
  const f = { ...fields, stage: 'researching' };
  let query: string;
  try {
    const keywords = await deps.ai.keywords(content, f);
    query = keywords.search_query;
    await safeUpdate(deps, noteId, { keywords: keywords.keywords, search_query: query });
  } catch (error) {
    log.warn('news.keywords_failed', { ...f, error: describeError(error) });
    return null;
  }

  let result;
  try {
    result = await deps.searchNews(query);
  } catch (error) {
    log.warn('news.search_failed', { ...f, error: describeError(error) });
    return null;
  }
  if (!result.ok) {
    log.info('news.unavailable', { ...f, reason: result.reason });
    return null;
  }
  const candidates = recentItems(result.items, deps.settings.newsMaxAgeDays, deps.now?.() ?? new Date()).slice(0, MAX_NEWS_CANDIDATES);
  if (candidates.length === 0) {
    log.info('news.none_recent', { ...f, retrieved: result.items.length });
    return null;
  }

  try {
    const evaluation = await deps.ai.evaluateNews(content, candidates, deps.settings.newsRelevanceThreshold, f);
    if (!evaluation.decision) {
      log.info('news.not_used', { ...f, candidates: candidates.length, why: evaluation.rejectedBecause ?? '' });
      return null;
    }
    log.info('news.selected', { ...f, confidence: evaluation.decision.confidence });
    return evaluation.decision;
  } catch (error) {
    log.warn('news.relevance_failed', { ...f, error: describeError(error) });
    return null;
  }
}

/** Status updates must never crash the pipeline; a failure is logged and reported to the caller. */
async function safeUpdate(deps: PipelineDeps, noteId: string, patch: Parameters<PipelineDeps['repo']['updateNote']>[1]): Promise<boolean> {
  try {
    await deps.repo.updateNote(noteId, patch);
    return true;
  } catch (error) {
    log.error('note.update_failed', { noteId, error: describeError(error) });
    return false;
  }
}

export async function notify(deps: PipelineDeps, chatId: number, text: string, replyToMessageId?: number): Promise<void> {
  try {
    await deps.telegram.sendMessage(chatId, text, { replyToMessageId });
  } catch (error) {
    log.error('telegram.send_failed', { chatId, error: describeError(error) });
  }
}
