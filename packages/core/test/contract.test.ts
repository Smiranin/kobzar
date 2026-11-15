import { describe, expect, it } from 'vitest';
import { ERROR_CODES, ERROR_STATUS, LANGUAGES, MODES, hintsSchema } from '../src/index.js';

describe('contract', () => {
  it('supports Russian and English and only the verbatim mode', () => {
    expect(LANGUAGES).toEqual(['ru', 'en']);
    expect(MODES).toEqual(['verbatim']);
  });

  it('has one status per error code', () => {
    expect(ERROR_CODES).toHaveLength(10);
    expect(ERROR_STATUS.recording_too_long).toBe(413);
  });

  it('limits hints to 50 entries of 64 characters', () => {
    expect(hintsSchema.safeParse(Array(50).fill('kata')).success).toBe(true);
    expect(hintsSchema.safeParse(Array(51).fill('kata')).success).toBe(false);
    expect(hintsSchema.safeParse(['x'.repeat(65)]).success).toBe(false);
    expect(hintsSchema.safeParse(['']).success).toBe(false);
  });
});
