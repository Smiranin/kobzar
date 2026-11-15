import { diffArrays } from 'diff';
import type { DiffPart, RunTotals, SampleRunResult } from './contract/samples.js';

interface Word {
  /** As written, for display. */
  text: string;
  /** Lower case, `ё` as `е`, no punctuation: what is compared. */
  key: string;
}

function words(text: string): Word[] {
  return text
    .split(/\s+/)
    .map((word) => ({
      text: word,
      key: word
        .toLowerCase()
        .replaceAll('ё', 'е')
        .replace(/[\p{P}\p{S}]/gu, ''),
    }))
    .filter((word) => word.key !== '');
}

export interface WordDiff {
  diff: DiffPart[];
  wordErrors: number;
  /** Words in the expected text. */
  wordCount: number;
}

/**
 * Compares the expected text of a Sample with its Transcript word by word, ignoring letter case,
 * punctuation and the difference between `ё` and `е`. A changed stretch counts as many errors as
 * the larger of its missing and extra words, so one substituted word is one error, not two.
 */
export function diffWords(expected: string, actual: string): WordDiff {
  const expectedWords = words(expected);
  const changes = diffArrays(expectedWords, words(actual), {
    comparator: (left, right) => left.key === right.key,
  });

  const diff: DiffPart[] = [];
  let wordErrors = 0;
  let missing = 0;
  let extra = 0;
  const closeStretch = () => {
    wordErrors += Math.max(missing, extra);
    missing = 0;
    extra = 0;
  };
  for (const change of changes) {
    const texts = change.value.map((word) => word.text);
    if (change.removed) {
      diff.push({ kind: 'missing', words: texts });
      missing += texts.length;
    } else if (change.added) {
      diff.push({ kind: 'extra', words: texts });
      extra += texts.length;
    } else {
      closeStretch();
      diff.push({ kind: 'same', words: texts });
    }
  }
  closeStretch();
  return { diff, wordErrors, wordCount: expectedWords.length };
}

/** Totals of a Samples run; `failed` Samples have no result and count only as failed. */
export function summariseRun(input: {
  results: readonly SampleRunResult[];
  failed: number;
}): RunTotals {
  const sum = (pick: (result: SampleRunResult) => number) =>
    input.results.reduce((total, result) => total + pick(result), 0);
  const wordErrors = sum((result) => result.wordErrors);
  const wordCount = sum((result) => result.wordCount);
  const recordedMs = sum((result) => result.durationMs);
  const processingMs = sum((result) => result.processingMs);
  return {
    samples: input.results.length + input.failed,
    failed: input.failed,
    wordErrors,
    wordCount,
    wordErrorRate: wordCount === 0 ? 0 : wordErrors / wordCount,
    recordedMs,
    processingMs,
    speedFactor: processingMs === 0 ? 0 : recordedMs / processingMs,
  };
}
