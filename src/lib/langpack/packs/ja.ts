/**
 * Japanese Language Pack
 *
 * Provides Japanese-specific text processing with NFKC normalization,
 * full-width/half-width conversion, and bigram tokenization for CJK/kana.
 *
 * @module lib/langpack/packs/ja
 */

import type { LanguagePack, Token } from '../types';

// =============================================================================
// Character Classification
// =============================================================================

/** Check if a character is a CJK ideograph (Kanji) */
function isKanji(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x4E00 && code <= 0x9FFF) ||
    (code >= 0x3400 && code <= 0x4DBF) ||
    (code >= 0xF900 && code <= 0xFAFF) ||
    (code >= 0x20000 && code <= 0x2A6DF)
  );
}

/** Check if a character is Hiragana */
function isHiragana(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code >= 0x3040 && code <= 0x309F;
}

/** Check if a character is Katakana */
function isKatakana(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (code >= 0x30A0 && code <= 0x30FF) || (code >= 0xFF66 && code <= 0xFF9F);
}

/** Check if a character is any Japanese script (kanji, hiragana, katakana) */
function isJapanese(char: string): boolean {
  return isKanji(char) || isHiragana(char) || isKatakana(char);
}

// =============================================================================
// Japanese Particles (common grammatical particles to split on)
// =============================================================================

const PARTICLES = new Set([
  '\u306F', // は (wa - topic)
  '\u304C', // が (ga - subject)
  '\u3092', // を (wo - object)
  '\u306B', // に (ni - indirect object/location)
  '\u3067', // で (de - location/means)
  '\u3068', // と (to - and/with)
  '\u3082', // も (mo - also)
  '\u306E', // の (no - possessive)
  '\u304B', // か (ka - question)
  '\u3088', // よ (yo - emphasis)
  '\u306D', // ね (ne - confirmation)
  '\u3078', // へ (he - direction)
  '\u304B\u3089', // から (kara - from)
  '\u307E\u3067', // まで (made - until)
]);

// =============================================================================
// Helper Functions
// =============================================================================

/** Full-width ASCII to half-width */
function fullWidthToHalfWidth(text: string): string {
  return text
    .replace(/[\uFF01-\uFF5E]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
    )
    .replace(/\u3000/g, ' ');
}

/** Half-width katakana to full-width */
function halfToFullKatakana(text: string): string {
  const halfToFull: Record<string, string> = {
    '\uFF66': '\u30F2', '\uFF67': '\u30A1', '\uFF68': '\u30A3', '\uFF69': '\u30A5',
    '\uFF6A': '\u30A7', '\uFF6B': '\u30A9', '\uFF6C': '\u30E3', '\uFF6D': '\u30E5',
    '\uFF6E': '\u30E7', '\uFF6F': '\u30C3', '\uFF70': '\u30FC', '\uFF71': '\u30A2',
    '\uFF72': '\u30A4', '\uFF73': '\u30A6', '\uFF74': '\u30A8', '\uFF75': '\u30AA',
    '\uFF76': '\u30AB', '\uFF77': '\u30AD', '\uFF78': '\u30AF', '\uFF79': '\u30B1',
    '\uFF7A': '\u30B3', '\uFF7B': '\u30B5', '\uFF7C': '\u30B7', '\uFF7D': '\u30B9',
    '\uFF7E': '\u30BB', '\uFF7F': '\u30BD', '\uFF80': '\u30BF', '\uFF81': '\u30C1',
    '\uFF82': '\u30C4', '\uFF83': '\u30C6', '\uFF84': '\u30C8', '\uFF85': '\u30CA',
    '\uFF86': '\u30CB', '\uFF87': '\u30CC', '\uFF88': '\u30CD', '\uFF89': '\u30CE',
    '\uFF8A': '\u30CF', '\uFF8B': '\u30D2', '\uFF8C': '\u30D5', '\uFF8D': '\u30D8',
    '\uFF8E': '\u30DB', '\uFF8F': '\u30DE', '\uFF90': '\u30DF', '\uFF91': '\u30E0',
    '\uFF92': '\u30E1', '\uFF93': '\u30E2', '\uFF94': '\u30E4', '\uFF95': '\u30E6',
    '\uFF96': '\u30E8', '\uFF97': '\u30E9', '\uFF98': '\u30EA', '\uFF99': '\u30EB',
    '\uFF9A': '\u30EC', '\uFF9B': '\u30ED', '\uFF9C': '\u30EF', '\uFF9D': '\u30F3',
  };

  let result = '';
  for (const char of text) {
    result += halfToFull[char] ?? char;
  }
  return result;
}

