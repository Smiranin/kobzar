import { afterEach, describe, expect, it } from 'vitest';
import { testService, type TestService } from './helpers.js';

describe('GET /v1/health', () => {
  let s: TestService;
  afterEach(() => s.cleanup());

  it('reports ready with what Kobzar supports', async () => {
    s = await testService();

    const response = await s.request({ method: 'GET', url: '/v1/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ready',
      version: 'test',
      defaultLanguage: 'ru',
      languages: ['ru', 'en'],
      modes: ['verbatim'],
      maxRecordingSeconds: 300,
    });
  });

  it.each(['loading', 'failed'] as const)('answers 200 with status %s', async (status) => {
    s = await testService({ settings: { defaultLanguage: 'en' } });
    s.recognizer.statusValue = status;

    const response = await s.request({ method: 'GET', url: '/v1/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status, defaultLanguage: 'en' });
  });

  it('answers an unknown route with the error body', async () => {
    s = await testService();

    const response = await s.request({ method: 'GET', url: '/v1/nothing' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: 'not_found', message: 'GET /v1/nothing does not exist.' },
    });
  });
});
