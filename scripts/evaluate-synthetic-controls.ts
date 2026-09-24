// Runs the real scoring prompt over SYNTHETIC control notes (written for testing, not Meera's notes) to
// check that the scorer rejects weak input and resists prompt injection. Appends to the evaluation report.
// Usage:  npm run eval:controls
import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { SYNTHETIC_INJECTION, SYNTHETIC_REMINDER, SYNTHETIC_VAGUE } from '../tests/fixtures/synthetic-notes';
import { liveAi, pause, scorePromptVersion } from './live-ai';

const CONTROLS = [
  { id: 'synthetic-reminder', note: SYNTHETIC_REMINDER },
  { id: 'synthetic-vague', note: SYNTHETIC_VAGUE },
  { id: 'synthetic-injection', note: SYNTHETIC_INJECTION },
];

async function main() {
  const { ai, settings } = liveAi();
  const rows: string[] = [];
  for (const [i, c] of CONTROLS.entries()) {
    if (i) await pause(4000);
    const s = await ai.score(c.note);
    rows.push(`| ${c.id} | **${s.total_score}/10** | I${s.insight} S${s.specificity} R${s.relevance} E${s.evidence} C${s.completeness} | ${s.decision} | ${s.reason.replace(/\|/g, '/')} |`);
    console.log(`${c.id}: ${s.total_score}/10 ${s.decision}`);
  }
  await appendFile(
    path.join(process.cwd(), 'docs', 'seed-note-evaluation.md'),
    `\n### Synthetic controls ${new Date().toISOString()} (NOT Meera's notes)\n\nClearly labelled test inputs from \`tests/fixtures/synthetic-notes.ts\`, scored with the same prompt (\`${scorePromptVersion()}\`, \`${settings.models.scoring}\`) to check that weak or hostile input is rejected.\n\n| Control | Score | Breakdown | Decision | Model's reasoning |\n|---|---|---|---|---|\n${rows.join('\n')}\n`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
