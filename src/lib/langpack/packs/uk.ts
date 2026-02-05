/**
 * Ukrainian Language Pack
 *
 * Provides Ukrainian-specific text processing with Cyrillic normalization,
 * whitespace tokenization, and basic suffix removal for search.
 *
 * @module lib/langpack/packs/uk
 */

import type { LanguagePack, Token } from '../types';

// =============================================================================
// Ukrainian Suffix Patterns
// =============================================================================

/**
 * Common Ukrainian suffixes for basic stemming, ordered by length (longest first).
 * These cover common noun, adjective, and verb endings.
 */
const SUFFIXES = [
  // Noun case endings (plural)
  '\u0430\u043C\u0438',   // ами (instrumental plural)
  '\u044F\u043C\u0438',   // ями (instrumental plural)
  '\u0430\u0445',         // ах (prepositional plural)
  '\u044F\u0445',         // ях (prepositional plural)
  '\u0430\u043C',         // ам (dative plural)
  '\u044F\u043C',         // ям (dative plural)

  // Adjective endings
  '\u043E\u0433\u043E',   // ого (genitive masculine)
  '\u0456\u0439',         // ій (nominative masculine)
  '\u043E\u044E',         // ою (instrumental feminine)
  '\u0435\u044E',         // ею (instrumental feminine)
  '\u043E\u0457',         // ої (genitive feminine)
  '\u0435\u0457',         // ей -> not standard, skipping
  '\u043E\u043C\u0443',   // ому (dative masculine)

  // Verb endings
  '\u0443\u0432\u0430\u0442\u0438', // увати (infinitive)
  '\u044E\u0432\u0430\u0442\u0438', // ювати (infinitive)
  '\u0430\u0442\u0438',   // ати (infinitive)
  '\u0438\u0442\u0438',   // ити (infinitive)
  '\u043E\u0442\u0438',   // оти (infinitive)
  '\u0443\u0442\u0438',   // ути (infinitive)

  // Common noun endings
  '\u0456\u0432',         // ів (genitive plural)
  '\u043E\u043A',         // ок (diminutive)
  '\u043D\u043D\u044F',   // ння (verbal noun)
  '\u0442\u0442\u044F',   // ття (verbal noun)
  '\u0441\u0442\u0432\u043E', // ство (abstract noun)

  // Short endings
  '\u043E\u0432',         // ов (genitive plural variant)
  '\u0435\u0432',         // ев (genitive plural variant)
  '\u0438\u0439',         // ий (adjective masculine)
  '\u0438\u0445',         // их (genitive/prepositional plural adj)
  '\u043E\u044E',         // ою (instrumental feminine)
  '\u0456\u0439',         // ій (adjective masculine)

  // Minimal endings
  '\u043E\u043C',         // ом (instrumental masculine)
  '\u0435\u043C',         // ем (instrumental masculine)
  '\u0443',               // у (accusative/dative)
  '\u044E',               // ю (accusative/dative)
  '\u0430',               // а (genitive)
  '\u044F',               // я (genitive)
  '\u0456',               // і (plural nominative)
  '\u0438',               // и (plural nominative)
  '\u0435',               // е (vocative)
  '\u043E',               // о (vocative)
];

// =============================================================================
// Helper Functions
// =============================================================================

/** Check if a character is Cyrillic */
function isCyrillic(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x0400 && code <= 0x04FF) || // Cyrillic
    (code >= 0x0500 && code <= 0x052F)    // Cyrillic Supplement
  );
}

/**
 * Basic suffix removal for Ukrainian words.
 * Removes the longest matching suffix if the remaining stem
 * has at least 3 characters.
 */
function removeSuffix(word: string): string {
  const minStemLength = 3;

  for (const suffix of SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= minStemLength) {
      return word.slice(0, -suffix.length);
    }
  }

  return word;
}

// =============================================================================
// Ukrainian Language Pack
// =============================================================================

export const ukLanguagePack: LanguagePack = {
  code: 'uk',
  name: 'Ukrainian',
  nativeName: '\u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430',
  script: 'cyrillic',
  direction: 'ltr',

  normalize(text: string): string {
    let result = text.normalize('NFC');
    result = result.toLowerCase();
    // Normalize whitespace
    result = result.replace(/\s+/g, ' ').trim();
    return result;
  },

  tokenize(text: string): Token[] {
    const normalized = this.normalize(text);
    const tokens: Token[] = [];
    const regex = /([^\s]+)/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(normalized)) !== null) {
      const word = match[1];
      const start = match.index;
      const end = start + word.length;

      let type: Token['type'] = 'word';
      if (/^\p{P}+$/u.test(word)) {
        type = 'punctuation';
      } else if (/^\d+$/.test(word)) {
        type = 'number';
      } else if (/^\p{S}+$/u.test(word)) {
        type = 'symbol';
      }

      tokens.push({
        text: word,
        normalized: word.toLowerCase(),
        start,
        end,
        type,
      });
    }

    return tokens;
  },

  getSearchTokens(text: string): string[] {
    const normalized = this.normalize(text);
    const tokens = new Set<string>();

    const words = normalized.split(/\s+/).filter((w) => w.length > 0);

    for (const word of words) {
      // Skip pure punctuation
      if (/^\p{P}+$/u.test(word)) continue;

      const cleaned = word.replace(/[\p{P}]+$/u, '').replace(/^[\p{P}]+/u, '');
      if (!cleaned) continue;

      // Add the full word
      tokens.add(cleaned);

      // Add the stemmed form for Cyrillic words
      if ([...cleaned].some(isCyrillic) && cleaned.length > 3) {
        const stemmed = removeSuffix(cleaned);
        if (stemmed !== cleaned && stemmed.length >= 3) {
          tokens.add(stemmed);
        }
      }
    }

    return Array.from(tokens);
  },

  capabilities: {
    tokenization: true,
    lemmatization: false,
    ner: false,
    spellCheck: false,
    synonyms: false,
    phonetic: false,
    scriptConversion: false,
    translation: false,
    wordSegmentation: false,
  },
};
