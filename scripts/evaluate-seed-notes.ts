// Runs the REAL scoring prompt over the five supplied case notes and APPENDS the results to
// docs/seed-note-evaluation.md. Earlier runs are never rewritten.
// Usage:  npm run eval:seed-notes
import { appendFile, readdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fingerprint, liveAi, pause, scorePromptVersion } from './live-ai';

const NOTES_DIR = path.join(process.cwd(), 'data', 'seed-notes');
const REPORT = path.join(process.cwd(), 'docs', 'seed-note-evaluation.md');

const HEADER = `# Seed note evaluation

The five raw notes supplied with the case (\`data/seed-notes/\`, copied verbatim from \`Note 01-05.rtf\`) scored by the
real production scoring prompt (\`lib/ai/prompts.ts\` -> \`SCORE_SYSTEM\`) through Gemini. The total and the
develop/reject decision are recomputed in code from the five dimension scores (threshold: 6).

Runs are appended by \`npm run eval:seed-notes\` and never edited afterwards. If the rubric changes, a new run is
added with a new prompt fingerprint, and the change is explained under "Rubric changes".
`;

async function main() {
  const { ai, settings } = liveAi();
  const files = (await readdir(NOTES_DIR)).filter((f) => f.endsWith('.txt')).sort();
  const rows: string[] = [];
  const details: string[] = [];

  for (const [i, file] of files.entries()) {
    if (i > 0) await pause(4000); // stay inside free-tier per-minute limits
    const note = (await readFile(path.join(NOTES_DIR, file), 'utf8')).trim();
    const s = await ai.score(note);
    const id = file.replace('.txt', '');
    const breakdown = `I${s.insight} S${s.specificity} R${s.relevance} E${s.evidence} C${s.completeness}`;
    rows.push(`| ${id} | **${s.total_score}/10** | ${breakdown} | ${s.decision} | ${s.reason.replace(/\|/g, '/').replace(/\n/g, ' ')} |`);
    details.push(`- **${id}** improvement hint: ${s.improvement_hint.replace(/\n/g, ' ')}`);
    console.log(`${id}: ${s.total_score}/10 (${breakdown}) ${s.decision}`);
  }

  const exists = await access(REPORT).then(() => true, () => false);
  if (!exists) await writeFile(REPORT, HEADER);
  const run = `
## Run ${new Date().toISOString()}

- Model: \`${settings.models.scoring}\` (fallback \`${settings.models.fallback ?? 'none'}\`), temperature 0
- Scoring prompt fingerprint: \`${scorePromptVersion()}\`
- Notes fingerprint: \`${fingerprint(files.join(','))}\`
- Breakdown key: I = insight, S = specificity, R = relevance, E = evidence, C = completeness (each 0-2)

| Note | Score | Breakdown | Decision | Model's reasoning |
|---|---|---|---|---|
${rows.join('\n')}

${details.join('\n')}
`;
  await appendFile(REPORT, run);
  console.log(`\nAppended run to ${path.relative(process.cwd(), REPORT)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
