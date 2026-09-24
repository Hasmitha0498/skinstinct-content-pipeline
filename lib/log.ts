// Structured JSON logs (one line per event) that Vercel shows under Logs. Every call passes IDs such as
// updateId / noteId / draftId / stage. Values are scrubbed so a secret can't leak through an error message.

type Level = 'info' | 'warn' | 'error';
export type LogFields = Record<string, string | number | boolean | null | undefined>;

const SECRET_PATTERNS: RegExp[] = [
  /bot\d{5,}:[A-Za-z0-9_-]{20,}/g, // Telegram bot token (also inside api.telegram.org URLs)
  /\d{5,}:[A-Za-z0-9_-]{30,}/g, // bare Telegram bot token
  /AIza[0-9A-Za-z_-]{20,}/g, // Google API key
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT (Supabase keys)
  /sb_(secret|publishable)_[A-Za-z0-9_-]{10,}/g, // Supabase new-style keys
  /([?&](key|token|apikey)=)[^&\s]+/gi,
];

export function redact(text: string): string {
  return SECRET_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, (m, p1?: string) => (typeof p1 === 'string' && m.startsWith(p1) ? `${p1}[redacted]` : '[redacted]')), text);
}

/** A short, secret-free description of any thrown value, for logs and error_message columns. */
export function describeError(error: unknown): string {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return redact(raw).slice(0, 500);
}

function write(level: Level, event: string, fields: LogFields = {}): void {
  const clean: LogFields = {};
  for (const [k, v] of Object.entries(fields)) clean[k] = typeof v === 'string' ? redact(v) : v;
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...clean });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields?: LogFields) => write('info', event, fields),
  warn: (event: string, fields?: LogFields) => write('warn', event, fields),
  error: (event: string, fields?: LogFields) => write('error', event, fields),
};
