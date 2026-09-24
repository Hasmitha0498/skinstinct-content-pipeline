-- Skinstinct content pipeline: persistent memory for Telegram updates, notes, drafts and the Voice Skill.
-- Run once in the Supabase SQL editor (or with `supabase db push`). Safe to read top to bottom.
--
-- Security model: the app talks to these tables only from the server, with the service role key.
-- Row Level Security is enabled with NO policies, so the public anon key can read or write nothing.

-- ---------------------------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- telegram_updates: idempotency ledger.
-- Telegram retries a webhook call if it doesn't get a fast 200. Every update (notes, APPROVE/REJECT,
-- stickers, /start...) is claimed here with INSERT ... ON CONFLICT DO NOTHING before any work is done,
-- so a retried update is recognised and skipped without a second Gemini call or a second draft.
-- It exists as its own table because APPROVE/REJECT and unsupported messages are not notes.
-- ---------------------------------------------------------------------------------------------
create table telegram_updates (
  update_id    bigint primary key,
  chat_id      bigint,
  update_kind  text not null check (update_kind in
                 ('text_note', 'voice_note', 'review_command', 'bot_command', 'unsupported', 'ignored')),
  received_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- notes: every captured note, the transcription for voice notes, and the publishability score.
-- ---------------------------------------------------------------------------------------------
create table notes (
  id                   uuid primary key default gen_random_uuid(),
  telegram_update_id   bigint not null unique,
  telegram_chat_id     bigint not null,
  telegram_message_id  bigint not null,
  input_type           text not null check (input_type in ('text', 'voice')),
  raw_text             text,          -- text notes: exactly what Meera typed
  telegram_file_id     text,          -- voice notes: Telegram's file id (the audio itself is never stored)
  transcription        text,          -- voice notes: Gemini's faithful transcript
  score_insight        smallint check (score_insight between 0 and 2),
  score_specificity    smallint check (score_specificity between 0 and 2),
  score_relevance      smallint check (score_relevance between 0 and 2),
  score_evidence       smallint check (score_evidence between 0 and 2),
  score_completeness   smallint check (score_completeness between 0 and 2),
  total_score          smallint check (total_score between 0 and 10),
  score_decision       text check (score_decision in ('develop', 'reject')),
  score_reason         text,
  keywords             text[],
  search_query         text,
  processing_status    text not null default 'received' check (processing_status in
                         ('received', 'transcribing', 'scoring', 'rejected', 'researching', 'drafting', 'completed', 'failed')),
  error_message        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint notes_text_has_content check (input_type <> 'text' or raw_text is not null),
  constraint notes_voice_has_file check (input_type <> 'voice' or telegram_file_id is not null),
  -- The total is always recomputed from the five parts (never trusted from the model).
  constraint notes_total_matches_parts check (
    total_score is null or total_score =
      score_insight + score_specificity + score_relevance + score_evidence + score_completeness),
  constraint notes_decision_matches_total check (
    score_decision is null or (score_decision = 'develop') = (total_score >= 6))
);

create index notes_chat_created_idx on notes (telegram_chat_id, created_at desc);
create index notes_status_idx on notes (processing_status);
create trigger notes_set_updated_at before update on notes
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- voice_skills: versioned voice profiles. Exactly one may be active.
-- ---------------------------------------------------------------------------------------------
create table voice_skills (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  version             integer not null check (version > 0),
  content             text not null check (length(content) > 200),
  is_active           boolean not null default false,
  source_description  text not null,
  created_at          timestamptz not null default now(),
  unique (name, version)
);

-- At most one active row across the whole table.
create unique index voice_skills_single_active_idx on voice_skills ((true)) where is_active;

-- Atomically store a new version and make it the only active one. If the content is identical to the
-- currently active version, nothing changes and that row is returned (so re-running the seed is safe).
create or replace function activate_voice_skill(p_name text, p_content text, p_source_description text)
returns voice_skills
language plpgsql as $$
declare
  current_row voice_skills;
  new_row voice_skills;
begin
  -- Serialise concurrent activations.
  lock table voice_skills in share row exclusive mode;

  select * into current_row from voice_skills where is_active limit 1;
  if found and current_row.name = p_name and current_row.content = p_content then
    return current_row;
  end if;

  update voice_skills set is_active = false where is_active;

  insert into voice_skills (name, version, content, is_active, source_description)
  values (
    p_name,
    coalesce((select max(version) from voice_skills where name = p_name), 0) + 1,
    p_content,
    true,
    p_source_description
  )
  returning * into new_row;

  return new_row;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- drafts: one LinkedIn draft per developed note, awaiting Meera's decision.
-- There is deliberately no "published" status: publishing happens outside this system, by Meera.
-- ---------------------------------------------------------------------------------------------
create table drafts (
  id                         uuid primary key default gen_random_uuid(),
  note_id                    uuid not null unique references notes (id) on delete restrict,
  telegram_chat_id           bigint not null,
  telegram_draft_message_id  bigint,
  draft_text                 text not null check (length(draft_text) > 0),
  status                     text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  news_used                  boolean not null default false,
  news_headline              text,
  news_source                text,
  news_published_at          timestamptz,
  news_url                   text,
  news_summary               text,
  news_relevance_confidence  numeric(3, 2) check (news_relevance_confidence between 0 and 1),
  news_relevance_reason      text,
  unsupported_figures        text[] not null default '{}',
  voice_skill_id             uuid references voice_skills (id),
  drafting_model             text,          -- which Gemini model wrote it (primary or fallback)
  review_warnings            text[] not null default '{}', -- voice/format issues shown to Meera
  approval_message_id        bigint,
  reviewed_at                timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),

  constraint drafts_news_fields_present check (not news_used or (news_headline is not null and news_url is not null)),
  constraint drafts_reviewed_at_matches_status check ((status = 'pending') = (reviewed_at is null))
);

create unique index drafts_telegram_message_idx on drafts (telegram_chat_id, telegram_draft_message_id)
  where telegram_draft_message_id is not null;
create index drafts_chat_status_idx on drafts (telegram_chat_id, status);
create trigger drafts_set_updated_at before update on drafts
  for each row execute function set_updated_at();

-- A decision is final: an approved or rejected draft cannot be flipped or silently edited, and
-- reviewed drafts cannot be deleted (rejected drafts are kept for learning/debugging).
create or replace function guard_reviewed_drafts() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'pending' then
      raise exception 'Reviewed drafts are kept permanently (draft %)', old.id;
    end if;
    return old;
  end if;
  if old.status <> 'pending' and (new.status <> old.status or new.draft_text <> old.draft_text) then
    raise exception 'Draft % was already %; its decision and text are final', old.id, old.status;
  end if;
  return new;
end;
$$;

create trigger drafts_guard_reviewed before update or delete on drafts
  for each row execute function guard_reviewed_drafts();

-- ---------------------------------------------------------------------------------------------
-- Lock the tables away from the public API. The service role bypasses RLS; nothing else gets in.
-- ---------------------------------------------------------------------------------------------
alter table telegram_updates enable row level security;
alter table notes enable row level security;
alter table voice_skills enable row level security;
alter table drafts enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function activate_voice_skill(text, text, text) from public, anon, authenticated;
    grant execute on function activate_voice_skill(text, text, text) to service_role;
  end if;
end;
$$;
