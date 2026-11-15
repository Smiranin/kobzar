import { z } from 'zod';
import { LANGUAGES, MAX_RECORDING_SECONDS, MODES, languageSchema } from './common.js';

export const ENGINE_STATUSES = ['loading', 'ready', 'failed'] as const;
export const engineStatusSchema = z.enum(ENGINE_STATUSES);
export type EngineStatus = z.infer<typeof engineStatusSchema>;

export const healthResponseSchema = z.object({
  status: engineStatusSchema,
  version: z.string(),
  defaultLanguage: languageSchema,
  languages: z.tuple([z.literal(LANGUAGES[0]), z.literal(LANGUAGES[1])]),
  modes: z.tuple([z.literal(MODES[0])]),
  maxRecordingSeconds: z.literal(MAX_RECORDING_SECONDS),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
