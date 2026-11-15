import { afterEach, describe, expect, it } from 'vitest';
import { postTranscript, testService, type TestService } from './helpers.js';

const DOJO = 'https://dojo.tail1234.ts.net';
const PUBLIC_URL = 'https://mac.tail1234.ts.net:8443';

describe('host and origin guard', () => {
  let s: TestService;
  afterEach(() => s.cleanup());

  const health = (headers: Record<string, string>) =>
    s.request({ method: 'GET', url: '/v1/health', headers });

  it('lets a request without Origin through: curl, native Clients', async () => {
    s = await testService();

    expect((await health({})).statusCode).toBe(200);
  });

  it('lets its own test page and the listed sites through', async () => {
    s = await testService({ settings: { allowedOrigins: [DOJO], publicUrl: PUBLIC_URL } });

    expect((await health({ origin: 'http://127.0.0.1:4900' })).statusCode).toBe(200);
    expect((await health({ origin: 'http://localhost:4900' })).statusCode).toBe(200);
    expect((await health({ origin: DOJO })).statusCode).toBe(200);
    expect(
      (await health({ origin: PUBLIC_URL, host: 'mac.tail1234.ts.net:8443' })).statusCode,
    ).toBe(200);
  });

  it('refuses an unlisted site, and the Recognizer is never called', async () => {
    s = await testService();

    const response = await postTranscript(s, {}, {}, { origin: 'https://example.com' });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('origin_not_allowed');
    expect(s.recognizer.calls).toHaveLength(0);
    expect(s.decoder.calls).toHaveLength(0);
  });

  it('refuses an origin that only resembles an allowed one', async () => {
    s = await testService({ settings: { allowedOrigins: [DOJO] } });

    expect((await health({ origin: `${DOJO}.evil.com` })).statusCode).toBe(403);
    expect((await health({ origin: 'http://dojo.tail1234.ts.net' })).statusCode).toBe(403);
  });

  it('refuses a GET with a foreign Host and no Origin: a DNS-rebound page', async () => {
    s = await testService();

    const response = await s.request({
      method: 'GET',
      url: '/v1/samples',
      headers: { host: 'attacker.example:4900' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('origin_not_allowed');
  });

  it('sends CORS headers to an allowed site, also on the preflight', async () => {
    s = await testService({ settings: { allowedOrigins: [DOJO] } });

    const simple = await health({ origin: DOJO });
    const preflight = await s.request({
      method: 'OPTIONS',
      url: '/v1/transcripts',
      headers: { origin: DOJO, 'access-control-request-method': 'POST' },
    });

    expect(simple.headers['access-control-allow-origin']).toBe(DOJO);
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(DOJO);
  });
});
