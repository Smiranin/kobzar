import { LANGUAGES, MAX_RECORDING_SECONDS, MODES, type HealthResponse } from '@kobzar/core';
import type { FastifyInstance } from 'fastify';
import type { ServiceContext } from '../context.js';

export function registerHealthRoutes(app: FastifyInstance, ctx: ServiceContext): void {
  app.get('/v1/health', async (): Promise<HealthResponse> => ({
    status: ctx.recognizer.status(),
    version: ctx.version,
    defaultLanguage: ctx.settings.defaultLanguage,
    languages: [...LANGUAGES],
    modes: [...MODES],
    maxRecordingSeconds: MAX_RECORDING_SECONDS,
  }));
}
