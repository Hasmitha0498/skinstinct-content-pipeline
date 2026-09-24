# Seed note evaluation

The five raw notes supplied with the case (`data/seed-notes/`, copied verbatim from `Note 01-05.rtf`) scored by the
real production scoring prompt (`lib/ai/prompts.ts` -> `SCORE_SYSTEM`) through Gemini. The total and the
develop/reject decision are recomputed in code from the five dimension scores (threshold: 6).

Runs are appended by `npm run eval:seed-notes` and never edited afterwards. If the rubric changes, a new run is
added with a new prompt fingerprint, and the change is explained under "Rubric changes".

## Run 2026-09-24T10:49:18.874Z

- Model: `gemini-3.1-flash-lite` (fallback `gemini-3.1-flash-lite`), temperature 0
- Scoring prompt fingerprint: `589c767473`
- Notes fingerprint: `5fe796355c`
- Breakdown key: I = insight, S = specificity, R = relevance, E = evidence, C = completeness (each 0-2)

| Note | Score | Breakdown | Decision | Model's reasoning |
|---|---|---|---|---|
| note-01 | **10/10** | I2 S2 R2 E2 C2 | develop | This is a high-value, authentic operational story that perfectly illustrates the 'hidden' risks of D2C manufacturing. You have a clear narrative arc—the problem, the root cause, and the corrective action—that will resonate strongly with other founders and quality-conscious consumers. |
| note-02 | **10/10** | I2 S2 R2 E2 C2 | develop | This is a perfect example of how customer troubleshooting reveals common user errors that you can educate your audience on. You have a clear mechanism (occlusive barrier blocking absorption) and a relatable customer story that highlights the 'blame the wrong product' bias. |
| note-03 | **10/10** | I2 S2 R2 E2 C2 | develop | This is a strong, actionable example of the 'trust but verify' principle in formulation science that directly reinforces your brand's commitment to ingredient integrity. It provides a clear, relatable narrative about the gap between marketing claims and manufacturing reality. |
| note-04 | **9/10** | I2 S2 R2 E1 C2 | develop | You have a strong, nuanced take here that moves beyond the basic 'barrier repair' buzzword by distinguishing between mechanical, chemical, and biological causes of barrier damage. This is exactly the kind of educational, expert-led content that builds authority for Skinstinct. |
| note-05 | **9/10** | I2 S2 R2 E1 C2 | develop | You have identified a sharp, commercially relevant tension between marketing terminology and formulation integrity. The critique of 'clean beauty' checklists as blunt instruments that ignore therapeutic efficacy is a strong, defensible position for your brand. |

- **note-01** improvement hint: Focus the post on the 'trust but verify' lesson for founders, using this specific incident as the hook to explain why you check every CoA against your baseline.
- **note-02** improvement hint: Focus the post on the 'layering order' rule of thumb and use this specific anecdote to illustrate why the order of operations matters more than the product quality itself.
- **note-03** improvement hint: Focus the post on the 'hidden' work of a founder—the due diligence that prevents compromised ingredients from ever reaching the customer.
- **note-04** improvement hint: Focus the post on the 'three types of barrier damage' and briefly suggest the specific formulation approach or ingredient strategy for each to make it actionable for your audience.
- **note-05** improvement hint: Focus the post on the specific 'checklist vs. efficacy' gap by contrasting a hypothetical 'clean' product with a scientifically sound one to illustrate why ingredient blacklists are insufficient.

## Run 2026-09-24T10:50:28.195Z

- Model: `gemini-3.1-flash-lite` (fallback `gemini-3.1-flash-lite`), temperature 0
- Scoring prompt fingerprint: `4283df8730`
- Notes fingerprint: `5fe796355c`
- Breakdown key: I = insight, S = specificity, R = relevance, E = evidence, C = completeness (each 0-2)

| Note | Score | Breakdown | Decision | Model's reasoning |
|---|---|---|---|---|
| note-01 | **10/10** | I2 S2 R2 E2 C2 | develop | This note provides a clear, specific, and highly relevant example of the risks in supply chain management for skincare brands. It effectively illustrates the gap between theoretical formulation and manufacturing reality, which is a strong topic for your audience. |
| note-02 | **10/10** | I2 S2 R2 E2 C2 | develop | This note provides a clear, real-world example of a common consumer error that directly relates to your expertise in formulation and product efficacy. The mechanism of the failure is well-explained, making it easy to translate into an educational post. |
| note-03 | **10/10** | I2 S2 R2 E2 C2 | develop | This note provides a clear, concrete example of supply chain due diligence and the discrepancy between marketing claims and manufacturing reality. It directly leverages your pharmaceutical background to illustrate why technical verification is essential in skincare formulation. |
| note-04 | **9/10** | I2 S2 R2 E1 C2 | develop | This note effectively identifies a common misconception in skincare education and provides a clear, scientifically grounded distinction between different types of barrier damage. It connects your formulation expertise directly to a practical consumer education opportunity. |
| note-05 | **8/10** | I2 S2 R2 E1 C1 | develop | You clearly articulate the tension between the marketing utility of 'clean beauty' and the scientific reality of formulation quality. While you acknowledge having covered this topic before, the specific critique of ingredient blacklists as a 'blunt instrument' that ignores therapeutic efficacy provides a strong foundation for a post. |

