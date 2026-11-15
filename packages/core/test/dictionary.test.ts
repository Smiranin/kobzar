import { describe, expect, it } from 'vitest';
import { parseDictionary } from '../src/index.js';

describe('parseDictionary', () => {
  it('keeps one entry per line in file order, trimmed', () => {
    expect(parseDictionary('  TypeScript \nFastify\r\nдеплой\n')).toEqual([
      'TypeScript',
      'Fastify',
      'деплой',
    ]);
  });

  it('skips blank lines and # comments', () => {
    expect(parseDictionary('# libraries\n\nVitest\n   \n  # slang\nворкараунд')).toEqual([
      'Vitest',
      'воркараунд',
    ]);
  });

  it('drops a repeated entry ignoring case and keeps the first spelling', () => {
    expect(parseDictionary('useEffect\nzod\nUseEffect\nZod')).toEqual(['useEffect', 'zod']);
  });

  it('gives no entries for an empty file', () => {
    expect(parseDictionary('')).toEqual([]);
  });
});
