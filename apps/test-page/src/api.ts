import {
  errorResponseSchema,
  healthResponseSchema,
  sampleRunResultSchema,
  sampleSchema,
  samplesListSchema,
  transcriptResponseSchema,
  type ErrorCode,
  type HealthResponse,
  type Language,
  type Sample,
  type SampleRunResult,
  type TranscriptResponse,
} from '@kobzar/core';
import type { z } from 'zod';

/** A failure answered by Kobzar, or a network failure (`code` undefined). */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(schema: z.ZodType<T>, url: string, init?: RequestInit): Promise<T> {
  const body = await send(url, init);
  return schema.parse(await body.json());
}

async function send(url: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiError(undefined, 'Kobzar is unreachable: no connection to the service.');
  }
  if (response.ok) return response;
  const parsed = errorResponseSchema.safeParse(await response.json().catch(() => undefined));
  if (parsed.success) throw new ApiError(parsed.data.error.code, parsed.data.error.message);
  throw new ApiError(undefined, `Kobzar answered HTTP ${response.status}.`);
}

function recordingForm(recording: Blob, fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  form.append('recording', recording, 'recording');
  return form;
}

export const api = {
  health: (): Promise<HealthResponse> => request(healthResponseSchema, '/v1/health'),

  transcribe: (
    recording: Blob,
    language: Language,
    hints: string[],
  ): Promise<TranscriptResponse> => {
    const fields: Record<string, string> = { language };
    if (hints.length > 0) fields.hints = JSON.stringify(hints);
    return request(transcriptResponseSchema, '/v1/transcripts', {
      method: 'POST',
      body: recordingForm(recording, fields),
    });
  },

  samples: async (): Promise<Sample[]> => (await request(samplesListSchema, '/v1/samples')).samples,

  saveSample: (recording: Blob, language: Language, expectedText: string): Promise<Sample> =>
    request(sampleSchema, '/v1/samples', {
      method: 'POST',
      body: recordingForm(recording, { language, expectedText }),
    }),

  updateSample: (id: string, expectedText: string): Promise<Sample> =>
    request(sampleSchema, `/v1/samples/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedText }),
    }),

  deleteSample: async (id: string): Promise<void> => {
    await send(`/v1/samples/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  runSample: (id: string): Promise<SampleRunResult> =>
    request(sampleRunResultSchema, `/v1/samples/${encodeURIComponent(id)}/run`, {
      method: 'POST',
    }),

  recordingUrl: (id: string): string => `/v1/samples/${encodeURIComponent(id)}/recording`,
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
