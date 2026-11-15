import cors from '@fastify/cors';
import type { Settings } from '@kobzar/core';
import type { FastifyInstance } from 'fastify';
import { KobzarError, errorBody } from './errors.js';

/** The `Host` values Kobzar answers: its own loopback address and its tailnet address. */
export function allowedHosts(settings: Settings): Set<string> {
  const hosts = new Set([`127.0.0.1:${settings.port}`, `localhost:${settings.port}`]);
  if (settings.publicUrl) hosts.add(new URL(settings.publicUrl).host);
  return hosts;
}

/** The sites that may call Kobzar from a browser: its own test page and the listed ones. */
export function allowedOrigins(settings: Settings): Set<string> {
  const origins = new Set([
    `http://127.0.0.1:${settings.port}`,
    `http://localhost:${settings.port}`,
    ...settings.allowedOrigins,
  ]);
  if (settings.publicUrl) origins.add(settings.publicUrl);
  return origins;
}

/**
 * Refuses a request whose `Host` or `Origin` is not allowed, before any route runs. The Host check
 * stops DNS rebinding (a rebound page's same-origin GET carries no Origin); the Origin check stops
 * a foreign page, which a multipart POST can reach without a preflight, so CORS headers alone
 * would not. Both are exact comparisons.
 */
export async function registerOriginGuard(app: FastifyInstance, settings: Settings): Promise<void> {
  const hosts = allowedHosts(settings);
  const origins = allowedOrigins(settings);

  app.addHook('onRequest', async (request, reply) => {
    const host = request.headers.host;
    const origin = request.headers.origin;
    let refusal: string | undefined;
    if (host === undefined || !hosts.has(host)) {
      refusal = 'Kobzar answers only at its own address.';
    } else if (origin !== undefined && !origins.has(origin)) {
      refusal = `The site ${origin} is not allowed to use Kobzar.`;
    }
    if (refusal === undefined) return;
    request.log.info({ host, origin }, 'Host or origin refused');
    const error = new KobzarError('origin_not_allowed', refusal);
    return reply.status(error.status).send(errorBody(error));
  });

  await app.register(cors, { origin: [...origins], methods: ['GET', 'POST', 'PATCH', 'DELETE'] });
}
