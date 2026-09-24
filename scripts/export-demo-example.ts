// Exports one REAL pipeline run (note -> score -> news decision -> draft) from Supabase into
// data/demo-example.json for the public page. Nothing on the page's example is typed by hand.
// Usage:  npx tsx --env-file=.env.local scripts/export-demo-example.ts <noteId> "<news decision text from logs>"
import { writeFileSync } from 'node:fs';
import { supabaseAdmin } from '../lib/supabase/client';

async function main() {
  const [noteId, newsDecision] = process.argv.slice(2);
  if (!noteId) throw new Error('Usage: export-demo-example.ts <noteId> "<news decision>"');
  const db = supabaseAdmin();
  const { data: note, error: e1 } = await db.from('notes').select('*').eq('id', noteId).single();
  if (e1 || !note) throw new Error(`note not found: ${e1?.message}`);
  const { data: draft, error: e2 } = await db.from('drafts').select('*').eq('note_id', noteId).single();
  if (e2 || !draft) throw new Error(`draft not found: ${e2?.message}`);
  const example = {
    provenance:
      'Real output of the pipeline code with real Telegram, Gemini, Google News RSS and Supabase (run from the local poller, the same code path as the webhook) during end-to-end testing on ' +
      `${note.created_at.slice(0, 10)}. The note is supplied case note 01. The draft was reviewed during testing, not by Meera, and has not been published.`,
    runAt: note.created_at,
    noteSource: 'Supplied case note 01 (data/seed-notes/note-01.txt)',
    rawNote: note.raw_text,
    score: {
      insight: note.score_insight,
      specificity: note.score_specificity,
      relevance: note.score_relevance,
      evidence: note.score_evidence,
      completeness: note.score_completeness,
      total: note.total_score,
      decision: note.score_decision,
      reason: note.score_reason,
      model: 'gemini-3.1-flash-lite',
    },
    research: { keywords: note.keywords, searchQuery: note.search_query, newsUsed: draft.news_used, decision: newsDecision ?? null },
    draft: { text: draft.draft_text, model: draft.drafting_model, warnings: draft.review_warnings, unsupportedFigures: draft.unsupported_figures },
  };
  writeFileSync('data/demo-example.json', JSON.stringify(example, null, 2) + '\n');
  console.log(`Wrote data/demo-example.json (score ${note.total_score}/10, draft ${draft.draft_text.length} chars)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
