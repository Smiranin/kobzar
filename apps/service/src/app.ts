import multipart from '@fastify/multipart';
import type { AudioDecoder, Recognizer, Settings } from '@kobzar/core';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ServiceContext } from './context.js';
import { registerErrorHandler } from './errors.js';
import { LocalFiles } from './local-files.js';
import { registerOriginGuard } from './origin-guard.js';
import { SerialQueue } from './queue.js';
import { MAX_BODY_BYTES, RecordingsFolder } from './recordings.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerSampleRoutes } from './routes/samples.js';
import { registerTranscriptRoutes } from './routes/transcripts.js';
import { SamplesStore } from './sample-store.js';
import { registerStatic } from './static.js';

/** Text fields are small: hints are at most 50 × 64 characters, an expected text 10 000. */
const MAX_FIELD_BYTES = 64 * 1024;
const MAX_FIELDS = 10;

export interface BuildAppOptions {
  settings: Settings;
  version: string;
  recognizer: Recognizer;
  decoder: AudioDecoder;
  /** Absolute paths, resolved by the caller. */
  dictionaryPath: string;
  inventedPhrasesPath: string;
  samplesDir: string;
  /** Kobzar's own folder for Recordings in flight. */
  recordingsDir: string;
  /** Directory of the built test page; served when it exists. */
  testPageDist?: string;
  logger?: boolean;
}

export interface BuiltApp {
  app: FastifyInstance;
  context: ServiceContext;
  /** Whether the built test page is served. */
  servesTestPage: boolean;
}

/** Wires the guard, the routes and the context; the composition root supplies ports and paths. */
export async function buildApp(options: BuildAppOptions): Promise<BuiltApp> {
  const app = Fastify({ logger: options.logger ?? false });
  registerErrorHandler(app);
  await registerOriginGuard(app, options.settings);
  await app.register(multipart, {
    limits: { fileSize: MAX_BODY_BYTES, files: 1, fields: MAX_FIELDS, fieldSize: MAX_FIELD_BYTES },
  });

  const context: ServiceContext = {
    settings: options.settings,
    version: options.version,
    recognizer: options.recognizer,
    decoder: options.decoder,
    queue: new SerialQueue(),
    localFiles: new LocalFiles(options.dictionaryPath, options.inventedPhrasesPath),
    recordings: new RecordingsFolder(options.recordingsDir),
    samples: new SamplesStore(options.samplesDir),
  };

  registerHealthRoutes(app, context);
  registerTranscriptRoutes(app, context);
  registerSampleRoutes(app, context);
  const servesTestPage = options.testPageDist
    ? await registerStatic(app, options.testPageDist)
    : false;

  return { app, context, servesTestPage };
}
