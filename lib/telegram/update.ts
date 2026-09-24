// Parses a raw Telegram update into one of the few things this bot understands.
// Validation is deliberately lenient about fields we don't use, so new Telegram fields never break us,
// and anything unrecognised becomes "ignored" or "unsupported" instead of an exception.
import { z } from 'zod';
import type { UpdateKind } from '../types';

const messageSchema = z
  .object({
    message_id: z.number().int(),
    chat: z.object({ id: z.number().int() }).passthrough(),
    from: z.object({ is_bot: z.boolean().optional() }).passthrough().optional(),
    text: z.string().optional(),
    voice: z.object({ file_id: z.string(), mime_type: z.string().optional(), file_size: z.number().optional(), duration: z.number().optional() }).passthrough().optional(),
    audio: z.object({ file_id: z.string(), mime_type: z.string().optional(), file_size: z.number().optional(), duration: z.number().optional() }).passthrough().optional(),
    reply_to_message: z.object({ message_id: z.number().int() }).passthrough().optional(),
  })
  .passthrough();

const updateSchema = z
  .object({
    update_id: z.number().int(),
    message: messageSchema.optional(),
    channel_post: messageSchema.optional(), // Meera may use a private channel; the bot must be an admin there
  })
  .passthrough();

export type ReviewCommand = 'APPROVE' | 'REJECT';

interface Base {
  updateId: number;
}
interface InChat extends Base {
  chatId: number;
  messageId: number;
}

export type ParsedUpdate =
  | (InChat & { kind: 'text_note'; text: string })
  | (InChat & { kind: 'voice_note'; fileId: string; mimeType?: string; fileSize?: number; durationSec?: number })
  | (InChat & { kind: 'review_command'; command: ReviewCommand; replyToMessageId: number | null })
  | (InChat & { kind: 'bot_command'; command: string })
  | (InChat & { kind: 'unsupported' })
  | (Base & { kind: 'ignored'; chatId: number | null; why: string });

/** Exact words, case-insensitive, surrounding whitespace and a trailing full stop/exclamation tolerated. */
export function parseReviewCommand(text: string): ReviewCommand | null {
  const word = text.trim().replace(/[.!]+$/, '').toUpperCase();
  return word === 'APPROVE' || word === 'REJECT' ? word : null;
}

/** Returns null only when the body isn't a Telegram update at all (no numeric update_id). */
export function parseUpdate(body: unknown): ParsedUpdate | null {
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    const id = (body as { update_id?: unknown } | null)?.update_id;
    return typeof id === 'number' && Number.isInteger(id) ? { kind: 'ignored', updateId: id, chatId: null, why: 'malformed update' } : null;
  }
  const update = parsed.data;
  const message = update.message ?? update.channel_post;
  if (!message) return { kind: 'ignored', updateId: update.update_id, chatId: null, why: 'not a new message (edit, callback, membership change...)' };
  if (message.from?.is_bot) return { kind: 'ignored', updateId: update.update_id, chatId: message.chat.id, why: 'message from a bot' };

  const base = { updateId: update.update_id, chatId: message.chat.id, messageId: message.message_id };
  if (typeof message.text === 'string') {
    const text = message.text.trim();
    if (!text) return { ...base, kind: 'unsupported' };
    const review = parseReviewCommand(text);
    if (review) return { ...base, kind: 'review_command', command: review, replyToMessageId: message.reply_to_message?.message_id ?? null };
    if (text.startsWith('/')) return { ...base, kind: 'bot_command', command: text.split(/[\s@]/)[0]!.toLowerCase() };
    return { ...base, kind: 'text_note', text };
  }
  const audio = message.voice ?? message.audio;
  if (audio) {
    return { ...base, kind: 'voice_note', fileId: audio.file_id, mimeType: audio.mime_type, fileSize: audio.file_size, durationSec: audio.duration };
  }
  return { ...base, kind: 'unsupported' }; // stickers, photos, documents, video, location...
}

export function updateKind(parsed: ParsedUpdate): UpdateKind {
  return parsed.kind;
}
