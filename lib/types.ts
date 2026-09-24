// Domain types shared across the pipeline. Database rows use the same snake_case names as the SQL.

export type InputType = 'text' | 'voice';
export type ProcessingStatus =
  | 'received'
  | 'transcribing'
  | 'scoring'
  | 'rejected'
  | 'researching'
  | 'drafting'
  | 'completed'
  | 'failed';
export type DraftStatus = 'pending' | 'approved' | 'rejected';
export type ReviewDecision = 'approved' | 'rejected';
export type UpdateKind = 'text_note' | 'voice_note' | 'review_command' | 'bot_command' | 'unsupported' | 'ignored';

export interface NoteRow {
  id: string;
  telegram_update_id: number;
  telegram_chat_id: number;
  telegram_message_id: number;
  input_type: InputType;
  raw_text: string | null;
  telegram_file_id: string | null;
  transcription: string | null;
  score_insight: number | null;
  score_specificity: number | null;
  score_relevance: number | null;
  score_evidence: number | null;
  score_completeness: number | null;
  total_score: number | null;
  score_decision: 'develop' | 'reject' | null;
  score_reason: string | null;
  keywords: string[] | null;
  search_query: string | null;
  processing_status: ProcessingStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface DraftRow {
  id: string;
  note_id: string;
  telegram_chat_id: number;
  telegram_draft_message_id: number | null;
  draft_text: string;
  status: DraftStatus;
  news_used: boolean;
  news_headline: string | null;
  news_source: string | null;
  news_published_at: string | null;
  news_url: string | null;
  news_summary: string | null;
  news_relevance_confidence: number | null;
  news_relevance_reason: string | null;
  unsupported_figures: string[];
  voice_skill_id: string | null;
  drafting_model: string | null;
  review_warnings: string[];
  approval_message_id: number | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VoiceSkillRow {
  id: string;
  name: string;
  version: number;
  content: string;
  is_active: boolean;
  source_description: string;
  created_at: string;
}

/** The five rubric dimensions plus the server-computed total. */
export interface NoteScore {
  insight: number;
  specificity: number;
  relevance: number;
  evidence: number;
  completeness: number;
  total_score: number;
  decision: 'develop' | 'reject';
  reason: string;
  improvement_hint: string;
}

export interface KeywordResult {
  keywords: string[];
  search_query: string;
}

/** Only what Google News RSS actually returned. Missing fields stay null, never guessed. */
export interface NewsItem {
  title: string;
  source: string | null;
  publishedAt: string | null; // ISO timestamp
  link: string;
  snippet: string | null;
}

export interface NewsDecision {
  item: NewsItem;
  confidence: number;
  reason: string;
  usable_connection: string;
}

export interface DraftResult {
  post: string;
  newsUsed: boolean;
  unsupportedFigures: string[];
  model: string; // the Gemini model that actually wrote it (primary or fallback)
  warnings: string[]; // voice/format issues the redraft did not fix, shown to Meera
}

export interface ActiveVoiceSkill {
  content: string;
  source: 'database' | 'file';
  id: string | null;
  version: number | null;
}

export type NewNote = Pick<
  NoteRow,
  'telegram_update_id' | 'telegram_chat_id' | 'telegram_message_id' | 'input_type' | 'raw_text' | 'telegram_file_id' | 'processing_status'
>;

export type NotePatch = Partial<Omit<NoteRow, 'id' | 'telegram_update_id' | 'created_at' | 'updated_at'>>;

export type NewDraft = Pick<
  DraftRow,
  | 'note_id'
  | 'telegram_chat_id'
  | 'draft_text'
  | 'news_used'
  | 'news_headline'
  | 'news_source'
  | 'news_published_at'
  | 'news_url'
  | 'news_summary'
  | 'news_relevance_confidence'
  | 'news_relevance_reason'
  | 'unsupported_figures'
  | 'voice_skill_id'
  | 'drafting_model'
  | 'review_warnings'
>;

/** Persistence used by the pipeline. Implemented by Supabase in production and in memory in tests. */
export interface Repository {
  /** Atomically records an update id. Returns false if it was already claimed (a Telegram retry). */
  claimUpdate(updateId: number, chatId: number | null, kind: UpdateKind): Promise<boolean>;
  createNote(note: NewNote): Promise<NoteRow>;
  updateNote(id: string, patch: NotePatch): Promise<void>;
  createDraft(draft: NewDraft): Promise<DraftRow>;
  setDraftMessageId(draftId: string, messageId: number): Promise<void>;
  findDraftByMessage(chatId: number, messageId: number): Promise<DraftRow | null>;
  listPendingDrafts(chatId: number): Promise<DraftRow[]>;
  /** Moves a draft from pending to the decision. Returns null if it was not pending (already reviewed). */
  reviewDraft(draftId: string, decision: ReviewDecision, approvalMessageId: number): Promise<DraftRow | null>;
  getDraft(draftId: string): Promise<DraftRow | null>;
  getActiveVoiceSkill(): Promise<VoiceSkillRow | null>;
}
