import {
  ERROR_STATUS,
  RecognitionFailedError,
  RecognizerNotReadyError,
  UnreadableRecordingError,
  type ErrorCode,
  type ErrorResponse,
} from '@kobzar/core';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError, z } from 'zod';
import { JobAbandonedError, QueueFullError } from './queue.js';

/** An expected failure: its code decides the HTTP status; the message is for the owner to read. */
export class KobzarError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'KobzarError';
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }
}

/** Parses a value with a schema; a mismatch is an `invalid_request` that lists the problems. */
export function parseWith<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new KobzarError('invalid_request', `${what}: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** The known failures of the ports and of Fastify, as a KobzarError; `undefined` for a fault. */
function toKobzarError(error: unknown): KobzarError | undefined {
  if (error instanceof KobzarError) return error;
  if (error instanceof UnreadableRecordingError) {
    return new KobzarError('unreadable_recording', error.message);
  }
  if (error instanceof RecognizerNotReadyError) return new KobzarError('not_ready', error.message);
  if (error instanceof RecognitionFailedError) {
    return new KobzarError('recognition_failed', error.message);
  }
  if (error instanceof QueueFullError) {
    return new KobzarError('busy', 'Kobzar is busy with other Recordings; try again shortly.');
  }
  if (error instanceof JobAbandonedError) {
    // Nobody reads this answer: the connection is already closed.
    return new KobzarError(
      'invalid_request',
      'The Client went away before its Recording was processed.',
    );
  }
  if (error instanceof ZodError) {
    return new KobzarError('invalid_request', z.prettifyError(error));
  }
  const fastifyError = error as Partial<FastifyError>;
  if (fastifyError.statusCode === 413) {
    return new KobzarError('recording_too_long', 'The Recording is larger than Kobzar accepts.');
  }
  if (fastifyError.statusCode === 404) {
    return new KobzarError('not_found', fastifyError.message ?? 'Not found.');
  }
  if (typeof fastifyError.statusCode === 'number' && fastifyError.statusCode < 500) {
    return new KobzarError('invalid_request', fastifyError.message ?? 'The request is invalid.');
  }
  return undefined;
}

export function errorBody(error: KobzarError): ErrorResponse {
  return { error: { code: error.code, message: error.message } };
}

/**
 * Renders every failure as `{ error: { code, message } }`. Expected failures are logged with their
 * code only; a fault is logged in full, because it is a bug and its message names no Transcript.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    const known = toKobzarError(error);
    if (known) {
      request.log.info({ code: known.code }, 'Request refused');
      return reply.status(known.status).send(errorBody(known));
    }
    request.log.error(error);
    const fault = new KobzarError('internal_error', 'Kobzar failed unexpectedly; see its log.');
    return reply.status(fault.status).send(errorBody(fault));
  });

  app.setNotFoundHandler((request, reply) => {
    const error = new KobzarError('not_found', `${request.method} ${request.url} does not exist.`);
    return reply.status(error.status).send(errorBody(error));
  });
}
