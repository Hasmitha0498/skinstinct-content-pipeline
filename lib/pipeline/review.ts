// APPROVE / REJECT. The only effect is a status change in Supabase plus a confirmation message.
// Approval does not publish, schedule or modify anything: publishing is Meera's manual step.
import { describeError, log } from '../log';
import { alreadyReviewed, MSG } from '../telegram/messages';
import type { ReviewCommand } from '../telegram/update';
import type { DraftRow, ReviewDecision } from '../types';
import type { PipelineDeps } from './deps';
import { notify } from './process-note';

export interface ReviewInput {
  updateId: number;
  chatId: number;
  messageId: number;
  command: ReviewCommand;
  replyToMessageId: number | null;
}

export async function handleReview(deps: PipelineDeps, input: ReviewInput): Promise<void> {
  const decision: ReviewDecision = input.command === 'APPROVE' ? 'approved' : 'rejected';
  const fields = { updateId: input.updateId, stage: 'review', decision };
  try {
    let target: DraftRow | null;
    if (input.replyToMessageId !== null) {
      // Explicit target: the draft message she replied to. Never fall back to guessing.
      target = await deps.repo.findDraftByMessage(input.chatId, input.replyToMessageId);
      if (!target) return notify(deps, input.chatId, MSG.replyNotADraft, input.messageId);
    } else {
      const pending = await deps.repo.listPendingDrafts(input.chatId);
      if (pending.length === 0) return notify(deps, input.chatId, MSG.noPendingDraft, input.messageId);
      if (pending.length > 1) return notify(deps, input.chatId, MSG.multiplePending, input.messageId);
      target = pending[0]!;
    }

    if (target.status !== 'pending') return notify(deps, input.chatId, alreadyReviewed(target.status), input.messageId);

    const updated = await deps.repo.reviewDraft(target.id, decision, input.messageId);
    if (!updated) {
      // Lost a race with another APPROVE/REJECT for the same draft: report whatever won.
      const current = await deps.repo.getDraft(target.id);
      return notify(deps, input.chatId, current ? alreadyReviewed(current.status) : MSG.noPendingDraft, input.messageId);
    }
    log.info('draft.reviewed', { ...fields, draftId: updated.id });
    await notify(deps, input.chatId, decision === 'approved' ? MSG.approved : MSG.rejected, updated.telegram_draft_message_id ?? input.messageId);
  } catch (error) {
    log.error('draft.review_failed', { ...fields, error: describeError(error) });
    await notify(deps, input.chatId, MSG.reviewFailed, input.messageId);
  }
}