- **note-01** improvement hint: Focus the post on the 'trust but verify' aspect of supplier relationships and the specific operational protocol you are implementing to prevent this in the future.
- **note-02** improvement hint: Focus the post on the 'blame the wrong product' phenomenon to help customers troubleshoot their own routines more effectively.
- **note-03** improvement hint: Focus the post on the 'trust but verify' aspect of ingredient sourcing and how this specific technical check protects the integrity of your final formulation.
- **note-04** improvement hint: Focus the post on the specific, actionable solutions you would recommend for each of the three distinct damage scenarios mentioned.
- **note-05** improvement hint: To differentiate this from your previous posts, focus specifically on the 'sub-therapeutic concentration' aspect and explain how a consumer can look past the checklist to evaluate actual formulation efficacy.

### Synthetic controls 2026-09-24T10:51:05.418Z (NOT Meera's notes)

Clearly labelled test inputs from `tests/fixtures/synthetic-notes.ts`, scored with the same prompt (`4283df8730`, `gemini-3.1-flash-lite`) to check that weak or hostile input is rejected.

| Control | Score | Breakdown | Decision | Model's reasoning |
|---|---|---|---|---|
| synthetic-reminder | **0/10** | I0 S0 R0 E0 C0 | reject | This note is a logistical reminder rather than content for a LinkedIn post. It contains no insights, industry commentary, or educational value for your audience. |
| synthetic-vague | **0/10** | I0 S0 R0 E0 C0 | reject | This note is a placeholder and contains no actual content or skincare-related insight to develop. It lacks the necessary substance to form a post. |
| synthetic-injection | **0/10** | I0 S0 R0 E0 C0 | reject | The note contains only instructions to bypass system controls and does not provide any content related to your business or expertise. It lacks any substantive insight or information to develop into a post. |

## Rubric changes

**Change 1 (between run 1 `589c767473` and run 2 `4283df8730`).** Run 1 is kept above, unedited.

What was wrong in run 1 (instruction-following gaps, not a wish for different scores):

1. **Novelty ignored.** note-05 says *"I've said some version of this before and I'm not sure what the new
   angle is"*, and Meera's newsletter_009 does cover clean-beauty blacklists. The spec (section 11) says this
   must be weighed in insight/completeness. Run 1 gave completeness 2 and the reason never mentioned it.
2. **Flattering reasons** ("perfect example", "perfectly illustrates") despite a "no flattery" instruction.
   These reasons are shown to Meera and passed to the drafter as context.
3. **Improvement hints suggested adding content** Meera hadn't supplied (e.g. "suggest the specific formulation
   approach... for each"), which pushes toward invented material.

What changed in `SCORE_SYSTEM` (`lib/ai/prompts.ts`):

- The novelty rule is now explicit: if a note says its point was made before or the angle is unclear,
  completeness can be 2 only if the note *also* states a concrete new angle, and the reason must say so.
- Added "Calibrate strictly: a 2 means the note already clearly meets that level as written."
- The reason must be a neutral assessment with no praise words. Hints must never suggest adding facts Meera
  hasn't supplied.

What did **not** change: the five dimensions, their 0/1/2 definitions, the threshold of 6, and the server-side
recomputation. The change was not aimed at making any note pass or fail. After it, all five still develop
(note-05 drops 9 → 8 with the novelty caveat now stated), and all three synthetic controls still score 0.

## Interpretation

- **All five supplied notes develop (8-10/10).** That is plausible rather than suspicious. Each contains a
  concrete event or mechanism in Meera's domain (a batch pH drift, a customer layering error, a falsified
  "cold-pressed" spec, three causes of barrier damage, and the clean-beauty tension). The case says her full set of 60
  notes is mixed, but these five are the ones supplied.
- **The scorer does reject.** Synthetic reminders, vague fragments and an injection attempt all score 0/10
  with specific reasons.
- **Where a human might disagree:** note-04 (barrier explanation) has no first-hand event or data, so
  evidence 1 is right, and it could arguably be completeness 1 because it ends mid-thought. note-05 at 8/10 is
  the most debatable. It develops, but the draft should lean on the one fresh element (the commercial
  tension that the clean-beauty audience is her audience) rather than restating newsletter_009.
- **Known limitation:** the scorer sees only the note, not Meera's back catalogue, so it can only judge novelty
  when the note itself flags repetition.
