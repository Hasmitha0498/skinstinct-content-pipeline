// Thin wrapper around the official Gemini SDK (@google/genai). Every call asks for JSON matching a schema
// and the answer is validated again with Zod on our side: nothing free-form from the model is trusted.
// The SDK's network layer is injected as a "transport" so tests never call the real API.
import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { z } from 'zod';
import { describeError, log } from '../log';

export type GeminiPart = { text: string } | { inlineData: { data: string; mimeType: string } };

export interface GeminiRequest {
  model: string;
  systemInstruction: string;
  parts: GeminiPart[];
  responseJsonSchema: Record<string, unknown>;
  temperature: number;
  lowThinking: boolean;
}

/** Sends one request and returns the raw response text. Throws on HTTP/network errors. */
export type GeminiTransport = (request: GeminiRequest) => Promise<string | undefined>;

export type GeminiErrorKind = 'rate_limited' | 'unavailable' | 'invalid_output' | 'rejected';

export class GeminiError extends Error {
  constructor(
    readonly kind: GeminiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

export function createGeminiTransport(apiKey: string): GeminiTransport {
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 45_000 } });
  return async (request) => {
    const response = await ai.models.generateContent({
      model: request.model,
      contents: [{ role: 'user', parts: request.parts }],
      config: {
        systemInstruction: request.systemInstruction,
        responseMimeType: 'application/json',
        responseJsonSchema: request.responseJsonSchema,
        temperature: request.temperature,
        ...(request.lowThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
      },
    });
    return response.text;
  };
}

export interface JsonCall<T> {
  label: string; // e.g. "score_note", for logs
  models: string[]; // primary first, then fallbacks
  system: string;
  parts: GeminiPart[];
  jsonSchema: Record<string, unknown>;
  schema: z.ZodType<T>;
  temperature: number;
  lowThinking?: boolean;
  logFields?: Record<string, string | number>;
}

export interface RetryOptions {
  attemptsPerModel: number;
  baseDelayMs: number;
  maxRateLimitWaitMs: number;
  sleep: (ms: number) => Promise<void>;
}

const defaultRetry: RetryOptions = {
  attemptsPerModel: 2,
  baseDelayMs: 1500,
  maxRateLimitWaitMs: 20_000,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

type Classified = { retry: 'same_model' | 'next_model' | 'never'; kind: GeminiErrorKind; waitMs?: number };

function statusOf(error: unknown): number | null {
  if (error instanceof ApiError) return error.status;
  const match = String(error instanceof Error ? error.message : error).match(/"code":\s*(\d{3})|\b(429|500|502|503|504)\b/);
  return match ? Number(match[1] ?? match[2]) : null;
}

/** Gemini 429 bodies say e.g. "Please retry in 17.7s". */
export function retryHintMs(error: unknown): number | null {
  const match = String(error instanceof Error ? error.message : error).match(/retry in ([\d.]+)s/i);
  return match ? Math.ceil(Number(match[1]) * 1000) + 250 : null;
}

function classify(error: unknown): Classified {
  if (error instanceof OutputError) return { retry: 'same_model', kind: 'invalid_output' };
  const status = statusOf(error);
  if (status === 429) return { retry: 'same_model', kind: 'rate_limited', waitMs: retryHintMs(error) ?? undefined };
  if (status !== null && status >= 500) return { retry: 'same_model', kind: 'unavailable' };
  if (status === 404) return { retry: 'next_model', kind: 'rejected' }; // model id not available to this key
  if (status !== null && status >= 400) return { retry: 'never', kind: 'rejected' }; // bad request / auth: retrying won't help
  // No HTTP status: network failure or timeout. Transient.
  return { retry: 'same_model', kind: 'unavailable' };
}

class OutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutputError';
  }
}

function parseJson(text: string | undefined): unknown {
  if (!text?.trim()) throw new OutputError('empty response');
  const unfenced = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(unfenced);
  } catch {
    throw new OutputError('response was not valid JSON');
  }
}

/** Calls Gemini with limited retries, returning schema-validated data or throwing GeminiError. */
export async function generateJson<T>(transport: GeminiTransport, call: JsonCall<T>, retry: Partial<RetryOptions> = {}): Promise<T> {
  const opts = { ...defaultRetry, ...retry };
  const models = [...new Set(call.models.filter(Boolean))];
  const noThinkingModels = new Set<string>();
  let last: Classified = { retry: 'never', kind: 'unavailable' };
  let lastMessage = 'no attempt made';

  for (const model of models) {
    for (let attempt = 1; attempt <= opts.attemptsPerModel; attempt++) {
      const started = Date.now();
      try {
        const text = await transport({
          model,
          systemInstruction: call.system,
          parts: call.parts,
          responseJsonSchema: call.jsonSchema,
          temperature: call.temperature,
          lowThinking: Boolean(call.lowThinking) && !noThinkingModels.has(model),
        });
        const parsed = call.schema.safeParse(parseJson(text));
        if (!parsed.success) {
          throw new OutputError(`schema validation failed: ${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ')}`);
        }
        return parsed.data;
      } catch (error) {
        // Some models reject the thinking setting with a 400; retry that model once without it.
        if (call.lowThinking && !noThinkingModels.has(model) && statusOf(error) === 400 && /thinking/i.test(String(error))) {
          noThinkingModels.add(model);
          attempt--;
          continue;
        }
        last = classify(error);
        lastMessage = describeError(error);
        log.warn('gemini.attempt_failed', {
          ...call.logFields,
          call: call.label,
          model,
          attempt,
          kind: last.kind,
          ms: Date.now() - started,
          error: lastMessage.slice(0, 200),
        });
        if (last.retry === 'never') throw new GeminiError(last.kind, `${call.label}: ${lastMessage}`);
        if (last.retry === 'next_model') break;
        if (attempt < opts.attemptsPerModel) {
          const backoff = opts.baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
          await opts.sleep(Math.min(Math.max(backoff, last.waitMs ?? 0), opts.maxRateLimitWaitMs));
        }
      }
    }
  }
  throw new GeminiError(last.kind, `${call.label}: all attempts failed (${lastMessage})`);
}
