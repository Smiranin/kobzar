import { describe, expect, it } from 'vitest';
import { diffWords, summariseRun, type SampleRunResult } from '../src/index.js';

describe('diffWords', () => {
  it('finds no errors in identical texts', () => {
    const result = diffWords('Запусти Vitest.', 'Запусти Vitest.');

    expect(result).toEqual({
      diff: [{ kind: 'same', words: ['Запусти', 'Vitest.'] }],
      wordErrors: 0,
      wordCount: 2,
    });
  });

  it('ignores letter case, punctuation and ё against е', () => {
    expect(diffWords('Всё, запусти Fastify!', 'все запусти fastify').wordErrors).toBe(0);
  });

  it('counts a substituted term as one error and keeps the original spelling', () => {
    const result = diffWords('Поставь Fastify сейчас', 'Поставь Festify сейчас');

    expect(result.diff).toEqual([
      { kind: 'same', words: ['Поставь'] },
      { kind: 'missing', words: ['Fastify'] },
      { kind: 'extra', words: ['Festify'] },
      { kind: 'same', words: ['сейчас'] },
    ]);
    expect(result.wordErrors).toBe(1);
  });

  it('counts missing and extra words', () => {
    expect(diffWords('один два три', 'один три').wordErrors).toBe(1);
    expect(diffWords('один три', 'один два три четыре').wordErrors).toBe(2);
  });

  it('treats an empty Transcript as every expected word missing', () => {
    const result = diffWords('один два', '');

    expect(result.diff).toEqual([{ kind: 'missing', words: ['один', 'два'] }]);
    expect(result).toMatchObject({ wordErrors: 2, wordCount: 2 });
  });

  it('does not count a dash on its own as a word', () => {
    expect(diffWords('да — нет', 'да нет')).toMatchObject({ wordErrors: 0, wordCount: 2 });
  });
});

describe('summariseRun', () => {
  const result = (overrides: Partial<SampleRunResult>): SampleRunResult => ({
    sampleId: 'a',
    expectedText: '',
    text: '',
    durationMs: 10_000,
    processingMs: 500,
    diff: [],
    wordErrors: 1,
    wordCount: 10,
    ...overrides,
  });

  it('adds up the results and computes the rates', () => {
    const totals = summariseRun({
      results: [result({}), result({ wordErrors: 0, wordCount: 30, durationMs: 20_000 })],
      failed: 1,
    });

    expect(totals).toEqual({
      samples: 3,
      failed: 1,
      wordErrors: 1,
      wordCount: 40,
      wordErrorRate: 0.025,
      recordedMs: 30_000,
      processingMs: 1_000,
      speedFactor: 30,
    });
  });

  it('gives zero rates for an empty run instead of dividing by zero', () => {
    expect(summariseRun({ results: [], failed: 0 })).toMatchObject({
      samples: 0,
      wordErrorRate: 0,
      speedFactor: 0,
    });
  });
});
