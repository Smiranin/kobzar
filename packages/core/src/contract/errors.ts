import { z } from 'zod';

/** Every error code a Client can receive, with the HTTP status it comes with. */
export const ERROR_STATUS = {
  invalid_request: 400,
  origin_not_allowed: 403,
  not_found: 404,
  recording_too_long: 413,
  unreadable_recording: 422,
  unsupported_mode: 422,
  busy: 503,
  not_ready: 503,
  recognition_failed: 500,
  /** A fault in Kobzar itself, not in the Recording or the engine. */
  internal_error: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export const ERROR_CODES = Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]];

export const errorResponseSchema = z.object({
  error: z.object({ code: z.enum(ERROR_CODES), message: z.string() }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
