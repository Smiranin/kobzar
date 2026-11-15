import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

/** Serves the built test page at `/` when the build exists; returns whether it does. */
export async function registerStatic(app: FastifyInstance, distDir: string): Promise<boolean> {
  if (!existsSync(join(distDir, 'index.html'))) return false;
  await app.register(fastifyStatic, { root: distDir, index: 'index.html' });
  return true;
}
