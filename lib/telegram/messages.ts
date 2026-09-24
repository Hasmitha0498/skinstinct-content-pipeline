// Every message the bot sends lives here. Plain text only (no Markdown), so formatting can never fail.
// Messages never include stack traces, error details, or configuration.
import type { DraftRow, NewsItem, NoteScore } from '../types';

export const RULE = '─────────────────────────────────';
const SHORT_RULE = '─────────────────';

export const MSG = {
  help:
    'Send me a note, typed or as a voice note.\n\n' +
    "I'll score whether it's worth developing (out of 10). Notes scoring 6 or more get a LinkedIn draft in your voice, " +
    'sometimes with a current news angle if one genuinely fits.\n\n' +
    'Reply to a draft with APPROVE or REJECT. Nothing is ever published for you: approved drafts are saved for you to publish manually.',
  unsupported: 'I can currently process text and voice notes.',
  notAllowed: 'This bot is private and only works for its owner.',
  transcriptionFailed:
    "I couldn't reliably transcribe this voice note, so I didn't create a draft. Please resend it or send the note as text.",
  voiceTooLarge: 'That voice note is too large for me to download (the limit is 20 MB). Please send a shorter one or type the note.',
  scoringFailed:
    "Your note is saved, but I couldn't score it right now because the AI service didn't respond properly. Please send it again in a few minutes.",
  draftingFailed:
    "Your note scored well and is saved, but I couldn't generate the draft right now. Please send the note again in a few minutes.",
  voiceSkillMissing:
    "Your note is saved, but I couldn't load your Voice Skill, so I didn't draft anything rather than write in a generic voice. Please check the voice_skills table.",
  storageFailed: "Something went wrong saving your note, so I haven't processed it. Please send it again in a minute.",
  noPendingDraft: "There isn't a pending draft to review.",
  multiplePending: 'You have multiple pending drafts. Please reply directly to the draft you want to approve or reject.',
  replyNotADraft:
    "I couldn't match that reply to a draft. Reply directly to the draft message itself (the one that ends with the APPROVE/REJECT instruction).",
  approved: "Approved and saved. This draft has NOT been published. Review/edit it as needed and publish manually when you're ready.",
  rejected: 'Rejected and saved. The draft and your original note are kept for reference; nothing was deleted.',
  reviewFailed: "I couldn't record that decision just now. Please try again in a minute; the draft is unchanged.",
};

export function alreadyReviewed(status: DraftRow['status']): string {
  return `That draft was already ${status}. Decisions are final, so nothing changed.`;
}

export function rejectionMessage(score: NoteScore): string {
  const hint = score.improvement_hint ? `\n\n${score.improvement_hint}` : '\n\nAdd the concrete example or observation and send it again.';
  return `Not drafting this one yet: ${score.total_score}/10.\n\nReason: ${score.reason}${hint}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'date not provided';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

/** The mandatory verification block. Only ever built from fields actually retrieved from Google News. */
export function newsSourceBlock(item: Pick<NewsItem, 'title' | 'source' | 'publishedAt' | 'link'>): string {
  return [
    RULE,
    `NEWS SOURCE: ${item.title}`,
    `FROM: ${item.source ?? 'publication not provided'} · ${formatDate(item.publishedAt)}`,
    `LINK: ${item.link}`,
    '⚠ Check this before publishing — you are the author of this claim',
    RULE,
  ].join('\n');
}

export interface DraftMessageInput {
  score: number;
  post: string;
  news: Pick<NewsItem, 'title' | 'source' | 'publishedAt' | 'link'> | null; // only when the post used it
  unsupportedFigures: string[];
}

export function draftMessage(input: DraftMessageInput): string {
  const parts = [`Draft ready — score ${input.score}/10`, input.post];
  if (input.news) parts.push(newsSourceBlock(input.news));
  if (input.unsupportedFigures.length) {
    parts.push(`⚠ These figures aren't in your note or the news metadata. Check or remove them: ${input.unsupportedFigures.join(', ')}`);
  }
  if (input.post.length > 3000) parts.push(`Note: this draft is ${input.post.length} characters; LinkedIn allows 3,000.`);
  parts.push(`${SHORT_RULE}\nReply to this message with APPROVE or REJECT.`);
  return parts.join('\n\n');
}
