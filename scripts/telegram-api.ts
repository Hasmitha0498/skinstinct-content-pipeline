// Tiny helper for the CLI scripts: calls a Telegram Bot API method without ever printing the token.
import { readEnv, requireEnv } from '../lib/config';
import { redact } from '../lib/log';

export async function telegramCall<T>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const token = requireEnv('TELEGRAM_BOT_TOKEN', readEnv());
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(40_000),
  });
  const data = (await response.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok || data.result === undefined) throw new Error(`Telegram ${method} failed: ${redact(data.description ?? `HTTP ${response.status}`)}`);
  return data.result;
}
