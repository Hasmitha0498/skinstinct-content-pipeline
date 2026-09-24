// Telegram update parsing and the Bot API client (retries, splitting, no token leakage).
import { describe, expect, it, vi } from 'vitest';
import { createTelegramApi, splitMessage, TelegramError } from '@/lib/telegram/client';
import { parseReviewCommand, parseUpdate } from '@/lib/telegram/update';

const TOKEN = '123456789:AAFakeTokenForTestsOnly_abcdefghijklmnop';
const ok = (result: unknown) => new Response(JSON.stringify({ ok: true, result }), { status: 200 });

describe('parseUpdate', () => {
  const base = { message_id: 5, date: 1, chat: { id: 9, type: 'private' } };

  it('recognises text, voice, audio, commands, review words and channel posts', () => {
    expect(parseUpdate({ update_id: 1, message: { ...base, text: 'a note' } })).toMatchObject({ kind: 'text_note', text: 'a note', chatId: 9 });
    expect(parseUpdate({ update_id: 2, message: { ...base, voice: { file_id: 'f', mime_type: 'audio/ogg' } } })).toMatchObject({ kind: 'voice_note', fileId: 'f' });
    expect(parseUpdate({ update_id: 3, message: { ...base, audio: { file_id: 'a' } } })).toMatchObject({ kind: 'voice_note', fileId: 'a' });
    expect(parseUpdate({ update_id: 4, message: { ...base, text: '/start' } })).toMatchObject({ kind: 'bot_command', command: '/start' });
    expect(parseUpdate({ update_id: 5, message: { ...base, text: 'Approve', reply_to_message: { message_id: 77 } } })).toMatchObject({ kind: 'review_command', command: 'APPROVE', replyToMessageId: 77 });
    expect(parseUpdate({ update_id: 6, channel_post: { ...base, text: 'channel note' } })).toMatchObject({ kind: 'text_note' });
    expect(parseUpdate({ update_id: 7, message: { ...base, sticker: {} } })).toMatchObject({ kind: 'unsupported' });
  });

  it('review words must be the whole message', () => {
    expect(parseReviewCommand(' reject ')).toBe('REJECT');
    expect(parseReviewCommand('APPROVE.')).toBe('APPROVE');
    expect(parseReviewCommand('I approve of this')).toBeNull();
    expect(parseReviewCommand('approved')).toBeNull();
  });

  it('ignores edits, bot messages and malformed messages, and rejects non-updates', () => {
    expect(parseUpdate({ update_id: 8, edited_message: { ...base, text: 'x' } })).toMatchObject({ kind: 'ignored' });
    expect(parseUpdate({ update_id: 9, message: { ...base, from: { is_bot: true }, text: 'x' } })).toMatchObject({ kind: 'ignored' });
    expect(parseUpdate({ update_id: 10, message: { chat: null } })).toMatchObject({ kind: 'ignored' });
    expect(parseUpdate('nonsense')).toBeNull();
  });
});

describe('Telegram client', () => {
  it('sends plain text (no parse_mode) replying to the original message', async () => {
    const fetchImpl = vi.fn(async () => ok({ message_id: 42 }));
    const api = createTelegramApi(TOKEN, fetchImpl);
    expect(await api.sendMessage(9, 'Hello *not markdown*', { replyToMessageId: 5 })).toBe(42);
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).not.toHaveProperty('parse_mode');
    expect(body.reply_parameters).toEqual({ message_id: 5, allow_sending_without_reply: true });
  });

  it('splits long messages and returns the last message id', async () => {
    let id = 0;
    const fetchImpl = vi.fn(async () => ok({ message_id: ++id }));
    const api = createTelegramApi(TOKEN, fetchImpl);
    const last = await api.sendMessage(9, 'para\n\n'.repeat(1500));
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
    expect(last).toBe(fetchImpl.mock.calls.length);
    for (const chunk of splitMessage('x '.repeat(5000))) expect(chunk.length).toBeLessThanOrEqual(4096);
  });

  it('retries 429 with retry_after, and does not retry 400', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 0.01 } }), { status: 429 }))
      .mockResolvedValueOnce(ok({ message_id: 1 }));
    await createTelegramApi(TOKEN, fetchImpl).sendMessage(9, 'x');
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const bad = vi.fn(async () => new Response(JSON.stringify({ ok: false, description: 'Bad Request: chat not found' }), { status: 400 }));
    await expect(createTelegramApi(TOKEN, bad).sendMessage(9, 'x')).rejects.toBeInstanceOf(TelegramError);
    expect(bad).toHaveBeenCalledOnce();
  });

  it('never puts the bot token in error messages', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      throw new Error(`fetch failed for ${url}`);
    });
    const error = await createTelegramApi(TOKEN, fetchImpl as unknown as typeof fetch).sendMessage(9, 'x').catch((e: unknown) => e);
    expect(String((error as Error).message)).not.toContain(TOKEN);
    expect(String((error as Error).message)).not.toContain('AAFake');
  }, 10_000);

  it('downloads a voice file via getFile, and refuses files over 20 MB', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok({ file_path: 'voice/file_1.oga', file_size: 3 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
    const bytes = await createTelegramApi(TOKEN, fetchImpl).downloadFile('fid');
    expect([...bytes]).toEqual([1, 2, 3]);
    expect(fetchImpl.mock.calls[1]![0]).toBe(`https://api.telegram.org/file/bot${TOKEN}/voice/file_1.oga`);

    const huge = vi.fn(async () => ok({ file_path: 'x', file_size: 25 * 1024 * 1024 }));
    await expect(createTelegramApi(TOKEN, huge).downloadFile('fid')).rejects.toThrow(/20 MB/);
  });
});
