// Voice note -> faithful transcript. On any doubt this throws; it never returns a guessed transcript.
import { transcriptionJsonSchema, transcriptionSchema } from '../validation/schemas';
import { generateJson } from './gemini';
import { modelChain, type AiContext } from './context';
import { TRANSCRIBE_SYSTEM, TRANSCRIBE_USER } from './prompts';

export class TranscriptionFailedError extends Error {
  constructor(reason: string) {
    super(`Transcription failed: ${reason}`);
    this.name = 'TranscriptionFailedError';
  }
}

/** Gemini accepts these audio types inline. Telegram voice notes are audio/ogg (Opus). */
const SUPPORTED_AUDIO = /^audio\/(ogg|opus|mpeg|mp3|mp4|m4a|x-m4a|aac|wav|x-wav|webm|flac)$/i;

export function normaliseAudioMime(mime: string | undefined): string {
  const m = (mime ?? 'audio/ogg').toLowerCase();
  if (m === 'audio/opus') return 'audio/ogg';
  if (m === 'audio/x-m4a' || m === 'audio/m4a') return 'audio/mp4';
  return m;
}

export async function transcribeAudio(
  ctx: AiContext,
  audio: Uint8Array,
  mimeType: string | undefined,
  logFields?: Record<string, string | number>,
): Promise<string> {
  const mime = normaliseAudioMime(mimeType);
  if (!SUPPORTED_AUDIO.test(mime)) throw new TranscriptionFailedError(`unsupported audio type ${mime}`);
  if (audio.byteLength === 0) throw new TranscriptionFailedError('empty audio file');

  let result;
  try {
    result = await generateJson(
      ctx.transport,
      {
        label: 'transcribe',
        models: modelChain(ctx.models.transcription, ctx),
        system: TRANSCRIBE_SYSTEM,
        parts: [{ inlineData: { data: Buffer.from(audio).toString('base64'), mimeType: mime } }, { text: TRANSCRIBE_USER }],
        jsonSchema: transcriptionJsonSchema,
        schema: transcriptionSchema,
        temperature: 0,
        lowThinking: true,
        logFields,
      },
      ctx.retry,
    );
  } catch (error) {
    throw new TranscriptionFailedError(error instanceof Error ? error.message : String(error));
  }

  const transcript = result.transcript.trim();
  if (!result.is_intelligible || transcript.length < 3) throw new TranscriptionFailedError('no intelligible speech');
  // If most of it is [inaudible], it's not reliable enough to build a post on.
  const inaudible = (transcript.match(/\[inaudible\]/gi) ?? []).length;
  const words = transcript.split(/\s+/).length;
  if (inaudible > 0 && inaudible * 4 >= words) throw new TranscriptionFailedError('transcript mostly inaudible');
  return transcript;
}
