// In-memory Repository with the same guarantees as the SQL schema that matter to the pipeline:
// unique update ids, one draft per note, and pending-only (conditional) review updates.
import { randomUUID } from 'node:crypto';
import type { DraftRow, NewDraft, NewNote, NotePatch, NoteRow, Repository, ReviewDecision, UpdateKind, VoiceSkillRow } from '@/lib/types';

export interface MemoryRepo extends Repository {
  updates: Map<number, UpdateKind>;
  notes: NoteRow[];
  drafts: DraftRow[];
  voiceSkill: VoiceSkillRow | null;
  failNext: Partial<Record<keyof Repository, Error>>;
}

export function createMemoryRepo(): MemoryRepo {
  const now = () => new Date().toISOString();
  const repo: MemoryRepo = {
    updates: new Map(),
    notes: [],
    drafts: [],
    voiceSkill: null,
    failNext: {},

    async claimUpdate(updateId, _chatId, kind) {
      maybeFail('claimUpdate');
      if (repo.updates.has(updateId)) return false;
      repo.updates.set(updateId, kind);
      return true;
    },
    async createNote(note: NewNote) {
      maybeFail('createNote');
      if (repo.notes.some((n) => n.telegram_update_id === note.telegram_update_id)) throw new Error('duplicate key notes_telegram_update_id');
      const row: NoteRow = {
        id: randomUUID(),
        transcription: null,
        score_insight: null,
        score_specificity: null,
        score_relevance: null,
        score_evidence: null,
        score_completeness: null,
        total_score: null,
        score_decision: null,
        score_reason: null,
        keywords: null,
        search_query: null,
        error_message: null,
        created_at: now(),
        updated_at: now(),
        ...note,
      };
      repo.notes.push(row);
      return { ...row };
    },
    async updateNote(id, patch: NotePatch) {
      maybeFail('updateNote');
      const row = repo.notes.find((n) => n.id === id);
      if (!row) throw new Error('note not found');
      Object.assign(row, patch, { updated_at: now() });
    },
    async createDraft(draft: NewDraft) {
      maybeFail('createDraft');
      if (repo.drafts.some((d) => d.note_id === draft.note_id)) throw new Error('duplicate key drafts_note_id');
      const row: DraftRow = { id: randomUUID(), status: 'pending', telegram_draft_message_id: null, approval_message_id: null, reviewed_at: null, created_at: now(), updated_at: now(), ...draft };
      repo.drafts.push(row);
      return { ...row };
    },
    async setDraftMessageId(draftId, messageId) {
      const row = repo.drafts.find((d) => d.id === draftId);
      if (row) row.telegram_draft_message_id = messageId;
    },
    async findDraftByMessage(chatId, messageId) {
      const row = repo.drafts.find((d) => d.telegram_chat_id === chatId && d.telegram_draft_message_id === messageId);
      return row ? { ...row } : null;
    },
    async listPendingDrafts(chatId) {
      maybeFail('listPendingDrafts');
      return repo.drafts.filter((d) => d.telegram_chat_id === chatId && d.status === 'pending').map((d) => ({ ...d }));
    },
    async reviewDraft(draftId, decision: ReviewDecision, approvalMessageId) {
      const row = repo.drafts.find((d) => d.id === draftId && d.status === 'pending');
      if (!row) return null;
      Object.assign(row, { status: decision, reviewed_at: now(), approval_message_id: approvalMessageId, updated_at: now() });
      return { ...row };
    },
    async getDraft(draftId) {
      const row = repo.drafts.find((d) => d.id === draftId);
      return row ? { ...row } : null;
    },
    async getActiveVoiceSkill() {
      maybeFail('getActiveVoiceSkill');
      return repo.voiceSkill;
    },
  };

  function maybeFail(op: keyof Repository) {
    const error = repo.failNext[op];
    if (error) {
      delete repo.failNext[op];
      throw error;
    }
  }
  return repo;
}
