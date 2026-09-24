// Applies the real migration to an in-memory Postgres (PGlite) and checks the database-level guarantees.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';

const SQL = readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '001_initial_schema.sql'), 'utf8');
const VOICE = readFileSync(path.join(__dirname, '..', 'data', 'voice-skill.txt'), 'utf8');

let db: PGlite;

async function insertNote(updateId: number) {
  const res = await db.query<{ id: string }>(
    `insert into notes (telegram_update_id, telegram_chat_id, telegram_message_id, input_type, raw_text) values ($1, 1, 1, 'text', 'a note') returning id`,
    [updateId],
  );
  return res.rows[0]!.id;
}

async function insertDraft(noteId: string) {
  const res = await db.query<{ id: string }>(`insert into drafts (note_id, telegram_chat_id, draft_text) values ($1, 1, 'draft body') returning id`, [noteId]);
  return res.rows[0]!.id;
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(SQL);
});

describe('migration 001', () => {
  it('claims each Telegram update exactly once (idempotency ledger)', async () => {
    const claim = (id: number) =>
      db.query(`insert into telegram_updates (update_id, chat_id, update_kind) values ($1, 1, 'text_note') on conflict (update_id) do nothing returning update_id`, [id]);
    expect((await claim(100)).rows).toHaveLength(1);
    expect((await claim(100)).rows).toHaveLength(0);
  });

  it('one note per update id', async () => {
    await insertNote(1);
    await expect(insertNote(1)).rejects.toThrow(/duplicate key/);
  });

  it('rejects scores outside 0-2 and totals that do not equal the sum', async () => {
    const id = await insertNote(2);
    await expect(db.query(`update notes set score_insight = 3 where id = $1`, [id])).rejects.toThrow(/check constraint/);
    await expect(
      db.query(`update notes set score_insight=2, score_specificity=2, score_relevance=2, score_evidence=2, score_completeness=1, total_score=10 where id=$1`, [id]),
    ).rejects.toThrow(/notes_total_matches_parts/);
    await expect(
      db.query(`update notes set score_insight=1, score_specificity=1, score_relevance=1, score_evidence=1, score_completeness=1, total_score=5, score_decision='develop' where id=$1`, [id]),
    ).rejects.toThrow(/notes_decision_matches_total/);
    await db.query(`update notes set score_insight=2, score_specificity=2, score_relevance=1, score_evidence=1, score_completeness=0, total_score=6, score_decision='develop' where id=$1`, [id]);
  });

  it('text notes need text; voice notes need a file id', async () => {
    await expect(db.query(`insert into notes (telegram_update_id, telegram_chat_id, telegram_message_id, input_type) values (3,1,1,'text')`)).rejects.toThrow(/notes_text_has_content/);
    await expect(db.query(`insert into notes (telegram_update_id, telegram_chat_id, telegram_message_id, input_type) values (4,1,1,'voice')`)).rejects.toThrow(/notes_voice_has_file/);
    await db.query(`insert into notes (telegram_update_id, telegram_chat_id, telegram_message_id, input_type, telegram_file_id) values (5,1,1,'voice','f')`);
  });

  it('one draft per note, pending by default', async () => {
    const note = await insertNote(6);
    const draft = await insertDraft(note);
    await expect(insertDraft(note)).rejects.toThrow(/duplicate key/);
    const row = await db.query<{ status: string; news_used: boolean }>(`select status, news_used from drafts where id = $1`, [draft]);
    expect(row.rows[0]).toEqual({ status: 'pending', news_used: false });
  });

  it('there is no "published" status', async () => {
    const draft = await insertDraft(await insertNote(7));
    await expect(db.query(`update drafts set status='published', reviewed_at=now() where id=$1`, [draft])).rejects.toThrow(/check constraint/);
  });

  it('conditional review: only a pending draft changes; decisions are final and reviewed drafts cannot be deleted', async () => {
    const draft = await insertDraft(await insertNote(8));
    const review = (status: string) =>
      db.query(`update drafts set status=$2, reviewed_at=now() where id=$1 and status='pending' returning id`, [draft, status]);
    expect((await review('rejected')).rows).toHaveLength(1);
    expect((await review('approved')).rows).toHaveLength(0); // second decision finds nothing to update
    await expect(db.query(`update drafts set status='approved' where id=$1`, [draft])).rejects.toThrow(/already rejected/);
    await expect(db.query(`update drafts set draft_text='edited' where id=$1`, [draft])).rejects.toThrow(/final/);
    await expect(db.query(`delete from drafts where id=$1`, [draft])).rejects.toThrow(/kept permanently/);
    const kept = await db.query(`select count(*)::int as n from drafts`);
    expect(kept.rows[0]).toEqual({ n: 1 });
  });

  it('news_used requires headline and link', async () => {
    const note = await insertNote(9);
    await expect(db.query(`insert into drafts (note_id, telegram_chat_id, draft_text, news_used) values ($1, 1, 'x', true)`, [note])).rejects.toThrow(/drafts_news_fields_present/);
  });

  it('reply lookup key: a Telegram message maps to at most one draft per chat', async () => {
    const a = await insertDraft(await insertNote(10));
    const b = await insertDraft(await insertNote(11));
    await db.query(`update drafts set telegram_draft_message_id=500 where id=$1`, [a]);
    await expect(db.query(`update drafts set telegram_draft_message_id=500 where id=$1`, [b])).rejects.toThrow(/duplicate key/);
  });

  it('activate_voice_skill keeps exactly one active version and is idempotent for identical content', async () => {
    const activate = (content: string) =>
      db.query<{ version: number; is_active: boolean }>(`select version, is_active from activate_voice_skill('meera', $1, 'test')`, [content]);
    expect((await activate(VOICE)).rows[0]).toEqual({ version: 1, is_active: true });
    expect((await activate(VOICE)).rows[0]).toEqual({ version: 1, is_active: true }); // no duplicate version
    expect((await activate(VOICE + '\nextra')).rows[0]).toEqual({ version: 2, is_active: true });
    const active = await db.query(`select version from voice_skills where is_active`);
    expect(active.rows).toEqual([{ version: 2 }]);
    await expect(db.query(`update voice_skills set is_active = true where version = 1`)).rejects.toThrow(/duplicate key/);
  });

  it('enables row level security on every table', async () => {
    const res = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relname in ('telegram_updates','notes','drafts','voice_skills') order by relname`,
    );
    expect(res.rows.every((r) => r.relrowsecurity)).toBe(true);
    expect(res.rows).toHaveLength(4);
  });
});
