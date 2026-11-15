import { listLines } from './dictionary.js';

/** Lower case, no punctuation or symbols, single spaces: the form segments and phrases are compared in. */
export function normaliseForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The phrases of `invented-phrases.txt` in their comparison form. */
export function parseInventedPhrases(text: string): Set<string> {
  return new Set(
    listLines(text)
      .map(normaliseForComparison)
      .filter((phrase) => phrase !== ''),
  );
}

/**
 * The Transcript text from the engine's segments, without the segments that are a phrase the model
 * is known to invent on silence. Only whole segments are dropped, so real speech that merely
 * contains such words stays. The rest are joined as they are: each segment carries its own leading
 * space and the engine sometimes splits a word between two segments, so adding spaces would break it.
 */
export function removeInventedPhrases(
  segments: readonly string[],
  phrases: ReadonlySet<string>,
): string {
  return segments
    .filter((segment) => !phrases.has(normaliseForComparison(segment)))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}
