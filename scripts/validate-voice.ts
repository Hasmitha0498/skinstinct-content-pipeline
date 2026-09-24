// Generates drafts from supplied notes with the real drafting prompt + Voice Skill, for qualitative
// comparison against the 15 published pieces. Output is appended to docs/voice-validation-drafts.md.
// Usage:  npm run eval:voice -- 01 03            (voice only, no news)
//         npm run eval:voice -- 01 --with-news   (also runs keywords -> Google News RSS -> relevance)
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { recentItems, searchGoogleNews } from '../lib/news/google-news';
import { draftMessage } from '../lib/telegram/messages';
import type { NewsDecision } from '../lib/types';
import { VOICE_SKILL_FILE } from '../lib/voice-skill';
import { draftPromptVersion, liveAi, pause } from './live-ai';

const OUT = path.join(process.cwd(), 'docs', 'voice-validation-drafts.md');

async function main() {
  const args = process.argv.slice(2);
  const withNews = args.includes('--with-news');
  const ids = args.filter((a) => !a.startsWith('--'));
  const noteIds = ids.length ? ids : ['01', '03'];
  const { ai, settings } = liveAi();
  const voice = await readFile(VOICE_SKILL_FILE, 'utf8');
  let out = `\n## Run ${new Date().toISOString()}\n\n- Drafting model: \`${settings.models.drafting}\` (fallback \`${settings.models.fallback ?? 'none'}\`), temperature 0.7\n- Drafting prompt + Voice Skill fingerprint: \`${draftPromptVersion(voice)}\`\n- News: ${withNews ? 'live Google News RSS + relevance check' : 'disabled (voice-only comparison)'}\n`;

  for (const id of noteIds) {
    const note = (await readFile(path.join(process.cwd(), 'data', 'seed-notes', `note-${id}.txt`), 'utf8')).trim();
    const score = await ai.score(note);
    await pause(3000);
    let news: NewsDecision | null = null;
    let newsLog = '';
    if (withNews) {
      const kw = await ai.keywords(note);
      const result = await searchGoogleNews(kw.search_query);
      const candidates = recentItems(result.items, settings.newsMaxAgeDays).slice(0, 5);
      newsLog = `- Search query: \`${kw.search_query}\`; RSS ${result.ok ? `returned ${result.items.length} items, ${candidates.length} recent` : `unavailable (${result.reason})`}\n`;
      if (candidates.length) {
        await pause(3000);
        const candidateList = candidates.map((c) => `  - "${c.title}" (${c.source ?? 'no source'}, ${c.publishedAt?.slice(0, 10) ?? 'no date'})`).join('\n');
        newsLog += `- Candidates offered to the relevance check:\n${candidateList}\n`;
        try {
          const evaluation = await ai.evaluateNews(note, candidates, settings.newsRelevanceThreshold);
          news = evaluation.decision;
          newsLog += `- Relevance: ${news ? `used "${news.item.title}" (confidence ${news.confidence}; ${news.reason})` : `none used (${evaluation.rejectedBecause})`}\n`;
        } catch (error) {
          // Same behaviour as production: a failed relevance check means "draft without news".
          newsLog += `- Relevance check failed (${error instanceof Error ? error.message.slice(0, 120) : 'error'}); drafted without news\n`;
        }
      }
      await pause(3000);
    }
    const draft = await ai.draft({ note, scoreReason: score.reason, voiceSkill: voice, news });
    const message = draftMessage({ score: score.total_score, post: draft.post, news: draft.newsUsed && news ? news.item : null, unsupportedFigures: draft.unsupportedFigures, warnings: draft.warnings });
    out += `\n### note-${id} (score ${score.total_score}/10)\n\n${newsLog}- Written by: \`${draft.model}\`${draft.model === settings.models.drafting ? '' : ' (fallback: primary model unavailable)'}\n- Characters: ${draft.post.length}; unsupported figures: ${draft.unsupportedFigures.join(', ') || 'none'}\n\n\`\`\`text\n${message}\n\`\`\`\n`;
    console.log(`note-${id}: drafted ${draft.post.length} chars`);
    await pause(4000);
  }
  await appendFile(OUT, out);
  console.log(`Appended to ${path.relative(process.cwd(), OUT)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
