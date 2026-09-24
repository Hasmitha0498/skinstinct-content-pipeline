# Production checklist

Tick each item as you complete it. Commands are in the README section shown in brackets.

## Configuration
- [ ] Gemini key configured (`GEMINI_API_KEY` in `.env.local` and Vercel) and `npm run gemini:models` shows every configured model as `OK` (§8)
- [ ] Telegram bot token configured (`TELEGRAM_BOT_TOKEN`) (§7)
- [ ] Telegram webhook secret configured, identical in `.env.local` and Vercel (`TELEGRAM_WEBHOOK_SECRET`) (§18)
- [ ] Supabase configured (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) (§9)
- [ ] Migrations applied: tables `telegram_updates`, `notes`, `drafts`, `voice_skills` exist (§10)
- [ ] Active voice skill exists: `npm run voice-skill:seed` printed `Active Voice Skill: ... v1` (§10)
- [ ] `TELEGRAM_ALLOWED_CHAT_IDS` set to Meera's chat ID (§19 step 3)

## Repository
- [ ] GitHub repo clean: `git status` shows nothing unexpected, and the repo is private (§14)
- [ ] `.env` / `.env.local` ignored: listed under "Ignored files" in `git status --ignored`
- [ ] `npm run check` passes (lint, typecheck, tests, build)

## Deployment
- [ ] Vercel deployed (§15)
- [ ] Health endpoint returns OK: `curl https://YOUR-DOMAIN/api/health` → `{"status":"ok"}`
- [ ] Webhook set: `npm run telegram:webhook-info` shows the `/api/webhook` URL and "Last error: none" (§17)

## Behaviour (in Telegram, then confirmed in Supabase)
- [ ] Text test passes: a strong note → "Draft ready — score N/10"; `notes` row `completed`, `drafts` row `pending`
- [ ] Voice test passes: a voice note → draft; `notes.input_type = voice`, `transcription` filled
- [ ] Weak-note rejection passes: `SYNTHETIC TEST: remind me to call the packaging supplier tomorrow` → "Not drafting this one yet"; no `drafts` row
- [ ] Relevant-news test passes: when a draft uses news, the NEWS SOURCE / FROM / LINK / ⚠ block appears and `drafts.news_used = true` (try `npm run eval:voice -- 04 --with-news` locally to find a note with current news)
- [ ] Irrelevant-news fallback passes: a draft without a news angle has no source block and `news_used = false`
- [ ] APPROVE works: reply APPROVE → "Approved and saved. This draft has NOT been published…"; `status = approved`
- [ ] REJECT works: reply REJECT → "Rejected and saved…"; `status = rejected`, row still present
- [ ] Duplicate update safe: exactly one `notes` row per message sent; `telegram:webhook-info` shows no delivery errors
- [ ] No LinkedIn publishing path exists: the `human judgment boundary` tests pass in `npm test`, and there is no LinkedIn variable in Vercel
