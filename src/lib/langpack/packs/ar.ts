/**
 * Arabic Language Pack
 *
 * Provides Arabic-specific text processing with diacritic removal,
 * alef normalization, definite article handling, and RTL support.
 *
 * @module lib/langpack/packs/ar
 */

import type { LanguagePack, Token } from '../types';

// =============================================================================
// Arabic Diacritics (Tashkeel)
// =============================================================================

/**
 * Arabic diacritical marks (tashkeel) to remove for normalization.
 * These are vowel marks that are optional in most Arabic text.
 */
const TASHKEEL_REGEX = /[\u064B-\u065F\u0670]/g;
// Includes: Fathatan, Dammatan, Kasratan, Fatha, Damma, Kasra,
//           Shadda, Sukun, and Superscript Alef

// =============================================================================
// Alef Normalization
// =============================================================================

/**
 * Normalize all Alef variants to plain Alef (U+0627)
 */
const ALEF_VARIANTS: Record<string, string> = {
  '\u0622': '\u0627', // Alef with Madda Above
  '\u0623': '\u0627', // Alef with Hamza Above
  '\u0625': '\u0627', // Alef with Hamza Below
  '\u0671': '\u0627', // Alef Wasla
};

// =============================================================================
// Common Prefixes
// =============================================================================

/** The Arabic definite article "al-" (ال) */
const DEFINITE_ARTICLE = '\u0627\u0644'; // ال

/** Common Arabic prefixes to strip for stemming */
const PREFIXES = [
  '\u0648\u0627\u0644', // وال (and the)
  '\u0628\u0627\u0644', // بال (with the)
  '\u0643\u0627\u0644', // كال (like the)
  '\u0641\u0627\u0644', // فال (so the)
  '\u0644\u0644',       // لل (for the)
  DEFINITE_ARTICLE,     // ال (the)
  '\u0648',             // و (and) - single character, check last
  '\u0641',             // ف (so)
  '\u0628',             // ب (with/by)
  '\u0644',             // ل (for/to)
];

/** Common Arabic suffixes to strip for stemming */
const SUFFIXES = [
  '\u0627\u062A',   // ات (feminine plural)
  '\u0648\u0646',   // ون (masculine plural)
  '\u064A\u0646',   // ين (masculine plural oblique)
  '\u0627\u0646',   // ان (dual)
  '\u062A\u064A\u0646', // تين (feminine dual oblique)
  '\u0629',         // ة (taa marbuta)
  '\u0647',         // ه (his/its)
  '\u0647\u0627',   // ها (her/its)
  '\u0647\u0645',   // هم (their)
];

// =============================================================================
// Helper Functions
// =============================================================================

/** Check if a character is Arabic */
function isArabic(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x0600 && code <= 0x06FF) || // Arabic
    (code >= 0x0750 && code <= 0x077F) || // Arabic Supplement
    (code >= 0xFB50 && code <= 0xFDFF) || // Arabic Presentation Forms-A
    (code >= 0xFE70 && code <= 0xFEFF)    // Arabic Presentation Forms-B
  );
}

/** Remove tashkeel (diacritics) from Arabic text */
function removeTashkeel(text: string): string {
  return text.replace(TASHKEEL_REGEX, '');
}

/** Normalize alef variants */
function normalizeAlef(text: string): string {
  let result = text;
  for (const [variant, normalized] of Object.entries(ALEF_VARIANTS)) {
    result = result.replace(new RegExp(variant, 'g'), normalized);
  }
  return result;
}

/** Remove tatweel (kashida) elongation character */
function removeTatweel(text: string): string {
  return text.replace(/\u0640/g, '');
}

/** Normalize taa marbuta to haa for search */
function normalizeTaaMarbuta(text: string): string {
  return text.replace(/\u0629/g, '\u0647');
}

/**
 * Remove common prefix from an Arabic word.
 * Returns the word with the longest matching prefix removed,
 * but only if the remaining stem has at least 2 characters.
 */
function removePrefix(word: string): string {
  for (const prefix of PREFIXES) {
    if (word.startsWith(prefix) && word.length - prefix.length >= 2) {
      return word.slice(prefix.length);
    }
  }
  return word;
}

/**
 * Remove common suffix from an Arabic word.
 * Returns the word with the longest matching suffix removed,
 * but only if the remaining stem has at least 2 characters.
 */
function removeSuffix(word: string): string {
  for (const suffix of SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 2) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

// =============================================================================
// Arabic Language Pack
// =============================================================================

export const arLanguagePack: LanguagePack = {
  code: 'ar',
  name: 'Arabic',
  nativeName: '\u0627\u0644\u0639\u0631\u0628\u064A\u0629',
  script: 'arabic',
  direction: 'rtl',

  normalize(text: string): string {
    let result = text.normalize('NFC');
    result = removeTashkeel(result);
    result = normalizeAlef(result);
    result = removeTatweel(result);
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
      } else if (/^[\d\u0660-\u0669]+$/.test(word)) {
        type = 'number';
      } else if (/^\p{S}+$/u.test(word)) {
        type = 'symbol';
      }

      // For Arabic words, strip the definite article in normalized form
      let normalizedWord = word;
      if ([...word].some(isArabic)) {
        normalizedWord = removePrefix(word);
      }

      tokens.push({
        text: word,
        normalized: normalizedWord,
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

      // Add the full normalized word
      tokens.add(cleaned);

      // Add the stemmed form (prefix + suffix removal)
      if ([...cleaned].some(isArabic)) {
        // Normalize taa marbuta for search
        let stemmed = normalizeTaaMarbuta(cleaned);
        stemmed = removePrefix(stemmed);
        stemmed = removeSuffix(stemmed);

        if (stemmed.length >= 2 && stemmed !== cleaned) {
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
