# Skinstinct content pipeline

Meera Pillai (founder of Skinstinct) keeps capturing content ideas in Telegram. This service picks up each
note, decides whether it's worth developing, drafts a LinkedIn post in her own voice, and sends it back to her
in Telegram for review.

**It never publishes anything.** Meera approves or rejects each draft, and she publishes approved posts to
LinkedIn herself, by hand.

> Meera keeps capturing her real thoughts in the place she already uses. The system removes the friction
> between a worthwhile thought and a reviewable draft, while keeping Meera's judgment at the final
> consequential step.

---

## Contents

1. [What it does](#1-what-it-does)
2. [Architecture](#2-architecture)
3. [The human judgment boundary](#3-the-human-judgment-boundary)
4. [Tech stack](#4-tech-stack)
5. [Folder structure](#5-folder-structure)
6. [Prerequisites](#6-prerequisites)
7. [Telegram bot setup (BotFather)](#7-telegram-bot-setup-botfather)
8. [Gemini API setup](#8-gemini-api-setup)
9. [Supabase setup](#9-supabase-setup)
10. [Running the SQL migration](#10-running-the-sql-migration)
11. [Environment variables](#11-environment-variables)
12. [Local installation](#12-local-installation)
13. [Local testing](#13-local-testing)
14. [GitHub setup](#14-github-setup)
15. [Vercel deployment](#15-vercel-deployment)
16. [Vercel environment variables](#16-vercel-environment-variables)
17. [Registering the Telegram webhook](#17-registering-the-telegram-webhook)
18. [The webhook secret](#18-the-webhook-secret)
19. [Production testing](#19-production-testing)
20. [How APPROVE / REJECT works](#20-how-approve--reject-works)
21. [How voice notes work](#21-how-voice-notes-work)
22. [How the news search works](#22-how-the-news-search-works)
23. [Troubleshooting](#23-troubleshooting)
24. [Inspecting records in Supabase](#24-inspecting-records-in-supabase)
25. [Updating the Voice Skill](#25-updating-the-voice-skill)
26. [Known limitations](#26-known-limitations)

---

## 1. What it does

For every message Meera sends the bot:

| Step | What happens |
|---|---|
| Capture | A text note is used as typed. A voice note is downloaded from Telegram and transcribed word for word by Gemini. |
| Save | The original note (or the transcript) goes into Supabase straight away. |
| Score | Gemini scores the note 0-2 on five things (insight, specificity, relevance, evidence, completeness). The app adds the scores up itself: it never trusts Gemini's arithmetic. |
| Reject weak notes | Below 6/10: Meera gets a short, specific explanation and processing stops. No news search, no draft. |
| Research | 6/10 or more: Gemini turns the note into a short search, the app queries Google News RSS (India edition), and Gemini checks whether any recent headline *genuinely* fits. Usually none does, and that's fine. |
| Draft | Gemini writes a LinkedIn draft from the note, following Meera's **Voice Skill** (`data/voice-skill.txt`) and strict no-invention rules. Mechanical checks flag figures that aren't in the note, wording copied from her past posts, and walls of text. One redraft is attempted, and anything left unresolved is shown to Meera as a ⚠ note under the draft. |
| Review | The draft is stored as **pending** and sent to Meera. If news was used, a mandatory source block is attached. |
| Decide | Meera replies **APPROVE** or **REJECT**. The status is updated, confirmed, and the flow stops. |

## 2. Architecture

```
Telegram ──POST──▶ /api/webhook (Vercel)
                     │ 1. verify X-Telegram-Bot-Api-Secret-Token
                     │ 2. claim update_id in Supabase (atomic; duplicates stop here)
                     │ 3. reply 200 to Telegram immediately
                     ▼
               after(): background work (same function, up to 300 s)
                     │
      text ──────────┤
      voice ─ getFile ─ download ─ Gemini transcription
                     ▼
               save note ─▶ Gemini score (JSON, Zod-validated, total recomputed)
                     │
           < 6 ──────┴──── ≥ 6
            │               │
      rejection msg    Gemini keywords ─▶ Google News RSS ─▶ Gemini relevance (≥ 0.70)
         STOP               │                 (any failure = no news, continue)
                            ▼
                     Gemini draft (note + Voice Skill + news only if relevant)
                            ▼
                     fact check (figures) ─▶ save draft as PENDING ─▶ Telegram
                            ▼
                     APPROVE / REJECT ─▶ status update ─▶ confirmation ─▶ STOP
```

A diagram with the Actor → Trigger → Input → Context → Processing → AI → Output → Human Review stages is in
[docs/components-map.md](docs/components-map.md).

**Why reply first and work afterwards?** Scoring, research and drafting take several Gemini calls (often 15-60
seconds). If Telegram doesn't get a quick `200 OK`, it re-sends the same update. So the webhook does only the
fast, safe part inside the request (check the secret, record the update ID) and then runs the slow part in
Next.js `after()`. On Vercel, that keeps the function alive after the response has been sent, up to
`maxDuration` (300 s, the free Hobby plan limit). No queue or paid service is needed. If Telegram re-sends an
update anyway, the update ID is already claimed and the retry is ignored.

## 3. The human judgment boundary

The system **never**:

- connects to any LinkedIn API (there is no LinkedIn code, credential or dependency, and a test enforces it);
- publishes, schedules, or queues a post;
- marks a draft approved by itself;
- changes a draft after Meera approves it (the database refuses edits to reviewed drafts);
- deletes rejected drafts or notes (the database refuses deletion of reviewed drafts);
- invents sources: the news block is built only from fields Google News actually returned.

After **APPROVE** the bot replies:

> Approved and saved. This draft has NOT been published. Review/edit it as needed and publish manually when you're ready.

…and does nothing else. Draft statuses are only `pending`, `approved` or `rejected`, and there is no
`published` status anywhere.

## 4. Tech stack

| Part | Choice |
|---|---|
| Runtime AI | Google Gemini API only (`@google/genai`) |
| Messaging | Telegram Bot API (webhook) |
| Database | Supabase (PostgreSQL) |
| News | Google News RSS, free, no key |
| Hosting | Vercel (Next.js 16 App Router, Node.js runtime) |
| Language | TypeScript (strict), Zod for validation |
| Tests | Vitest, plus PGlite (in-memory Postgres) to test the real SQL migration |

The deployed app needs **no** Anthropic/Claude, OpenAI, paid news or LinkedIn credentials.

## 5. Folder structure

```
app/
  api/webhook/route.ts     Telegram webhook: secret check, idempotent claim, background hand-off
  api/health/route.ts      GET /api/health -> {"status":"ok"}
  page.tsx                 minimal "service is running" page
lib/
  config.ts                environment validation, model defaults, thresholds
  log.ts                   structured JSON logs with secret redaction
  types.ts                 shared types + the Repository interface
  voice-skill.ts           loads the active Voice Skill (Supabase, then bundled file)
  ai/
    gemini.ts              Gemini SDK wrapper: JSON output, validation, bounded retries
    prompts.ts             every prompt, with untrusted text in delimited data blocks
    transcribe.ts          voice -> faithful transcript (fails rather than guessing)
    score-note.ts          5-dimension score, total recomputed in code
    extract-keywords.ts    note -> concise Google News query
    evaluate-news.ts       relevance check + code-level confidence threshold
    draft-post.ts          draft in Meera's voice + cleanup + news-used safety net
    fact-check.ts          flags figures that aren't in the note / news metadata
  news/google-news.ts      RSS URL, fetch with timeout, XML parsing
  telegram/                update parsing, Bot API client, all user-facing messages
  pipeline/                the note pipeline, APPROVE/REJECT, update dispatch, wiring
  supabase/                server-only client + Repository implementation
  validation/schemas.ts    Zod + JSON schemas for every Gemini response
data/
  voice-skill.txt          Meera's Voice Skill (derived from her 15 published pieces)
  published-corpus.txt     the 15 published pieces as text (voice reference)
  seed-notes/              the five raw case notes, verbatim
supabase/migrations/       SQL schema (run once)
scripts/                   webhook setup, voice-skill seeding, evaluations, local polling
tests/                     automated tests (no real API calls)
docs/                      components map, checklist, evaluations
```

## 6. Prerequisites

- **Node.js 20 or newer** (check with `node -v`). Install from <https://nodejs.org> if needed.
- A **Telegram** account (phone app is fine).
- A **Google account** for Gemini (Google AI Studio).
- A free **Supabase** account: <https://supabase.com>.
- A free **GitHub** account: <https://github.com>.
- A free **Vercel** account (sign in with GitHub): <https://vercel.com>.

## 7. Telegram bot setup (BotFather)

1. In Telegram, open a chat with **@BotFather** (the one with the blue tick).
2. Send `/newbot`, choose a display name (e.g. `Skinstinct Drafts`) and a username ending in `bot`.
3. BotFather replies with a **token** like `123456789:AA...`. This is a password for your bot: never share it,
   commit it, or paste it into a browser URL.
**Meera's capture channel (her current habit).** The case and the Answer Key have Meera dropping notes into her
own Telegram channel, and the bot works there:

1. Open the channel → **Administrators** → **Add Admin** → search for your bot → allow **Post Messages**.
2. Set `TELEGRAM_ALLOWED_CHAT_IDS` to the channel's ID (a negative number starting `-100`, e.g.
   `-1004307843642`). With only the channel allowed, direct messages to the bot get "This bot is private".
   Add both IDs, comma-separated, if you want both.
3. Post a note in the channel. The draft arrives in the channel as a reply to the note. Reply to the draft
   with APPROVE or REJECT in the channel.

## 8. Gemini API setup

1. Go to <https://aistudio.google.com/apikey> and click **Create API key**.
2. Copy it into `.env.local` as `GEMINI_API_KEY=` (see section 11).
3. Check which models your key can use:

   ```bash
   npm run gemini:models
   ```

   The output ends with a "Configured:" list marking each configured model `OK` or `NOT AVAILABLE`.

**Default models** (override with `GEMINI_MODEL_SCORING`, `GEMINI_MODEL_TRANSCRIPTION`,
`GEMINI_MODEL_DRAFTING`, `GEMINI_DRAFTING_FALLBACK_MODELS`, `GEMINI_FALLBACK_MODEL`):

| Role | Default | Why |
|---|---|---|
| Scoring, keywords, news relevance | `gemini-3.1-flash-lite` | Fast, cheap classification; largest free-tier allowance |
| Transcription | `gemini-3.1-flash-lite` | Supports audio input |
| Drafting | `gemini-3.5-flash` | Better writing quality; only ~1 call per strong note |
| Drafting fallbacks | `gemini-3.8-flash`, then `gemini-3.1-flash-lite` | Each model has its own quota. flash-lite follows the Voice Skill noticeably less well ([docs/voice-validation.md](docs/voice-validation.md)), so it's the last resort, and Meera is told when a backup wrote her draft |
| Fallback (classification roles) | `gemini-3.1-flash-lite` | Tried when the main model is overloaded / rate-limited |

All of these IDs were verified with `npm run gemini:models` on this account during the build. Model names change over time,
so run `npm run gemini:models` and set the variables if a default shows `NOT AVAILABLE`. Classification runs
at temperature 0 and drafting at 0.7.

**Free-tier note:** a strong note uses up to 4 Gemini calls (5 for voice, plus one redraft if invented figures are found) and a weak note 1-2. Meera's
target of about 3 posts a week is far below free-tier limits, but a burst of test messages can hit
per-minute limits. The app retries briefly, then tells the user to try again.

## 9. Supabase setup

1. At <https://supabase.com/dashboard>, click **New project**. Pick a name, a strong database password (save it
   somewhere safe) and the region closest to India (e.g. *Mumbai / ap-south-1*).
2. Wait for the project to finish provisioning (1-2 minutes).
3. Open **Project Settings → API** (or **Settings → API Keys**) and copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** key (or the **secret** key, `sb_secret_...`) → `SUPABASE_SERVICE_ROLE_KEY`

   The service role key bypasses all security rules. Use it only in `.env.local` and in Vercel's server-side
   environment variables. Never put it in browser code, GitHub, or screenshots.

**Security assumptions.** Only the server talks to the database, using the service role key. Row Level
Security is **enabled with no policies** on every table, so the public `anon` key can read or write nothing.
The app has no browser-side database client.

## 10. Running the SQL migration

1. In the Supabase dashboard, open **SQL Editor → New query**.
2. Open `supabase/migrations/001_initial_schema.sql` from this project, copy **all** of it, paste it, and click
   **Run**. You should see "Success. No rows returned".
3. Check **Table Editor**: you should see `telegram_updates`, `notes`, `drafts`, `voice_skills`.
4. Seed the Voice Skill (after section 12, once `.env.local` exists):

   ```bash
   npm run voice-skill:seed
   ```

   Expected output: `Active Voice Skill: meera-pillai-linkedin v1 (... chars, id ...)`.
   Running it again with an unchanged file is safe: it does not create a duplicate version.

What the schema enforces by itself (so a bug can't break these rules):

- each Telegram `update_id` can be claimed once (`telegram_updates`), which is what makes retries harmless;
- scores must be 0-2, `total_score` must equal the sum of the five, and `develop` requires ≥ 6;
- one draft per note; a Telegram message ID maps to at most one draft;
- statuses are only `pending` / `approved` / `rejected`, and a reviewed draft can't be changed or deleted;
- only one Voice Skill can be active.

**Why the extra `telegram_updates` table?** APPROVE/REJECT messages, stickers and `/start` are not notes, but
Telegram can re-send them too. One small ledger of every update ID makes *all* of them idempotent with a
single atomic `INSERT ... ON CONFLICT DO NOTHING`.

## 11. Environment variables

Copy the template and fill it in:

```bash
cp .env.example .env.local
```

| Variable | Required | What it is |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | yes | From BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | yes | A random string you generate (section 18). Without it the webhook refuses all requests. |
| `GEMINI_API_KEY` | yes | From Google AI Studio |
| `SUPABASE_URL` | yes | `https://<project>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-only key |
| `TELEGRAM_ALLOWED_CHAT_IDS` | recommended | Comma-separated chat IDs allowed to use the bot. Empty = anyone who finds the bot (fine while setting up). |
| `GEMINI_MODEL_SCORING` / `_TRANSCRIPTION` / `_DRAFTING` | no | Override default models (section 8) |
| `GEMINI_DRAFTING_FALLBACK_MODELS` | no | Comma-separated drafting fallbacks (default `gemini-3.8-flash,gemini-3.1-flash-lite`) |
| `GEMINI_FALLBACK_MODEL` | no | Model tried when the main one is overloaded (classification roles; also last in the drafting chain) |
| `NEWS_RELEVANCE_THRESHOLD` | no | 0-1, default `0.70`. Higher = news used less often. |
| `NEWS_MAX_AGE_DAYS` | no | Only headlines newer than this count as "current". Default `30`. |

`.env`, `.env.local` and every other `.env.*` file except `.env.example` are git-ignored. `/api/health` never
reveals which variables are set.

## 12. Local installation

```bash
cd skinstinct-content-pipeline
```

```bash
npm install
```

Then create `.env.local` (section 11).

## 13. Local testing

Run every quality gate (lint, typecheck, tests, production build):

```bash
npm run check
```

Or individually:

```bash
npm test
```

The tests never call Gemini, Telegram, Google News or Supabase: all four are replaced by fakes. The SQL
migration is tested against a real in-memory Postgres (PGlite).

**Try the real bot locally (optional).** You don't need a public URL: `npm run poll` fetches messages from
Telegram and runs them through exactly the same code as the webhook. It only works while no webhook is set:

```bash
npm run poll
```

Stop it with Ctrl+C. If you've already set a webhook, remove it first with
`npm run telegram:set-webhook -- --delete`.

**Evaluate with real Gemini:**

```bash
npm run eval:seed-notes
```

```bash
npm run eval:controls
```

```bash
npm run eval:voice -- 01 03
```

The first appends a scoring run for the five case notes to `docs/seed-note-evaluation.md`. The second scores
clearly labelled synthetic weak/injection notes to check that rejection works. The third appends
drafts for notes 01 and 03 to `docs/voice-validation-drafts.md`. Add `--with-news` to include the live
Google News step.

## 14. GitHub setup

1. On <https://github.com/new>, create an **empty private** repository called `skinstinct-content-pipeline`
   (no README, no .gitignore, since the project already has them).
2. In this folder, check that no secrets are about to be committed:

   ```bash
   git status --ignored
   ```

   `.env.local` must appear under "Ignored files", never under "Changes".
3. Connect and push (replace `YOUR-USERNAME`):

   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/skinstinct-content-pipeline.git
   ```

   ```bash
   git push -u origin main
   ```

## 15. Vercel deployment

1. At <https://vercel.com/new>, click **Import** next to `skinstinct-content-pipeline`.
2. Framework preset: **Next.js** (auto-detected). Leave build settings as they are.
3. Before clicking **Deploy**, open **Environment Variables** and add the variables from section 16.
4. Click **Deploy**. When it finishes, copy the production domain, e.g. `skinstinct-content-pipeline.vercel.app`.
5. Check it's alive:

   ```bash
   curl https://YOUR-DOMAIN.vercel.app/api/health
   ```

   Expected: `{"status":"ok"}`.

## 16. Vercel environment variables

In **Project → Settings → Environment Variables**, add each of these for the **Production** environment:

`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and optionally `TELEGRAM_ALLOWED_CHAT_IDS`, the model overrides,
`NEWS_RELEVANCE_THRESHOLD` and `NEWS_MAX_AGE_DAYS`.

Use the **same** `TELEGRAM_WEBHOOK_SECRET` as in your `.env.local`, because the setup script registers that
value with Telegram. None of these start with `NEXT_PUBLIC_`, so Next.js never exposes them to a browser.
After changing variables, redeploy (**Deployments → ⋯ → Redeploy**) so they take effect.

## 17. Registering the Telegram webhook

From your computer (it reads the token and secret from `.env.local`, so you never type the token into a URL):

```bash
npm run telegram:set-webhook -- https://YOUR-DOMAIN.vercel.app
```

Expected: `Webhook set for @your_bot -> https://YOUR-DOMAIN.vercel.app/api/webhook`.

Check delivery at any time:

```bash
npm run telegram:webhook-info
```

"Last error: none" and "Pending updates: 0" mean Telegram is delivering successfully.

## 18. The webhook secret

Telegram lets you register a `secret_token` with the webhook. It then sends that value in the
`X-Telegram-Bot-Api-Secret-Token` header of every update. The app compares it (in constant time) with
`TELEGRAM_WEBHOOK_SECRET` and rejects anything else with `401`, so nobody who discovers the URL can inject fake
notes or approvals. If the variable is missing, the webhook refuses **all** requests rather than running
unprotected.

Generate one (letters, digits, `_` and `-` only; 16-256 characters):

```bash
openssl rand -hex 32
```

## 19. Production testing

Run these in order and tick them off in [docs/production-checklist.md](docs/production-checklist.md):

1. `curl https://YOUR-DOMAIN.vercel.app/api/health` → `{"status":"ok"}`.
2. Send the bot `/start` → a help message.
3. **Find your chat ID:** in Vercel → **Logs**, find the `update.chat_seen` line and copy `chatId`. Set
   `TELEGRAM_ALLOWED_CHAT_IDS` to it and redeploy.
4. **Weak note:** send `SYNTHETIC TEST: remind me to call the packaging supplier tomorrow` → "Not drafting this
   one yet: N/10" with a reason.
5. **Strong text note:** paste one of the case notes (e.g. `data/seed-notes/note-01.txt`) → after 15-60 s,
   "Draft ready — score N/10".
6. **Voice note:** hold the mic button and read a note aloud → a draft (or a clear failure message).
7. In Supabase **Table Editor → notes**, confirm the rows, scores and statuses (section 24).
8. **REJECT:** reply to one draft with `REJECT` → "Rejected and saved…"; `drafts.status` = `rejected`.
9. **APPROVE:** reply to another draft with `APPROVE` → "Approved and saved. This draft has NOT been
   published…"; `drafts.status` = `approved`.
10. **Duplicate safety:** `npm run telegram:webhook-info` shows no errors, and `notes` has exactly one row per
    message you sent.

## 20. How APPROVE / REJECT works

- Send exactly `APPROVE` or `REJECT` (any capitalisation, spaces and a trailing full stop are fine).
  Anything else is treated as a new note.
- **Best:** swipe/long-press the draft message and **Reply** with the word. That targets exactly that draft.
- **Not a reply:** if exactly one draft is pending in the chat, it applies to that one. If several are pending,
  the bot refuses to guess and asks you to reply to the specific draft. If none are pending, it says so.
- Decisions are **final**: a second APPROVE/REJECT on the same draft changes nothing and says so. Nothing is
  ever deleted, so rejected drafts and their notes stay in Supabase for learning and debugging.
- Approval only changes `drafts.status`, `reviewed_at` and `approval_message_id`. Nothing is published.

## 21. How voice notes work

1. Telegram sends the update with a `file_id` (not the audio itself).
2. The app calls Telegram `getFile`, downloads the audio **into memory** (max 20 MB), and never writes it to
   disk or storage.
3. The audio goes to Gemini inline with instructions to transcribe **verbatim**: no summarising, rewriting or
   "improving", with unclear words marked `[inaudible]`.
4. If Gemini reports no intelligible speech, or the transcript is mostly `[inaudible]`, the note is marked
   `failed` and Meera gets: *"I couldn't reliably transcribe this voice note, so I didn't create a draft.
   Please resend it or send the note as text."* No transcript is ever invented.
5. `notes` stores `input_type = voice`, the `telegram_file_id` and the `transcription`. The transcript then goes
   through the same scoring and drafting as a text note.

## 22. How the news search works

1. Gemini turns the note into 2-6 plain search words that reflect **only the note's own subject**.
2. The app fetches `https://news.google.com/rss/search?q=...&hl=en-IN&gl=IN&ceid=IN:en` (India, English) with a
   5-second timeout and one retry.
3. Only dated items from the last `NEWS_MAX_AGE_DAYS` (default 30) are kept, up to 5 candidates.
4. Gemini judges, from **headline, publication, date and snippet only**, whether one candidate fits naturally.
   The app uses it only if Gemini says relevant **and** confidence ≥ `NEWS_RELEVANCE_THRESHOLD` (0.70).
5. The drafting prompt says the article has **not been read**. The post may only reference what the headline
   says, attributed to the publication. Figures from the headline count as supported, and nothing else does.
6. If the post uses the item, this block is appended, built only from retrieved fields:

   ```
   ─────────────────────────────────
   NEWS SOURCE: [headline]
   FROM: [publication] · [date]
   LINK: [url]
   ⚠ Check this before publishing — you are the author of this claim
   ─────────────────────────────────
   ```

   Missing fields show as "publication not provided" / "date not provided", never guessed. The news metadata
   is also stored in separate `drafts.news_*` columns. `draft_text` holds only the post.

Timeouts, bad XML, no results, low relevance, or any error all lead to the same outcome: the draft is written
without news. Most notes won't have a genuinely relevant headline, and that's expected.

## 23. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Bot doesn't answer at all | `npm run telegram:webhook-info`. A `401` means the secret in Vercel differs from `.env.local`: fix it, redeploy, re-run `telegram:set-webhook`. A `500` means a variable is missing in Vercel: check Logs for `webhook.deps_failed` / `webhook.secret_not_configured`. |
| `/api/webhook` returns 500 and Vercel Logs show `webhook.secret_not_configured` | The variable exists in Vercel but its value is empty (e.g. an empty line pasted from `.env.example`). Re-enter it, then **Redeploy**: variables only apply to new deployments. |
| "This bot is private…" | Your chat ID isn't in `TELEGRAM_ALLOWED_CHAT_IDS`. |
| "…couldn't score it right now…" | Gemini failed after retries (rate limit, outage or an invalid key). Check Logs for `gemini.attempt_failed`. Run `npm run gemini:models`. |
| Draft never arrives but a note was stored | Check Logs for `note.failed` or `draft.delivery_failed`. The `notes.processing_status` and `error_message` columns show where it stopped. |
| "…couldn't load your Voice Skill…" | Run `npm run voice-skill:seed`. The app refuses to draft in a generic voice. |
| `npm run poll` says a webhook is set | `npm run telegram:set-webhook -- --delete`, then re-run the poll. Set the webhook again before production testing. |
| `node: .env.local: not found` | Create it: `cp .env.example .env.local`. |
| Voice note fails every time | Check it's under 20 MB, and check Logs for `gemini.attempt_failed` with `call: transcribe`. Try a different `GEMINI_MODEL_TRANSCRIPTION`. |

Logs are structured JSON (Vercel → **Logs**). Each line carries `updateId`, `noteId`, `draftId` and `stage`.
Secrets are redacted, and note text is never logged, only its length.

## 24. Inspecting records in Supabase

Use **Table Editor** to browse, or **SQL Editor** for queries like these:

```sql
-- Latest notes with their score and where processing stopped
select created_at, input_type, total_score, score_decision, processing_status, error_message,
       coalesce(raw_text, transcription) as note
from notes order by created_at desc limit 20;
```

```sql
-- Drafts awaiting review, with any news used and any warnings shown to Meera
select d.created_at, n.total_score, d.status, d.drafting_model, d.news_used, d.news_headline,
       d.unsupported_figures, d.review_warnings, d.draft_text
from drafts d join notes n on n.id = d.note_id
where d.status = 'pending' order by d.created_at desc;
```

```sql
-- Decisions so far
select status, count(*) from drafts group by status;
```

```sql
-- Which Voice Skill is active
select name, version, length(content) as chars, created_at from voice_skills where is_active;
```

## 25. Updating the Voice Skill

1. Edit `data/voice-skill.txt`. Base changes on Meera's actual writing (`data/published-corpus.txt` and any new
   pieces she publishes), not generic LinkedIn advice.
2. Store it as the new active version:

   ```bash
   npm run voice-skill:seed
   ```

   The previous version stays in `voice_skills` (inactive) for comparison. Drafts record which version wrote
   them in `drafts.voice_skill_id`.
3. Optionally compare drafts before and after with `npm run eval:voice -- 01 03`.
4. Commit and push the file. The deployed app reads the active version from Supabase on every draft, so no
   redeploy is needed for the change itself. The bundled file is only a fallback for database outages.

## 26. Known limitations

- **Fact checking is partial.** The automatic checks catch invented *figures* (digits) and wording copied from
  the Voice Skill. They can't catch an invented claim written in words. In validation, the fallback model once
  wrote "The formulation is chemically stable" for a note saying the stability data *looked off*. That is
  exactly why Meera reviews every draft, and why the product never publishes.
- **Voice quality depends on the drafting model.** The intended model (`gemini-3.5-flash`) was only partly
  evaluated because of free-tier quota exhaustion. The fallback `gemini-3.1-flash-lite` is noticeably more
  formal (almost no contractions) and more formulaic. See [docs/voice-validation.md](docs/voice-validation.md).
  Using a dedicated Gemini key for this project (not shared with other projects) avoids most of this.
- **News is headline-level.** Google News RSS gives headline, publication, date and a link (Google's redirect
  link, not the publisher URL), and usually no useful snippet. The system never reads full articles, so a news
  angle is only as reliable as a headline. Meera must open the link before publishing.
- **Relevance is conservative.** With a 0.70 threshold and a 30-day window, most notes are drafted without news.
- **Transcription quality depends on audio.** Heavy background noise or unusual technical terms may cause a
  failed transcription (by design, rather than a guessed one).
- **Background time limit.** Processing must finish within Vercel's 300 s `maxDuration`. Typical runs take
  15-60 s. If Gemini is severely degraded the run may be cut off, leaving the note in an intermediate status
  (visible in `notes.processing_status`). Meera can simply resend the note.
- **Decisions are final.** A rejected draft can't be re-approved by the bot. Resend the note to get a new draft.
- **Model IDs change.** Gemini model names are configurable. If Google retires a default, set the environment
  variables (section 8).
- **Free-tier limits.** Bursts of many notes per minute can hit Gemini rate limits. The bot says so rather than
  failing silently.
- **Single owner.** The bot is designed for one person's chat. `TELEGRAM_ALLOWED_CHAT_IDS` keeps others out.
