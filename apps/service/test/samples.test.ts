import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Sample } from '@kobzar/core';
import { afterEach, describe, expect, it } from 'vitest';
import { entriesOf, multipart, testService, type TestService } from './helpers.js';

const RECORDING = new Uint8Array([7, 7, 7, 7, 7]);

describe('Samples', () => {
  let s: TestService;
  afterEach(() => s.cleanup());

  async function save(
    fields: Record<string, string> = { language: 'ru', expectedText: 'Запусти Vitest.' },
    recording: Parameters<typeof multipart>[1] = { bytes: RECORDING, type: 'audio/mp4' },
  ) {
    const body = await multipart(fields, recording);
    return s.request({
      method: 'POST',
      url: '/v1/samples',
      payload: body.payload,
      headers: body.headers,
    });
  }

  it('saves a Sample with its Recording, length and expected text', async () => {
    s = await testService();
    s.decoder.durationMs = 3_000;

    const response = await save();

    expect(response.statusCode).toBe(201);
    const sample: Sample = response.json();
    expect(sample).toMatchObject({
      language: 'ru',
      expectedText: 'Запусти Vitest.',
      mimeType: 'audio/mp4',
      durationMs: 3_000,
    });
    expect(await readFile(join(s.samplesDir, `${sample.id}.m4a`))).toEqual(Buffer.from(RECORDING));
    expect(await entriesOf(s.recordingsDir)).toEqual([]);
  });

  it('lists the saved Samples', async () => {
    s = await testService();
    const saved: Sample = (await save()).json();

    const response = await s.request({ method: 'GET', url: '/v1/samples' });

    expect(response.json()).toEqual({ samples: [saved] });
  });

  it('starts with an empty list', async () => {
    s = await testService();

    expect((await s.request({ method: 'GET', url: '/v1/samples' })).json()).toEqual({
      samples: [],
    });
  });

  it('refuses a Sample without expected text, an unreadable one and a too long one', async () => {
    s = await testService();

    expect((await save({ language: 'ru', expectedText: '  ' })).json().error.code).toBe(
      'invalid_request',
    );
    expect((await save({ language: 'ru', expectedText: 'Да.' }, false)).json().error.code).toBe(
      'invalid_request',
    );
    s.decoder.durationMs = 301_000;
    expect((await save()).json().error.code).toBe('recording_too_long');
    s.decoder.unreadable = 'Kobzar could not read this Recording.';
    expect((await save()).json().error.code).toBe('unreadable_recording');
    expect(await entriesOf(s.samplesDir)).toEqual([]);
  });

  it('edits the expected text', async () => {
    s = await testService();
    const saved: Sample = (await save()).json();

    const response = await s.request({
      method: 'PATCH',
      url: `/v1/samples/${saved.id}`,
      payload: { expectedText: 'Запусти Vitest сейчас.' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ...saved, expectedText: 'Запусти Vitest сейчас.' });
    const listed = (await s.request({ method: 'GET', url: '/v1/samples' })).json();
    expect(listed.samples[0].expectedText).toBe('Запусти Vitest сейчас.');
  });

  it('deletes a Sample together with its Recording', async () => {
    s = await testService();
    const saved: Sample = (await save()).json();

    const response = await s.request({ method: 'DELETE', url: `/v1/samples/${saved.id}` });

    expect(response.statusCode).toBe(204);
    expect(await entriesOf(s.samplesDir)).toEqual(['samples.json']);
    expect((await s.request({ method: 'GET', url: '/v1/samples' })).json().samples).toEqual([]);
  });

  it('serves the stored Recording for playback', async () => {
    s = await testService();
    const saved: Sample = (await save()).json();

    const response = await s.request({ method: 'GET', url: `/v1/samples/${saved.id}/recording` });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('audio/mp4');
    expect(response.rawPayload).toEqual(Buffer.from(RECORDING));
  });

  it('runs a Sample through the engine and returns the differences', async () => {
    s = await testService({ dictionary: 'Vitest\n' });
    s.decoder.durationMs = 3_000;
    const saved: Sample = (await save({ language: 'en', expectedText: 'Run Vitest now.' })).json();
    s.recognizer.segments = [' Run Festify now.'];

    const response = await s.request({ method: 'POST', url: `/v1/samples/${saved.id}/run` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      sampleId: saved.id,
      expectedText: 'Run Vitest now.',
      text: 'Run Festify now.',
      durationMs: 3_000,
      diff: [
        { kind: 'same', words: ['Run'] },
        { kind: 'missing', words: ['Vitest'] },
        { kind: 'extra', words: ['Festify'] },
        { kind: 'same', words: ['now.'] },
      ],
      wordErrors: 1,
      wordCount: 3,
    });
    expect(s.recognizer.calls[0]?.language).toBe('en');
    expect(s.recognizer.calls[0]?.modelPrompt).toContain('Vitest');
    expect(s.decoder.calls.at(-1)?.path).toBe(join(s.samplesDir, `${saved.id}.m4a`));
    // The Sample's own Recording stays.
    expect(await entriesOf(s.samplesDir)).toContain(`${saved.id}.m4a`);
  });

  it('refuses to run while the engine is loading', async () => {
    s = await testService();
    const saved: Sample = (await save()).json();
    s.recognizer.statusValue = 'loading';

    const response = await s.request({ method: 'POST', url: `/v1/samples/${saved.id}/run` });

    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('not_ready');
  });

  it.each([
    ['PATCH', '/v1/samples/none', { expectedText: 'x' }],
    ['DELETE', '/v1/samples/none', undefined],
    ['GET', '/v1/samples/none/recording', undefined],
    ['POST', '/v1/samples/none/run', undefined],
  ] as const)('%s %s answers not_found for an unknown Sample', async (method, url, payload) => {
    s = await testService();

    const response = await s.request({ method, url, ...(payload && { payload }) });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not_found');
  });
});
