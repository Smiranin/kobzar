import { createReadStream } from 'node:fs';
import {
  diffWords,
  sampleFieldsSchema,
  sampleUpdateSchema,
  type Sample,
  type SampleRunResult,
  type SamplesList,
} from '@kobzar/core';
import type { FastifyInstance } from 'fastify';
import type { ServiceContext } from '../context.js';
import { parseWith } from '../errors.js';
import { readRecordingForm, requireRecording } from '../recordings.js';
import { decodeWithinLimit, transcribe } from '../transcribe.js';
import { abandonSignal } from './abandon.js';

interface IdParams {
  id: string;
}

/** The test page's API for the Samples; not part of the Client contract. */
export function registerSampleRoutes(app: FastifyInstance, ctx: ServiceContext): void {
  app.get('/v1/samples', async (): Promise<SamplesList> => ({ samples: await ctx.samples.list() }));

  app.post('/v1/samples', async (request, reply): Promise<Sample> => {
    const folder = await ctx.recordings.create();
    try {
      const form = await readRecordingForm(request, folder);
      const fields = parseWith(sampleFieldsSchema, form.fields, 'Fields');
      const recording = requireRecording(form);
      // Decoded once on save: to learn its length and to refuse what could never be run.
      const decoded = await decodeWithinLimit(ctx.decoder, recording.path);
      const sample = await ctx.samples.add({
        language: fields.language,
        expectedText: fields.expectedText,
        mimeType: recording.mimeType,
        durationMs: decoded.durationMs,
        recordingPath: recording.path,
      });
      // Returned, not sent: the answer then leaves after `finally` has removed the upload.
      reply.status(201);
      return sample;
    } finally {
      await ctx.recordings.discard(folder);
    }
  });

  app.patch<{ Params: IdParams }>('/v1/samples/:id', async (request): Promise<Sample> => {
    const { expectedText } = parseWith(sampleUpdateSchema, request.body, 'Body');
    return ctx.samples.update(request.params.id, expectedText);
  });

  app.delete<{ Params: IdParams }>('/v1/samples/:id', async (request, reply) => {
    await ctx.samples.remove(request.params.id);
    return reply.status(204).send();
  });

  app.get<{ Params: IdParams }>('/v1/samples/:id/recording', async (request, reply) => {
    const sample = await ctx.samples.get(request.params.id);
    return reply
      .type(sample.mimeType)
      .header('cache-control', 'no-store')
      .send(createReadStream(ctx.samples.recordingPath(sample)));
  });

  app.post<{ Params: IdParams }>(
    '/v1/samples/:id/run',
    async (request, reply): Promise<SampleRunResult> => {
      const sample = await ctx.samples.get(request.params.id);
      const result = await transcribe(
        {
          path: ctx.samples.recordingPath(sample),
          language: sample.language,
          hints: [],
          signal: abandonSignal(reply),
        },
        ctx,
      );
      return {
        sampleId: sample.id,
        expectedText: sample.expectedText,
        text: result.text,
        durationMs: result.durationMs,
        processingMs: result.processingMs,
        ...diffWords(sample.expectedText, result.text),
      };
    },
  );
}
