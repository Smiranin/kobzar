import { writeFile } from 'node:fs/promises';
import { RecognitionFailedError } from '@kobzar/core';
import { afterEach, describe, expect, it } from 'vitest';
import { entriesOf, postTranscript, testService, type TestService } from './helpers.js';

describe('POST /v1/transcripts', () => {
  let s: TestService;
  afterEach(() => s.cleanup());

  it('returns the Transcript with its language, mode, durations and Dictionary counts', async () => {
    s = await testService({ dictionary: 'Fastify\nVitest\n' });
    s.recognizer.segments = [' Запусти', ' Vitest.'];
    s.decoder.durationMs = 4_200;

    const response = await postTranscript(s);

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      text: 'Запусти Vitest.',
      language: 'ru',
      mode: 'verbatim',
      durationMs: 4_200,
      dictionary: { total: 2, used: 2 },
    });
    expect(body.processingMs).toBeGreaterThanOrEqual(0);
  });

  it('assumes the default language and sends the requested one to the model', async () => {
    s = await testService({ settings: { defaultLanguage: 'en' } });

    const byDefault = await postTranscript(s);
    const russian = await postTranscript(s, { language: 'ru' });

    expect(byDefault.json().language).toBe('en');
    expect(russian.json().language).toBe('ru');
    expect(s.recognizer.calls.map((call) => call.language)).toEqual(['en', 'ru']);
  });

  it('puts the Dictionary and the hints into the model prompt', async () => {
    s = await testService({ dictionary: 'Fastify\n# comment\nzod\n' });

    await postTranscript(s, { hints: JSON.stringify(['Sensei', 'kata']) });

    expect(s.recognizer.calls[0]?.modelPrompt).toBe(
      'Привет. Это текст на русском с английскими терминами: Fastify, zod, Sensei, kata.',
    );
  });

  it('applies a Dictionary edit to the next Recording without a restart', async () => {
    s = await testService({ dictionary: 'Fastify\n' });

    await postTranscript(s);
    await writeFile(s.dictionaryPath, 'Fastify\nKubernetes\n');
    const second = await postTranscript(s);

    expect(s.recognizer.calls[0]?.modelPrompt).not.toContain('Kubernetes');
    expect(s.recognizer.calls[1]?.modelPrompt).toContain('Kubernetes');
    expect(second.json().dictionary).toEqual({ total: 2, used: 2 });
  });

  it('works without a Dictionary file', async () => {
    s = await testService();

    const response = await postTranscript(s);

    expect(response.json().dictionary).toEqual({ total: 0, used: 0 });
    expect(s.recognizer.calls[0]?.modelPrompt).toBe('Привет. Это текст на русском.');
  });

  it('returns an empty Transcript when no speech was found', async () => {
    s = await testService();
    s.recognizer.segments = [];

    const response = await postTranscript(s);

    expect(response.statusCode).toBe(200);
    expect(response.json().text).toBe('');
  });

  it('removes a phrase the model invents on silence', async () => {
    s = await testService();
    s.recognizer.segments = [' Продолжение следует...'];

    expect((await postTranscript(s)).json().text).toBe('');
  });

  it('reads the parts in any order', async () => {
    s = await testService();
    const response = await postTranscript(s, { language: 'en', mode: 'verbatim' });

    expect(response.statusCode).toBe(200);
    expect(response.json().language).toBe('en');
  });

  describe('errors', () => {
    const expectError = async (
      response: Awaited<ReturnType<typeof postTranscript>>,
      status: number,
      code: string,
    ) => {
      expect(response.statusCode).toBe(status);
      const body = response.json();
      expect(body.error.code).toBe(code);
      expect(body.error.message.length).toBeGreaterThan(0);
    };

    it('invalid_request without a recording, for an unknown language, for malformed hints', async () => {
      s = await testService();

      await expectError(await postTranscript(s, { language: 'ru' }, false), 400, 'invalid_request');
      await expectError(await postTranscript(s, { language: 'uk' }), 400, 'invalid_request');
      await expectError(await postTranscript(s, { hints: 'Fastify' }), 400, 'invalid_request');
      await expectError(
        await postTranscript(s, { hints: JSON.stringify(Array(51).fill('kata')) }),
        400,
        'invalid_request',
      );
      await expectError(await postTranscript(s, {}, { field: 'audio' }), 400, 'invalid_request');
      expect(s.recognizer.calls).toHaveLength(0);
    });

    it('invalid_request for a body that is not multipart', async () => {
      s = await testService();

      const response = await s.request({
        method: 'POST',
        url: '/v1/transcripts',
        payload: { recording: 'x' },
      });

      await expectError(response, 400, 'invalid_request');
    });

    it('recording_too_long for more than five minutes', async () => {
      s = await testService();
      s.decoder.durationMs = 6 * 60 * 1000;

      await expectError(await postTranscript(s), 413, 'recording_too_long');
      expect(s.decoder.calls[0]?.maxSeconds).toBe(300);
      expect(s.recognizer.calls).toHaveLength(0);
    });

    it('accepts exactly five minutes', async () => {
      s = await testService();
      s.decoder.durationMs = 5 * 60 * 1000;

      expect((await postTranscript(s)).statusCode).toBe(200);
    });

    it('unreadable_recording when it cannot be decoded or is empty', async () => {
      s = await testService();

      await expectError(
        await postTranscript(s, {}, { bytes: new Uint8Array(0) }),
        422,
        'unreadable_recording',
      );
      s.decoder.unreadable = 'Kobzar could not read this Recording.';
      await expectError(await postTranscript(s), 422, 'unreadable_recording');
    });

    it('unsupported_mode for any mode but verbatim', async () => {
      s = await testService();

      await expectError(await postTranscript(s, { mode: 'clean' }), 422, 'unsupported_mode');
    });

    it.each(['loading', 'failed'] as const)('not_ready while the engine is %s', async (status) => {
      s = await testService();
      s.recognizer.statusValue = status;

      await expectError(await postTranscript(s), 503, 'not_ready');
      expect(s.decoder.calls).toHaveLength(0);
    });

    it('recognition_failed when the engine fails', async () => {
      s = await testService();
      s.recognizer.respond = () => Promise.reject(new RecognitionFailedError('The engine failed.'));

      await expectError(await postTranscript(s), 500, 'recognition_failed');
    });

    it('internal_error for a fault, without the details', async () => {
      s = await testService();
      s.recognizer.respond = () => Promise.reject(new TypeError('a bug'));

      const response = await postTranscript(s);

      await expectError(response, 500, 'internal_error');
      expect(response.body).not.toContain('a bug');
    });
  });

  describe('one at a time', () => {
    it('makes a second Recording wait, and each gets its own Transcript', async () => {
      s = await testService();
      const release = s.recognizer.hold();
      let call = 0;
      s.recognizer.respond = async () => {
        call += 1;
        return { segments: [` Фраза ${call}.`] };
      };

      const first = postTranscript(s, { hints: JSON.stringify(['первая']) });
      await waitFor(() => s.recognizer.calls.length === 1);
      const second = postTranscript(s, { hints: JSON.stringify(['вторая']) });
      // The second is waiting in the queue, not at the engine.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(s.recognizer.calls).toHaveLength(1);
      release();

      expect((await first).json().text).toBe('Фраза 1.');
      expect((await second).json().text).toBe('Фраза 2.');
      expect(s.recognizer.calls[0]?.modelPrompt).toContain('первая');
      expect(s.recognizer.calls[1]?.modelPrompt).toContain('вторая');
    });

    it('answers busy when the waiting line is full', async () => {
      s = await testService();
      const release = s.recognizer.hold();

      const accepted = [postTranscript(s)];
      await waitFor(() => s.recognizer.calls.length === 1);
      for (let index = 0; index < 4; index += 1) accepted.push(postTranscript(s));
      await waitFor(() => s.decoder.calls.length === 1);
      await new Promise((resolve) => setTimeout(resolve, 20));
      const refused = await postTranscript(s);
      release();

      expect(refused.statusCode).toBe(503);
      expect(refused.json().error.code).toBe('busy');
      for (const response of await Promise.all(accepted)) expect(response.statusCode).toBe(200);
    });
  });

  describe('nothing is kept', () => {
    it('deletes the Recording once the Transcript is returned', async () => {
      s = await testService();
      let duringRecognition: string[] = [];
      s.recognizer.respond = async () => {
        duringRecognition = await entriesOf(s.recordingsDir);
        return { segments: [' Да.'] };
      };

      await postTranscript(s);

      expect(duringRecognition).toHaveLength(1);
      expect(await entriesOf(s.recordingsDir)).toEqual([]);
    });

    it('deletes the Recording after a failure too', async () => {
      s = await testService();
      s.decoder.unreadable = 'Kobzar could not read this Recording.';

      await postTranscript(s);

      expect(await entriesOf(s.recordingsDir)).toEqual([]);
    });

    it('writes nothing into the Samples folder', async () => {
      s = await testService();

      await postTranscript(s);

      expect(await entriesOf(s.samplesDir)).toEqual([]);
    });
  });
});

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
