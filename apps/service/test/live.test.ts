// The one test with the real engine: whisper-server, the model and ffmpeg. It runs only with
// KOBZAR_LIVE=1 on the owner's Mac and is not part of `mise run check`. The speech is made on the
// spot with macOS `say`, so no voice is ever committed.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { defaultSettings } from '@kobzar/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type BuiltApp } from '../src/app.js';
import { FfmpegDecoder } from '../src/audio/ffmpeg-decoder.js';
import {
  INVENTED_PHRASES_PATH,
  VAD_MODEL_PATH,
  WHISPER_SERVER_PATH,
  modelPath,
} from '../src/paths.js';
import { WhisperServerRecognizer } from '../src/whisper/whisper-server-recognizer.js';
import { OWN_HOST, multipart } from './helpers.js';

const run = promisify(execFile);
/** Away from the 4901 of a Kobzar that may be running at the same time. */
const LIVE_ENGINE_PORT = 4911;

describe.skipIf(process.env.KOBZAR_LIVE !== '1')('live: real engine', () => {
  let dir: string;
  let built: BuiltApp;
  let recognizer: WhisperServerRecognizer;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kobzar-live-'));
    await writeFile(join(dir, 'dictionary.txt'), 'Fastify\nVitest\nKubernetes\n');
    recognizer = new WhisperServerRecognizer({
      binaryPath: WHISPER_SERVER_PATH,
      modelPath: modelPath(defaultSettings().model),
      vadModelPath: VAD_MODEL_PATH,
      port: LIVE_ENGINE_PORT,
      log: { info: () => undefined, error: (message) => console.error(message) },
    });
    built = await buildApp({
      settings: defaultSettings(),
      version: 'live',
      recognizer,
      decoder: new FfmpegDecoder(),
      dictionaryPath: join(dir, 'dictionary.txt'),
      inventedPhrasesPath: INVENTED_PHRASES_PATH,
      samplesDir: join(dir, 'samples'),
      recordingsDir: join(dir, 'recordings'),
    });
    await recognizer.start();
  }, 180_000);

  afterAll(async () => {
    await recognizer?.stop();
    await built?.app.close();
    await rm(dir, { recursive: true, force: true });
  });

  async function transcribe(file: string, fields: Record<string, string> = {}) {
    const body = await multipart(fields, {
      bytes: new Uint8Array(await readFile(file)),
      type: 'audio/mp4',
    });
    return built.app.inject({
      method: 'POST',
      url: '/v1/transcripts',
      payload: body.payload,
      headers: { ...body.headers, host: OWN_HOST },
    });
  }

  it('transcribes Russian speech with a Dictionary term', async () => {
    const file = join(dir, 'ru.m4a');
    await run('say', [
      '-v',
      'Milena',
      '-o',
      file,
      'Сегодня я поставил Fastify и проверил всё в Kubernetes.',
    ]);

    const response = await transcribe(file);

    expect(response.statusCode).toBe(200);
    expect(response.json().text).toMatch(/Fastify/);
    expect(response.json().text).toMatch(/[Сс]егодня/);
  }, 60_000);

  it('transcribes English speech when English is asked for', async () => {
    const file = join(dir, 'en.m4a');
    await run('say', ['-v', 'Samantha', '-o', file, 'Please deploy the service to Kubernetes.']);

    const response = await transcribe(file, { language: 'en' });

    expect(response.statusCode).toBe(200);
    expect(response.json().text).toMatch(/Kubernetes/);
  }, 60_000);

  it('gives an empty Transcript for silence', async () => {
    const file = join(dir, 'silence.m4a');
    await run('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=16000:cl=mono',
      '-t',
      '5',
      file,
    ]);

    const response = await transcribe(file);

    expect(response.statusCode).toBe(200);
    expect(response.json().text).toBe('');
  }, 60_000);

  it('refuses an upload that is not audio as unreadable_recording', async () => {
    const file = join(dir, 'not-audio.m4a');
    await writeFile(file, 'this is not audio');

    const response = await transcribe(file);

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('unreadable_recording');
  }, 60_000);
});
