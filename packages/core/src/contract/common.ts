import { z } from 'zod';

/** Languages Kobzar transcribes. It never detects the language itself (SPEC requirement 2). */
export const LANGUAGES = ['ru', 'en'] as const;
export const languageSchema = z.enum(LANGUAGES);
export type Language = z.infer<typeof languageSchema>;

/** Processing modes. The MVP has only the verbatim one; the field exists so others can come later (SPEC requirement 9). */
export const MODES = ['verbatim'] as const;
export const modeSchema = z.enum(MODES);
export type Mode = z.infer<typeof modeSchema>;

/** A Recording longer than this is refused (SPEC requirement 10). */
export const MAX_RECORDING_SECONDS = 300;

/** Hints sent by a Client with one Recording. */
export const MAX_HINTS = 50;
export const MAX_HINT_LENGTH = 64;
