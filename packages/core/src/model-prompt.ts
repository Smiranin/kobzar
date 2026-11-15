import type { Language } from './contract/common.js';
import { uniqueIgnoringCase } from './dictionary.js';

/**
 * Tokens the model prompt may take. whisper.cpp keeps at most 223 (`n_text_ctx / 2 - 1`) and cuts
 * from the start; 23 are left as a margin for the estimate below.
 */
export const MODEL_PROMPT_TOKEN_BUDGET = 200;

/**
 * Kobzar has no Whisper tokenizer, so tokens are estimated from characters. Measured in Stage 0:
 * Latin terms 2.87 characters per token, Cyrillic words 2.24, a mixed prompt 2.64; 2.0 stays
 * below the worst case.
 */
export const CHARS_PER_TOKEN = 2.0;

const TERM_SEPARATOR = ', ';

/**
 * The lead-in sentences. Stage 0 showed the model takes its punctuation and capitals from the
 * prompt: without a punctuated sentence turbo returned Russian with no punctuation at all.
 */
const LEAD_IN: Record<Language, { alone: string; beforeTerms: string }> = {
  ru: {
    alone: 'Привет. Это текст на русском.',
    beforeTerms: 'Привет. Это текст на русском с английскими терминами: ',
  },
  en: {
    alone: 'Hello. This is a text in English.',
    beforeTerms: 'Hello. This is a text in English with technical terms: ',
  },
};

export interface ModelPromptInput {
  dictionary: readonly string[];
  hints: readonly string[];
  language: Language;
  tokenBudget?: number;
}

export interface ModelPrompt {
  text: string;
  /** How many Dictionary entries fitted the budget. */
  dictionaryUsed: number;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function promptText(language: Language, terms: readonly string[]): string {
  const lead = LEAD_IN[language];
  return terms.length === 0 ? lead.alone : `${lead.beforeTerms}${terms.join(TERM_SEPARATOR)}.`;
}

/**
 * The model prompt of one Recording. Hints are always included; Dictionary entries are taken from
 * the top of the file while the estimate stays within the budget. Dictionary entries come first and
 * hints last, so if the estimate is ever too generous whisper.cpp cuts Dictionary entries, not hints.
 */
export function buildModelPrompt(input: ModelPromptInput): ModelPrompt {
  const budget = input.tokenBudget ?? MODEL_PROMPT_TOKEN_BUDGET;
  const hints = uniqueIgnoringCase(input.hints);
  const hintKeys = new Set(hints.map((hint) => hint.toLowerCase()));
  const dictionary = uniqueIgnoringCase(input.dictionary);
  // An entry that is also a hint reaches the model through the hint and counts as used.
  const alsoHints = dictionary.filter((entry) => hintKeys.has(entry.toLowerCase())).length;
  const candidates = dictionary.filter((entry) => !hintKeys.has(entry.toLowerCase()));

  const used: string[] = [];
  for (const entry of candidates) {
    const next = promptText(input.language, [...used, entry, ...hints]);
    // Stop at the first entry that does not fit: the top of the file is what the owner ranks highest.
    if (estimateTokens(next) > budget) break;
    used.push(entry);
  }
  return {
    text: promptText(input.language, [...used, ...hints]),
    dictionaryUsed: used.length + alsoHints,
  };
}
