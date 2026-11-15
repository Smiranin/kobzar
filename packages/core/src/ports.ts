import type { Language } from './contract/common.js';
import type { EngineStatus } from './contract/health.js';

/** Raw PCM as the engine wants it: 16 kHz, mono, signed 16-bit little-endian, no header. */
export const PCM_SAMPLE_RATE = 16_000;
export const PCM_BYTES_PER_SAMPLE = 2;

export function pcmDurationMs(pcm: Uint8Array): number {
  return Math.round((pcm.byteLength / PCM_BYTES_PER_SAMPLE / PCM_SAMPLE_RATE) * 1000);
}

export interface DecodedRecording {
  pcm: Uint8Array;
  durationMs: number;
}

/** Turns a Recording in any container into PCM. Implemented with ffmpeg. */
export interface AudioDecoder {
  /**
   * Decodes at most `maxSeconds + 1` seconds, so a forgotten recording is cut early and is still
   * known to be too long. Throws `UnreadableRecordingError`.
   */
  decode(input: { path: string; maxSeconds: number }): Promise<DecodedRecording>;
}

export interface RecognitionInput {
  pcm: Uint8Array;
  language: Language;
  modelPrompt: string;
  signal?: AbortSignal;
}

/** The speech recognition model. Implemented with whisper.cpp's `whisper-server`. */
export interface Recognizer {
  /** Loads the model; resolves once it is ready, rejects when it cannot be. */
  start(): Promise<void>;
  status(): EngineStatus;
  /** Throws `RecognizerNotReadyError`, `RecognitionFailedError`. */
  recognise(input: RecognitionInput): Promise<{ segments: string[] }>;
  stop(): Promise<void>;
}

export class UnreadableRecordingError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UnreadableRecordingError';
  }
}

export class RecognizerNotReadyError extends Error {
  constructor(readonly status: Exclude<EngineStatus, 'ready'>) {
    super(
      status === 'loading'
        ? 'The recognition model is still loading; try again in a few seconds.'
        : 'The recognition engine has failed; restart Kobzar.',
    );
    this.name = 'RecognizerNotReadyError';
  }
}

export class RecognitionFailedError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RecognitionFailedError';
  }
}
