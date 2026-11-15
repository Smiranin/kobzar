import { z } from 'zod';
import { languageSchema } from './common.js';

/** Expected texts are typed by the owner; this keeps a slip of the paste from filling the store. */
export const MAX_EXPECTED_TEXT_LENGTH = 10_000;

const expectedTextSchema = z.string().trim().min(1).max(MAX_EXPECTED_TEXT_LENGTH);

export const sampleSchema = z.object({
  id: z.string().min(1),
  language: languageSchema,
  expectedText: z.string(),
  mimeType: z.string(),
  durationMs: z.number().nonnegative(),
  createdAt: z.string(),
});
export type Sample = z.infer<typeof sampleSchema>;

export const samplesListSchema = z.object({ samples: z.array(sampleSchema) });
export type SamplesList = z.infer<typeof samplesListSchema>;

/** The text fields of `POST /v1/samples` once read from the multipart body. */
export const sampleFieldsSchema = z.object({
  language: languageSchema,
  expectedText: expectedTextSchema,
});
export type SampleFields = z.infer<typeof sampleFieldsSchema>;

export const sampleUpdateSchema = z.object({ expectedText: expectedTextSchema });
export type SampleUpdate = z.infer<typeof sampleUpdateSchema>;

export const DIFF_KINDS = ['same', 'missing', 'extra'] as const;
export const diffPartSchema = z.object({
  kind: z.enum(DIFF_KINDS),
  words: z.array(z.string()),
});
export type DiffPart = z.infer<typeof diffPartSchema>;

export const sampleRunResultSchema = z.object({
  sampleId: z.string(),
  expectedText: z.string(),
  text: z.string(),
  durationMs: z.number().nonnegative(),
  processingMs: z.number().nonnegative(),
  diff: z.array(diffPartSchema),
  wordErrors: z.number().int().nonnegative(),
  wordCount: z.number().int().nonnegative(),
});
export type SampleRunResult = z.infer<typeof sampleRunResultSchema>;

/** Totals of a Samples run, computed on the test page by `summariseRun`. */
export interface RunTotals {
  samples: number;
  failed: number;
  wordErrors: number;
  wordCount: number;
  wordErrorRate: number;
  recordedMs: number;
  processingMs: number;
  /** recordedMs / processingMs: how many times faster than real time. */
  speedFactor: number;
}
