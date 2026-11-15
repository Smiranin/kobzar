import { describe, expect, it } from 'vitest';
import { parseInventedPhrases, removeInventedPhrases } from '../src/index.js';

describe('invented phrases', () => {
  const phrases = parseInventedPhrases(
    '# on silence\nПродолжение следует...\nСубтитры сделал DimaTorzok\n',
  );

  it('drops a segment that is a listed phrase, ignoring case and punctuation', () => {
    expect(removeInventedPhrases([' продолжение следует'], phrases)).toBe('');
    expect(removeInventedPhrases([' Субтитры сделал DimaTorzok.'], phrases)).toBe('');
  });

  it('keeps real speech that merely contains the words', () => {
    expect(removeInventedPhrases([' Продолжение следует завтра.'], phrases)).toBe(
      'Продолжение следует завтра.',
    );
  });

  it('removes only the invented segment and keeps the rest', () => {
    expect(removeInventedPhrases([' Запусти тесты.', ' Продолжение следует...'], phrases)).toBe(
      'Запусти тесты.',
    );
  });

  it('joins segments as they are, so a word split between two segments stays whole', () => {
    expect(removeInventedPhrases([' Это оч', 'ередь задач.'], phrases)).toBe('Это очередь задач.');
  });

  it('collapses whitespace and line breaks and trims', () => {
    expect(removeInventedPhrases(['  Первая\nфраза.', '   Вторая.  '], phrases)).toBe(
      'Первая фраза. Вторая.',
    );
  });

  it('gives an empty text for no segments', () => {
    expect(removeInventedPhrases([], phrases)).toBe('');
  });
});
