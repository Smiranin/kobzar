import { describe, expect, it } from 'vitest';
import {
  CHARS_PER_TOKEN,
  MODEL_PROMPT_TOKEN_BUDGET,
  buildModelPrompt,
  estimateTokens,
} from '../src/index.js';

describe('buildModelPrompt', () => {
  it('is a punctuated lead-in sentence in the language when there are no terms', () => {
    const ru = buildModelPrompt({ dictionary: [], hints: [], language: 'ru' });
    const en = buildModelPrompt({ dictionary: [], hints: [], language: 'en' });

    expect(ru).toEqual({ text: 'Привет. Это текст на русском.', dictionaryUsed: 0 });
    expect(en.text).toBe('Hello. This is a text in English.');
  });

  it('lists Dictionary entries first and hints last, separated by commas', () => {
    const prompt = buildModelPrompt({
      dictionary: ['Fastify', 'Vitest'],
      hints: ['Sensei', 'kata'],
      language: 'ru',
    });

    expect(prompt.text).toBe(
      'Привет. Это текст на русском с английскими терминами: Fastify, Vitest, Sensei, kata.',
    );
    expect(prompt.dictionaryUsed).toBe(2);
  });

  it('takes Dictionary entries from the top until the budget is used', () => {
    const dictionary = Array.from({ length: 200 }, (_, index) => `Term${index}`);

    const prompt = buildModelPrompt({ dictionary, hints: [], language: 'en' });

    expect(estimateTokens(prompt.text)).toBeLessThanOrEqual(MODEL_PROMPT_TOKEN_BUDGET);
    expect(prompt.dictionaryUsed).toBeGreaterThan(0);
    expect(prompt.dictionaryUsed).toBeLessThan(dictionary.length);
    expect(prompt.text).toContain('Term0,');
    expect(prompt.text).not.toContain(`Term${prompt.dictionaryUsed},`);
  });

  it('never drops a hint, even when the hints alone are over the budget', () => {
    const hints = Array.from({ length: 50 }, (_, index) => `hint-number-${index}`);

    const prompt = buildModelPrompt({ dictionary: ['Fastify'], hints, language: 'ru' });

    for (const hint of hints) expect(prompt.text).toContain(hint);
    expect(prompt.dictionaryUsed).toBe(0);
  });

  it('drops duplicates between the Dictionary and the hints ignoring case, counting them as used', () => {
    const prompt = buildModelPrompt({
      dictionary: ['Fastify', 'zod'],
      hints: ['ZOD', 'Sensei'],
      language: 'ru',
    });

    expect(prompt.text).toBe(
      'Привет. Это текст на русском с английскими терминами: Fastify, ZOD, Sensei.',
    );
    expect(prompt.dictionaryUsed).toBe(2);
  });

  it('respects a smaller budget given by the caller', () => {
    const prompt = buildModelPrompt({
      dictionary: ['Kubernetes', 'TypeScript'],
      hints: [],
      language: 'en',
      tokenBudget: estimateTokens(
        'Hello. This is a text in English with technical terms: Kubernetes.',
      ),
    });

    expect(prompt.dictionaryUsed).toBe(1);
  });

  it('estimates tokens with the calibrated characters-per-token ratio', () => {
    expect(CHARS_PER_TOKEN).toBe(2);
    expect(estimateTokens('abcde')).toBe(3);
  });
});