/** Generate bigrams from an array of characters */
function generateBigrams(chars: string[]): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < chars.length - 1; i++) {
    bigrams.push(chars[i] + chars[i + 1]);
  }
  return bigrams;
}

/**
 * Split text into segments between particles.
 * Returns meaningful word segments for search.
 */
function splitByParticles(text: string): string[] {
  const segments: string[] = [];
  let current = '';

  const chars = [...text];
  let i = 0;

  while (i < chars.length) {
    // Check for two-character particles first
    if (i + 1 < chars.length) {
      const twoChar = chars[i] + chars[i + 1];
      if (PARTICLES.has(twoChar)) {
        if (current.length > 0) {
          segments.push(current);
          current = '';
        }
        i += 2;
        continue;
      }
    }
    // Check single-character particles
    if (PARTICLES.has(chars[i]) && current.length > 0) {
      segments.push(current);
      current = '';
      i++;
      continue;
    }

    if (/\s/.test(chars[i])) {
      if (current.length > 0) {
        segments.push(current);
        current = '';
      }
      i++;
      continue;
    }

    current += chars[i];
    i++;
  }

  if (current.length > 0) {
    segments.push(current);
  }

  return segments;
}

// =============================================================================
// Japanese Language Pack
// =============================================================================

export const jaLanguagePack: LanguagePack = {
  code: 'ja',
  name: 'Japanese',
  nativeName: '\u65E5\u672C\u8A9E',
  script: 'hiragana',
  alternateScripts: ['katakana', 'han_simplified'],
  direction: 'ltr',

  normalize(text: string): string {
    let result = text.normalize('NFKC');
    result = fullWidthToHalfWidth(result);
    result = halfToFullKatakana(result);
    result = result.replace(/\s+/g, ' ').trim();
    return result;
  },

  tokenize(text: string): Token[] {
    const normalized = this.normalize(text);
    const tokens: Token[] = [];
    let i = 0;

    while (i < normalized.length) {
      const char = normalized[i];

      if (/\s/.test(char)) {
        i++;
        continue;
      }

      if (isJapanese(char)) {
        // Each Japanese character becomes its own token
        tokens.push({
          text: char,
          normalized: char,
          start: i,
          end: i + 1,
          type: 'word',
        });
        i++;
      } else if (/[\p{L}\p{N}]/u.test(char)) {
        // Collect Latin/numeric sequences
        let word = '';
        const start = i;
        while (i < normalized.length && /[\p{L}\p{N}]/u.test(normalized[i]) && !isJapanese(normalized[i])) {
          word += normalized[i];
          i++;
        }
        tokens.push({
          text: word,
          normalized: word.toLowerCase(),
          start,
          end: i,
          type: /^\d+$/.test(word) ? 'number' : 'word',
        });
      } else {
        tokens.push({
          text: char,
          normalized: char,
          start: i,
          end: i + 1,
          type: /\p{P}/u.test(char) ? 'punctuation' : 'symbol',
        });
        i++;
      }
    }

    return tokens;
  },

  getSearchTokens(text: string): string[] {
    const normalized = this.normalize(text).toLowerCase();
    const tokens = new Set<string>();

    // Split by particles to get meaningful word segments
    const segments = splitByParticles(normalized);
    for (const segment of segments) {
      if (/^\p{P}+$/u.test(segment)) continue;
      const cleaned = segment.replace(/[\p{P}]/gu, '');
      if (!cleaned) continue;
      tokens.add(cleaned);
    }

    // Generate bigrams for Japanese characters
    const japaneseChars = [...normalized].filter((c) => isJapanese(c));
    if (japaneseChars.length >= 2) {
      const bigrams = generateBigrams(japaneseChars);
      for (const bigram of bigrams) {
        tokens.add(bigram);
      }
    }

    // Add individual characters for single-kanji searches
    for (const char of japaneseChars) {
      if (isKanji(char)) {
        tokens.add(char);
      }
    }

    // Add any Latin words
    const latinWords = normalized.match(/[a-z0-9]+/g);
    if (latinWords) {
      for (const word of latinWords) {
        tokens.add(word);
      }
    }

    return Array.from(tokens).filter((t) => t.length > 0);
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
    wordSegmentation: true,
  },
};
