import { readFile } from 'node:fs/promises';
import { parseDictionary, parseInventedPhrases } from '@kobzar/core';

/** Reads a text file; a missing one is empty, any other failure is thrown with the path. */
async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw new Error(`Cannot read ${path}: ${(error as Error).message}`, { cause: error });
  }
}

/**
 * The two lists the owner edits by hand, read fresh for every Recording: they are small, and an
 * edit then applies to the next Recording without a restart (SPEC requirement 7).
 */
export class LocalFiles {
  constructor(
    readonly dictionaryPath: string,
    readonly inventedPhrasesPath: string,
  ) {}

  async dictionary(): Promise<string[]> {
    return parseDictionary(await readOptional(this.dictionaryPath));
  }

  async inventedPhrases(): Promise<Set<string>> {
    return parseInventedPhrases(await readOptional(this.inventedPhrasesPath));
  }
}
