# Voice validation

Drafts generated from the supplied case notes with the real drafting prompt and Voice Skill, compared against
Meera's 15 published pieces (`data/published-corpus.txt`). The raw drafts for every run are in
[voice-validation-drafts.md](voice-validation-drafts.md) (append-only, produced by `npm run eval:voice`).

## Read this first: which model wrote what

The Gemini key used for evaluation is shared with another project and hit its **free-tier daily quota** for the
Flash models during these runs, and later the Flash models returned 503 "high demand". As a result:

| Run | Prompt / Voice Skill | Drafts written by |
|---|---|---|
| 1 | v1 | note-01: `gemini-3.5-flash` (the configured drafting model). note-02/03: `gemini-3.1-flash-lite` (fallback; not recorded in the file at the time, established from the logs) |
| 2 | v2 | all `gemini-3.1-flash-lite` (fallback) |
| 3 | v2 + copy/paragraph guards | all `gemini-3.1-flash-lite` (fallback) |
| 4 | v2 + guards + warnings | all `gemini-3.1-flash-lite` (fallback) |
| 5 (with news) | v2 + guards + warnings | all `gemini-3.1-flash-lite` (fallback) |

So **13 of the 14 drafts in runs 1-5 come from the fallback model**. Runs 6-7 below were made later with a
dedicated key for this project and were all written by the intended `gemini-3.5-flash`. See
[Runs 6-7: the intended drafting model](#runs-6-7-the-intended-drafting-model).

## Measured against the corpus

Computed over all 14 drafts (post body only).

| Marker | Meera's 15 pieces | 14 drafts | Verdict |
|---|---|---|---|
| Exclamation marks | 0 | 0 | ✅ match |
| Questions aimed at the reader | 0 (2 question marks total, neither to the reader) | 0 | ✅ match |
| Em dashes | 0 (she uses " - " 53 times) | 0 (cleanup converts any) | ✅ match |
| Hashtags / emojis / bullets | 0 | 0 | ✅ match |
| Average words per sentence | 17.2 | 13.3-22.7 | ✅ comparable |
| "I'm not saying X / I'm saying Y" move | 9 of 15 pieces | 12 of 14 drafts | ⚠ over-used as a formula |
| Contractions | default (93 contractions vs 29 full forms; "I'm" 20× vs "I am not" 2×) | 1 contraction in 14 drafts | ❌ consistently too formal |
| Paragraphs | 6-10 per LinkedIn post | 1-7; three single-block drafts before the guard | ⚠ fixed by the guard in run 4 |
| Figures not in the note | n/a | 0 in all 14 | ✅ |

## Qualitative comparison

**Technical specificity: good.** Every draft keeps the note's actual technical content, and none adds any.
Note-01 drafts keep "about 0.4 units", the more acidic preservative system and the emollient blend. Note-03
drafts keep "below 49 degrees Celsius" and "between 70 and 85 degrees Celsius". Terms are glossed the way
she does it ("the stratum corneum, the outermost layer of the skin"; "the emollient blend - the fats and oils
that provide the texture").

**Restraint and marketing language: good.** There is no hype vocabulary, no product pitch and no call to buy.
The Skinstinct name never appears. Endings follow her pattern of a practical implication, often "ask for the
documentation" (note-03: "the only way to be certain is to ask for the processing logs").

**Evidence handling and qualification: mostly good, with one serious failure.** The drafts separate what is
known from what isn't, as she does. Note-03 run 4: "Whether that discrepancy was a clerical error in their
labelling or a fundamental misunderstanding of the term, the documentation did not support the claim". That
mirrors the note's "either a labelling error or not. I don't know which". But see Hallucinations below.

**Sentence rhythm: partly.** Sentence length matches, and the long-then-short pattern appears ("That is not
cold-pressing. It is standard heat processing."). But without contractions the prose reads stiffer than hers:
"I am not saying… I do not know… it did not" where she would write "I'm not saying… I don't know".

**Founder voice: recognisable structure, generic texture.** The drafts use her moves (bounding the claim,
naming the incomplete explanation, ending on documentation), but too often as formulas. Twelve of 14 use
"I am not saying/suggesting", and early drafts pasted her signature sentences verbatim. A draft that sounds
like a collage of Meera's greatest hits is not the same as a draft in her voice.

## Hallucinations and faithfulness problems found

| Run / note | Problem | Status |
|---|---|---|
| 1 / 01 (3.5-flash) | Strengthened certainty: "The batch **isn't unsafe**" → "The batch is **entirely safe**"; dropped "I think" from "customers will notice" | Fixed: prompt rule 1 now requires hedges to be kept. Runs 2-4 keep "not unsafe" and "I suspect/expect" |
| 1 / 03 | Transplanted biography: "I do not have a medical degree…" (from newsletter_001, not the note) | Prompt rule 6 + Voice Skill DO NOT. Recurred in run 4 / 01; the copy check now catches it (contraction-insensitive) |
| 1 / 03, 2 / 03 | Verbatim pastiche: "It is not a particularly inspiring story. It is a documentation gap", "real and legitimate commercial considerations" (meaningless in context), "that is also useful information" | Copy check (5+ words from Voice Skill quotes) → redraft → warning shown to Meera if it survives |
| 3 / 01 | **Invented claim:** "The formulation is chemically stable", while the note says the pH stability data *looked off* | ❌ No mechanical guard can catch this. Only Meera's review can. This is why nothing is ever published automatically |
| 3 / 01 | Wrong actor: "the **manufacturer** had changed the preservative blend" (the note: the *supplier*) | ❌ Same: review-only |
| 3 / 01, 4 / 01 | Unsupported generalisations: "These changes are rarely intended to cause harm"; "Suppliers change raw materials… for their own commercial or logistical reasons" | ❌ Review-only; milder |
| 5 / 04 | News used where the fit is arguable: a US eczema statistic (NBC News) attached to a post for an Indian audience, relevance confidence 0.85 | Shown with the mandatory source block. Consider raising `NEWS_RELEVANCE_THRESHOLD` to 0.8 after watching real traffic |

## Changes made because of this validation

1. **Voice Skill v2:** documents the contraction default (with counts); says quoted lines are patterns, not
   sentences to reuse; DO NOT recycle past sentences or biographical lines; one signature move per post.
2. **Drafting prompt:** keep every hedge in the note and never upgrade certainty; never copy Voice Skill quotes.
3. **Copy check** (`findCopiedPhrases`): flags 5+ word runs copied from the Voice Skill's quoted examples,
   ignoring contraction differences and wording that's in the note itself. Triggers one redraft.
4. **Wall-of-text check:** a long post with fewer than 3 paragraphs triggers a redraft.
5. **Warnings shown to Meera:** anything the redraft didn't fix is listed under the draft in Telegram
   (`⚠ Wording copied from your past posts…`, `⚠ One long paragraph…`) and stored in `drafts.review_warnings`.
6. **Drafting fallback chain:** `gemini-3.5-flash` → `gemini-3.8-flash` → `gemini-3.1-flash-lite`, because each
   model has its own quota and flash-lite follows the Voice Skill noticeably less well. When a backup model
   writes the draft, Meera sees `⚠ Written by the backup model (…); check the voice closely`, and the model is
   stored in `drafts.drafting_model`.
7. **Quota handling:** a 429 whose retry time is longer than 20 s (a daily cap) moves to the next model
   immediately instead of waiting.

## Runs 6-7: the intended drafting model

A dedicated Gemini key restored `gemini-3.5-flash`. Run 6 used the v2 prompt, Voice Skill and guards. Run 7
added the certainty guard described below.

| | flash-lite (runs 2-5) | 3.5-flash (runs 6-7) |
|---|---|---|
| Paragraphing | 1-7; walls of text until the guard | 4-7 in every draft |
| Contractions | 1 in 13 drafts | present in 3 of 5 (0-7 per draft; "It isn't cold-pressing.", "I don't know", "we didn't use the ingredient"); still below her default |
| Verbatim pastiche | frequent, survived redrafts | none (only her own recurring opener "I want to explain why", now allowlisted: it appears in 3 of her 15 pieces) |
| Invented figures | none | none |
| Certainty upgrades | "entirely safe" (run 1) | run 6 still wrote "The batch is **entirely safe** to use" → **certainty guard added** → run 7: "the batch is not unsafe", "I think our customers will notice" |
| Invented details | "chemically stable", wrong actor | "A few weeks ago" / "last week" (the note says "recently"), "a legacy document that was never updated", "we would have passed that claim on to you", "This is a regular occurrence… that rarely gets discussed" |

**Certainty guard** (`findCertaintyUpgrades`): Meera uses absolute words about 6 times in 7,000 published
words. Any absolute ("entirely", "always", "proven", "guarantees"…) that the note doesn't use triggers a
redraft, and if it survives, a warning (`⚠ Stronger wording than your note: "entirely safe"`). It sometimes
flags harmless uses ("rely entirely on a supplier's summary sheet"). That was accepted, because the cost of a
false alarm is one glance.

**Conclusion for the intended model:** structure, rhythm and restraint now read like Meera, and contractions are improving but inconsistent.
The remaining failure is small invented *narrative* details (timing words, plausible-sounding generalisations
about the industry). No mechanical check catches these reliably. They are the reason every draft is
reviewed, and the most useful thing for Meera to look for when she reads one.

## Verdict

- **Safe to put in front of Meera for review:** yes. Hard rules (no invented figures, no hype, no pitch, no
  engagement bait, source block when news is used) held in all 14 drafts.
- **Publishable without editing:** no, and it isn't meant to be. The fallback model produces serviceable
  drafts with correct structure, but they are more formal than Meera and occasionally assert things the note
  doesn't (run 3 / 01). Those are exactly the errors the APPROVE/REJECT boundary exists to catch.
- **Intended model verified (runs 6-7):** with `gemini-3.5-flash`, drafts are close to her voice and need
  light edits, mainly deleting an invented timing word or generalisation. Flash-lite remains a noticeably
  weaker fallback, and Meera is told when it wrote a draft.
