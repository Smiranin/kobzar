import {
  MODES,
  hintsSchema,
  transcriptFieldsSchema,
  type Language,
  type Mode,
  type TranscriptResponse,
} from '@kobzar/core';
import type { FastifyInstance } from 'fastify';
import type { ServiceContext } from '../context.js';
import { KobzarError, parseWith } from '../errors.js';
import { readRecordingForm, requireRecording, type RecordingForm } from '../recordings.js';
import { assertReady, transcribe } from '../transcribe.js';
import { abandonSignal } from './abandon.js';

interface TranscriptRequest {
  path: string;
  language: Language;
  hints: string[];
  mode: Mode;
}

function isMode(value: string): value is Mode {
  return (MODES as readonly string[]).includes(value);
}

/** Validates the form once every part is read; the Recording is already on disk. */
function parseTranscriptForm(form: RecordingForm, ctx: ServiceContext): TranscriptRequest {
  const fields = parseWith(transcriptFieldsSchema, form.fields, 'Fields');
  let hints: string[] = [];
  if (fields.hints !== undefined) {
    let raw: unknown;
    try {
      raw = JSON.parse(fields.hints);
    } catch {
      throw new KobzarError('invalid_request', 'hints must be a JSON array of strings.');
    }
    hints = parseWith(hintsSchema, raw, 'hints');
  }
  const mode = fields.mode ?? 'verbatim';
  if (!isMode(mode)) {
    throw new KobzarError(
      'unsupported_mode',
      `The mode "${mode}" is not supported; Kobzar supports ${MODES.join(', ')}.`,
    );
  }
  return {
    path: requireRecording(form).path,
    language: fields.language ?? ctx.settings.defaultLanguage,
    hints,
    mode,
  };
}

export function registerTranscriptRoutes(app: FastifyInstance, ctx: ServiceContext): void {
  app.post('/v1/transcripts', async (request, reply): Promise<TranscriptResponse> => {
    assertReady(ctx);
    const folder = await ctx.recordings.create();
    try {
      const form = await readRecordingForm(request, folder);
      const parsed = parseTranscriptForm(form, ctx);
      const result = await transcribe(
        {
          path: parsed.path,
          language: parsed.language,
          hints: parsed.hints,
          signal: abandonSignal(reply),
        },
        ctx,
      );
      // Durations and counts only: the Transcript, the hints and the Dictionary are never logged.
      request.log.info(
        {
          durationMs: result.durationMs,
          processingMs: result.processingMs,
          dictionary: result.dictionary,
          hints: parsed.hints.length,
        },
        'Transcript returned',
      );
      return { ...result, language: parsed.language, mode: parsed.mode };
    } finally {
      await ctx.recordings.discard(folder);
    }
  });
}
