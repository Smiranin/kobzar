/** Marks a comment line in `dictionary.txt` and `invented-phrases.txt`. */
export const COMMENT_MARK = '#';

/** The meaningful lines of a list file: trimmed, without blank lines and `#` comments. */
export function listLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith(COMMENT_MARK));
}

/**
 * The Dictionary entries in file order. A repeated entry (ignoring letter case) is dropped and
 * the first spelling kept, so the order the owner chose decides what reaches the model prompt.
 */
export function parseDictionary(text: string): string[] {
  return uniqueIgnoringCase(listLines(text));
}

export function uniqueIgnoringCase(entries: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of entries) {
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result;
}
