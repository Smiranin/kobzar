import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, type Settings } from '@kobzar/core';
import { FakeAudioDecoder, FakeRecognizer } from '@kobzar/core/testing';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { buildApp, type BuiltApp } from '../src/app.js';

/** What every test request carries unless it says otherwise: Kobzar's own loopback address. */
export const OWN_HOST = '127.0.0.1:4900';

export interface TestService extends BuiltApp {
  recognizer: FakeRecognizer;
  decoder: FakeAudioDecoder;
  root: string;
  dictionaryPath: string;
  samplesDir: string;
  recordingsDir: string;
  /** `app.inject` with the own Host header filled in. */
  request(options: InjectOptions): Promise<LightMyRequestResponse>;
  cleanup(): Promise<void>;
}

export interface TestServiceOptions {
  settings?: Partial<Settings>;
  dictionary?: string;
  inventedPhrases?: string;
}

/** The service on a temp folder with a FakeRecognizer and a FakeAudioDecoder, driven with `inject`. */
export async function testService(options: TestServiceOptions = {}): Promise<TestService> {
  const root = await mkdtemp(join(tmpdir(), 'kobzar-test-'));
  const dictionaryPath = join(root, 'dictionary.txt');
  const inventedPhrasesPath = join(root, 'invented-phrases.txt');
  const samplesDir = join(root, 'samples');
  const recordingsDir = join(root, 'recordings');
  if (options.dictionary !== undefined) await writeFile(dictionaryPath, options.dictionary);
  await writeFile(inventedPhrasesPath, options.inventedPhrases ?? 'Продолжение следует...\n');

  const recognizer = new FakeRecognizer();
  const decoder = new FakeAudioDecoder();
  const built = await buildApp({
    settings: { ...defaultSettings(), ...options.settings },
    version: 'test',
    recognizer,
    decoder,
    dictionaryPath,
    inventedPhrasesPath,
    samplesDir,
    recordingsDir,
  });
  return {
    ...built,
    recognizer,
    decoder,
    root,
    dictionaryPath,
    samplesDir,
    recordingsDir,
    request: (request) =>
      built.app.inject({ ...request, headers: { host: OWN_HOST, ...request.headers } }),
    cleanup: async () => {
      await built.app.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

export interface MultipartBody {
  payload: Buffer;
  headers: Record<string, string>;
}

/** A multipart body as a browser would send it, built by the platform's own FormData encoder. */
export async function multipart(
  fields: Record<string, string>,
  recording: { bytes?: Uint8Array<ArrayBuffer>; type?: string; field?: string } | false = {},
): Promise<MultipartBody> {
  const form = new FormData();
  if (recording !== false) {
    const blob = new Blob([recording.bytes ?? new Uint8Array([1, 2, 3, 4])], {
      type: recording.type ?? 'audio/webm;codecs=opus',
    });
    form.append(recording.field ?? 'recording', blob, 'phrase.webm');
  }
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  const encoded = new Response(form);
  return {
    payload: Buffer.from(await encoded.arrayBuffer()),
    headers: { 'content-type': encoded.headers.get('content-type') ?? '' },
  };
}

/** Posts a Recording to `/v1/transcripts`. */
export async function postTranscript(
  service: TestService,
  fields: Record<string, string> = {},
  recording?: Parameters<typeof multipart>[1],
  headers: Record<string, string> = {},
): Promise<LightMyRequestResponse> {
  const body = await multipart(fields, recording);
  return service.request({
    method: 'POST',
    url: '/v1/transcripts',
    payload: body.payload,
    headers: { ...body.headers, ...headers },
  });
}

/** Entries left in a folder; a missing folder has none. */
export async function entriesOf(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}
