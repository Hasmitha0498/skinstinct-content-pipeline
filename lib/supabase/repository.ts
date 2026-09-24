// Supabase implementation of the Repository used by the pipeline.
// Writes are never blindly retried: every insert is protected by a unique key (update id, note id), and
// status changes are conditional (e.g. only pending -> approved), so repeating one is harmless or refused.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DraftRow, NewDraft, NewNote, NotePatch, NoteRow, Repository, ReviewDecision, UpdateKind, VoiceSkillRow } from '../types';

export class DatabaseError extends Error {
  constructor(operation: string, detail: string) {
    super(`Database ${operation} failed: ${detail}`);
    this.name = 'DatabaseError';
  }
}

interface PgResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

function unwrap<T>(operation: string, result: PgResult<T>): T {
  if (result.error) throw new DatabaseError(operation, `${result.error.code ?? ''} ${result.error.message}`.trim());
  if (result.data === null) throw new DatabaseError(operation, 'no data returned');
  return result.data;
}

export function createSupabaseRepository(db: SupabaseClient): Repository {
  return {
    async claimUpdate(updateId: number, chatId: number | null, kind: UpdateKind): Promise<boolean> {
      // INSERT ... ON CONFLICT (update_id) DO NOTHING RETURNING update_id: one row back = we claimed it.
      const rows = unwrap(
        'claimUpdate',
        await db
          .from('telegram_updates')
          .upsert({ update_id: updateId, chat_id: chatId, update_kind: kind }, { onConflict: 'update_id', ignoreDuplicates: true })
          .select('update_id'),
      );
      return rows.length === 1;
    },

    async createNote(note: NewNote): Promise<NoteRow> {
      return unwrap('createNote', await db.from('notes').insert(note).select('*').single<NoteRow>());
    },

    async updateNote(id: string, patch: NotePatch): Promise<void> {
      const { error } = await db.from('notes').update(patch).eq('id', id);
      if (error) throw new DatabaseError('updateNote', error.message);
    },

    async createDraft(draft: NewDraft): Promise<DraftRow> {
      return unwrap('createDraft', await db.from('drafts').insert({ ...draft, status: 'pending' }).select('*').single<DraftRow>());
    },

    async setDraftMessageId(draftId: string, messageId: number): Promise<void> {
      const { error } = await db.from('drafts').update({ telegram_draft_message_id: messageId }).eq('id', draftId);
      if (error) throw new DatabaseError('setDraftMessageId', error.message);
    },

    async findDraftByMessage(chatId: number, messageId: number): Promise<DraftRow | null> {
      const result = await db
        .from('drafts')
        .select('*')
        .eq('telegram_chat_id', chatId)
        .eq('telegram_draft_message_id', messageId)
        .maybeSingle<DraftRow>();
      if (result.error) throw new DatabaseError('findDraftByMessage', result.error.message);
      return result.data;
    },

    async listPendingDrafts(chatId: number): Promise<DraftRow[]> {
      return unwrap(
        'listPendingDrafts',
        await db.from('drafts').select('*').eq('telegram_chat_id', chatId).eq('status', 'pending').order('created_at', { ascending: false }),
      ) as DraftRow[];
    },

    async reviewDraft(draftId: string, decision: ReviewDecision, approvalMessageId: number): Promise<DraftRow | null> {
      // Conditional update: only a pending draft changes. A second APPROVE finds nothing to update.
      const result = await db
        .from('drafts')
        .update({ status: decision, reviewed_at: new Date().toISOString(), approval_message_id: approvalMessageId })
        .eq('id', draftId)
        .eq('status', 'pending')
        .select('*')
        .maybeSingle<DraftRow>();
      if (result.error) throw new DatabaseError('reviewDraft', result.error.message);
      return result.data;
    },

    async getDraft(draftId: string): Promise<DraftRow | null> {
      const result = await db.from('drafts').select('*').eq('id', draftId).maybeSingle<DraftRow>();
      if (result.error) throw new DatabaseError('getDraft', result.error.message);
      return result.data;
    },

    async getActiveVoiceSkill(): Promise<VoiceSkillRow | null> {
      const result = await db.from('voice_skills').select('*').eq('is_active', true).maybeSingle<VoiceSkillRow>();
      if (result.error) throw new DatabaseError('getActiveVoiceSkill', result.error.message);
      return result.data;
    },
  };
}
