import { z } from 'zod';
import { MAX_HINT_LENGTH, MAX_HINTS, languageSchema, modeSchema } from './common.js';

/** The hints of one Recording: words likely to occur in it. */
export const hintsSchema = z
  .array(z.string().trim().min(1).max(MAX_HINT_LENGTH))
  .max(MAX_HINTS, `at most ${MAX_HINTS} hints`);

/**
 * The text fields of `POST /v1/transcripts` once read from the multipart body. `hints` arrives as
 * a JSON string; `mode` is any string here and is checked against the supported modes separately,
 * because an unknown mode has its own error code.
 */
export const transcriptFieldsSchema = z.object({
  language: languageSchema.optional(),
  hints: z.string().optional(),
  mode: z.string().optional(),
});
export type TranscriptFields = z.infer<typeof transcriptFieldsSchema>;

export const dictionaryUsageSchema = z.object({
  total: z.number().int().nonnegative(),
  used: z.number().int().nonnegative(),
});
export type DictionaryUsage = z.infer<typeof dictionaryUsageSchema>;

export const transcriptResponseSchema = z.object({
  text: z.string(),
  language: languageSchema,
  mode: modeSchema,
  durationMs: z.number().nonnegative(),
  processingMs: z.number().nonnegative(),
  dictionary: dictionaryUsageSchema,
});
export type TranscriptResponse = z.infer<typeof transcriptResponseSchema>;
