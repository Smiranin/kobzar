import type { FastifyReply } from 'fastify';

/** Aborts when the Client closes the connection before its answer is written. */
export function abandonSignal(reply: FastifyReply): AbortSignal {
  const controller = new AbortController();
  reply.raw.on('close', () => {
    if (!reply.raw.writableFinished) controller.abort();
  });
  return controller.signal;
}
