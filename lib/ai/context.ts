// What every AI step needs: how to reach Gemini, which models to use, and retry tuning (tests shorten it).
import type { GeminiTransport, RetryOptions } from './gemini';
import type { PipelineSettings } from '../config';

export interface AiContext {
  transport: GeminiTransport;
  models: PipelineSettings['models'];
  retry?: Partial<RetryOptions>;
}

/** Primary model first, then the configured fallback (if different). */
export function modelChain(primary: string, ctx: AiContext): string[] {
  return ctx.models.fallback && ctx.models.fallback !== primary ? [primary, ctx.models.fallback] : [primary];
}
