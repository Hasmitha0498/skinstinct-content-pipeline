// Minimal Telegram Bot API client. Messages are sent as plain text (no parse_mode), so no Markdown/HTML
// escaping can ever make Telegram reject a draft. The bot token is part of every URL, so URLs are never
// logged; errors are reported by method name and Telegram's description only.

export const TELEGRAM_MESSAGE_LIMIT = 4096;
export const MAX_VOICE_BYTES = 20 * 1024 * 1024; // Bot API download limit, and Gemini's inline-request limit

export class TelegramError extends Error {
  constructor(
    readonly method: string,
    readonly status: number | null,
    description: string,
  ) {
    super(`Telegram ${method} failed${status ? ` (${status})` : ''}: ${description}`);
    this.name = 'TelegramError';
  }
}

export interface SendOptions {
  replyToMessageId?: number;
}

export interface TelegramApi {
  /** Sends text, splitting it if needed. Returns the id of the LAST message sent. */
  sendMessage(chatId: number, text: string, options?: SendOptions): Promise<number>;
  /** Downloads a file by file_id via getFile. Enforces a size limit. */
  downloadFile(fileId: string): Promise<Uint8Array>;
}

interface Envelope<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Splits on paragraph, then line, then hard boundaries so no chunk exceeds Telegram's limit. */
export function splitMessage(text: string, limit = TELEGRAM_MESSAGE_LIMIT): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    let cut = window.lastIndexOf('\n\n');
    if (cut < limit * 0.5) cut = window.lastIndexOf('\n');
    if (cut < limit * 0.5) cut = window.lastIndexOf(' ');
    if (cut <= 0) cut = limit;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export function createTelegramApi(token: string, fetchImpl: typeof fetch = fetch): TelegramApi {
  const base = `https://api.telegram.org/bot${token}`;

  async function call<T>(method: string, body: Record<string, unknown>, retries = 2): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      let status: number | null = null;
      let description = 'network error';
      let waitMs = 1000 * 2 ** attempt;
      try {
        const response = await fetchImpl(`${base}/${method}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        });
        status = response.status;
        const data = (await response.json().catch(() => ({ ok: false, description: 'non-JSON response' }))) as Envelope<T>;
        if (data.ok && data.result !== undefined) return data.result;
        description = data.description ?? `HTTP ${response.status}`;
        if (data.parameters?.retry_after) waitMs = data.parameters.retry_after * 1000;
      } catch (error) {
        description = error instanceof Error ? error.name : 'network error'; // never the message: it may contain the URL
      }
      // Retry only transient failures: rate limits, Telegram 5xx, network errors. Never 400/401/403.
      const transient = status === null || status === 429 || status >= 500;
      if (!transient || attempt >= retries || waitMs > 10_000) throw new TelegramError(method, status, description);
      await sleep(waitMs);
    }
  }

  return {
    async sendMessage(chatId, text, options = {}) {
      let lastId = 0;
      for (const [i, chunk] of splitMessage(text).entries()) {
        const message = await call<{ message_id: number }>('sendMessage', {
          chat_id: chatId,
          text: chunk,
          link_preview_options: { is_disabled: true },
          ...(i === 0 && options.replyToMessageId ? { reply_parameters: { message_id: options.replyToMessageId, allow_sending_without_reply: true } } : {}),
        });
        lastId = message.message_id;
      }
      return lastId;
    },

    async downloadFile(fileId) {
      const file = await call<{ file_path?: string; file_size?: number }>('getFile', { file_id: fileId });
      if (!file.file_path) throw new TelegramError('getFile', null, 'no file_path returned (file may be too large for bots)');
      if (file.file_size && file.file_size > MAX_VOICE_BYTES) throw new TelegramError('getFile', null, 'file larger than 20 MB');

      let response: Response;
      try {
        response = await fetchImpl(`https://api.telegram.org/file/bot${token}/${file.file_path}`, { signal: AbortSignal.timeout(20_000) });
      } catch (error) {
        throw new TelegramError('downloadFile', null, error instanceof Error ? error.name : 'network error');
      }
      if (!response.ok) throw new TelegramError('downloadFile', response.status, `HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_VOICE_BYTES) throw new TelegramError('downloadFile', null, 'file larger than 20 MB');
      return bytes; // kept in memory only; never written to disk or storage
    },
  };
}
