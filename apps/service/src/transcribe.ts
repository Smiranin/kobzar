import {
  MAX_RECORDING_SECONDS,
  type AudioDecoder,
  type DecodedRecording,
  RecognizerNotReadyError,
  buildModelPrompt,
  removeInventedPhrases,
  type DictionaryUsage,
  type Language,
} from '@kobzar/core';
import type { ServiceContext } from './context.js';
import { KobzarError } from './errors.js';

export interface TranscribeInput {
  /** The Recording on disk; the caller owns the file and deletes it. */
  path: string;
  language: Language;
  hints: string[];
  /** Aborted when the caller went away: a waiting job is then dropped. */
  signal?: AbortSignal;
}

export interface TranscribeResult {
  text: string;
  durationMs: number;
  /** Decode and recognition, excluding the time spent waiting in the queue. */
  processingMs: number;
  dictionary: DictionaryUsage;
}

/** Refuses at once when the engine is not ready, instead of decoding for nothing. */
export function assertReady(ctx: ServiceContext): void {
  const status = ctx.recognizer.status();
  if (status !== 'ready') throw new RecognizerNotReadyError(status);
}

/** Decodes a Recording and refuses one longer than the limit (SPEC requirement 10). */
export async function decodeWithinLimit(
  decoder: AudioDecoder,
  path: string,
): Promise<DecodedRecording> {
  const decoded = await decoder.decode({ path, maxSeconds: MAX_RECORDING_SECONDS });
  if (decoded.durationMs > MAX_RECORDING_SECONDS * 1000) {
    throw new KobzarError(
      'recording_too_long',
      `The Recording is longer than ${MAX_RECORDING_SECONDS / 60} minutes.`,
    );
  }
  return decoded;
}

/**
 * One Recording to its Transcript, shared by `POST /v1/transcripts` and a Sample run. It waits its
 * turn in the queue, so a run and a Client never recognise at the same time.
 */
export async function transcribe(
  input: TranscribeInput,
  ctx: ServiceContext,
): Promise<TranscribeResult> {
  assertReady(ctx);
  return ctx.queue.run(async () => {
    const started = performance.now();
    const decoded = await decodeWithinLimit(ctx.decoder, input.path);
    const [dictionary, inventedPhrases] = await Promise.all([
      ctx.localFiles.dictionary(),
      ctx.localFiles.inventedPhrases(),
    ]);
    const modelPrompt = buildModelPrompt({
      dictionary,
      hints: input.hints,
      language: input.language,
    });
    const { segments } = await ctx.recognizer.recognise({
      pcm: decoded.pcm,
      language: input.language,
      modelPrompt: modelPrompt.text,
      ...(input.signal && { signal: input.signal }),
    });
    return {
      text: removeInventedPhrases(segments, inventedPhrases),
      durationMs: decoded.durationMs,
      processingMs: Math.round(performance.now() - started),
      dictionary: { total: dictionary.length, used: modelPrompt.dictionaryUsed },
    };
  }, input.signal);
}
