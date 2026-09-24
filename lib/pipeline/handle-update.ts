// Entry point shared by the webhook, the local polling runner and the tests.
// receiveUpdate() does the fast part inside the HTTP request: parse and atomically claim the update id.
// The returned `work` does the slow part (Gemini, RSS) after Telegram has already had its 200 response.
import { describeError, log } from '../log';
import { MSG } from '../telegram/messages';
import { parseUpdate, type ParsedUpdate } from '../telegram/update';
import type { PipelineDeps } from './deps';
import { notify, processNote } from './process-note';
import { handleReview } from './review';

export interface Receipt {
  status: 'accepted' | 'duplicate' | 'invalid' | 'unavailable';
  httpStatus: number;
  work: (() => Promise<void>) | null;
}

export async function receiveUpdate(deps: PipelineDeps, body: unknown): Promise<Receipt> {
  const parsed = parseUpdate(body);
  if (!parsed) {
    log.warn('update.invalid_body');
    return { status: 'invalid', httpStatus: 400, work: null };
  }
  const fields = { updateId: parsed.updateId, kind: parsed.kind };

  let claimed: boolean;
  try {
    claimed = await deps.repo.claimUpdate(parsed.updateId, parsed.chatId, parsed.kind);
  } catch (error) {
    // Nothing has been processed yet, so asking Telegram to retry later is safe and loses nothing.
    log.error('update.claim_failed', { ...fields, error: describeError(error) });
    return { status: 'unavailable', httpStatus: 503, work: null };
  }
  if (!claimed) {
    log.info('update.duplicate_ignored', fields);
    return { status: 'duplicate', httpStatus: 200, work: null };
  }
  log.info('update.accepted', fields);
  return { status: 'accepted', httpStatus: 200, work: () => dispatch(deps, parsed) };
}

export async function dispatch(deps: PipelineDeps, update: ParsedUpdate): Promise<void> {
  try {
    if (update.kind === 'ignored') {
      log.info('update.ignored', { updateId: update.updateId, why: update.why });
      return;
    }
    const allowed = deps.settings.allowedChatIds;
    if (allowed && !allowed.has(update.chatId)) {
      log.warn('update.chat_not_allowed', { updateId: update.updateId, chatId: update.chatId });
      return notify(deps, update.chatId, MSG.notAllowed);
    }
    if (!allowed) log.info('update.chat_seen', { updateId: update.updateId, chatId: update.chatId }); // helps set TELEGRAM_ALLOWED_CHAT_IDS

    switch (update.kind) {
      case 'text_note':
      case 'voice_note':
        return await processNote(deps, update);
      case 'review_command':
        return await handleReview(deps, update);
      case 'bot_command':
        return notify(deps, update.chatId, MSG.help, update.messageId);
      case 'unsupported':
        return notify(deps, update.chatId, MSG.unsupported, update.messageId);
    }
  } catch (error) {
    // Last line of defence: log, never rethrow into the runtime.
    log.error('update.unhandled_error', { updateId: update.updateId, error: describeError(error) });
  }
}
