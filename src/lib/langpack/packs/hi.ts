/**
 * Hindi Language Pack
 *
 * Provides Hindi-specific text processing with Devanagari normalization,
 * whitespace tokenization, and basic Devanagari-to-Latin transliteration.
 *
 * @module lib/langpack/packs/hi
 */

import type { LanguagePack, Token } from '../types';

// =============================================================================
// Devanagari to Latin Transliteration Map
// =============================================================================

const DEVANAGARI_TO_LATIN: Record<string, string> = {
  // Vowels
  '\u0905': 'a',    '\u0906': 'aa',   '\u0907': 'i',    '\u0908': 'ii',
  '\u0909': 'u',    '\u090A': 'uu',   '\u090B': 'ri',   '\u090F': 'e',
  '\u0910': 'ai',   '\u0913': 'o',    '\u0914': 'au',

  // Vowel signs (matras)
  '\u093E': 'aa',   '\u093F': 'i',    '\u0940': 'ii',   '\u0941': 'u',
  '\u0942': 'uu',   '\u0943': 'ri',   '\u0947': 'e',    '\u0948': 'ai',
  '\u094B': 'o',    '\u094C': 'au',

  // Consonants
  '\u0915': 'ka',   '\u0916': 'kha',  '\u0917': 'ga',   '\u0918': 'gha',
  '\u0919': 'nga',  '\u091A': 'cha',  '\u091B': 'chha', '\u091C': 'ja',
  '\u091D': 'jha',  '\u091E': 'nya',  '\u091F': 'ta',   '\u0920': 'tha',
  '\u0921': 'da',   '\u0922': 'dha',  '\u0923': 'na',   '\u0924': 'ta',
  '\u0925': 'tha',  '\u0926': 'da',   '\u0927': 'dha',  '\u0928': 'na',
  '\u092A': 'pa',   '\u092B': 'pha',  '\u092C': 'ba',   '\u092D': 'bha',
  '\u092E': 'ma',   '\u092F': 'ya',   '\u0930': 'ra',   '\u0932': 'la',
  '\u0935': 'va',   '\u0936': 'sha',  '\u0937': 'sha',  '\u0938': 'sa',
  '\u0939': 'ha',

  // Special characters
  '\u0902': 'n',    // Anusvara
  '\u0903': 'h',    // Visarga
  '\u093D': '',     // Avagraha
  '\u094D': '',     // Virama (halant) - suppresses inherent vowel
  '\u0901': 'n',    // Chandrabindu
  '\u0950': 'om',   // Om

  // Nukta forms
  '\u0958': 'qa',   '\u0959': 'khha', '\u095A': 'ghha', '\u095B': 'za',
  '\u095C': 'dda',  '\u095D': 'ddha', '\u095E': 'fa',   '\u095F': 'ya',

  // Digits
  '\u0966': '0',    '\u0967': '1',    '\u0968': '2',    '\u0969': '3',
  '\u096A': '4',    '\u096B': '5',    '\u096C': '6',    '\u096D': '7',
  '\u096E': '8',    '\u096F': '9',
};

// =============================================================================
// Helper Functions
// =============================================================================

/** Check if a character is Devanagari */
function isDevanagari(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code >= 0x0900 && code <= 0x097F;
}

/** Normalize Devanagari-specific forms */
function normalizeDevanagari(text: string): string {
  let result = text;

  // Normalize nukta forms to base + nukta
  const nuktaNormalizations: Record<string, string> = {
    '\u0929': '\u0928\u093C', // ऩ -> न + nukta
    '\u0931': '\u0930\u093C', // ऱ -> र + nukta
    '\u0934': '\u0933\u093C', // ऴ -> ळ + nukta
  };

  for (const [from, to] of Object.entries(nuktaNormalizations)) {
    result = result.replace(new RegExp(from, 'g'), to);
  }

  return result;
}

/**
 * Transliterate Devanagari text to Latin script.
 * Uses a simple character-by-character mapping with virama handling.
 */
function transliterateDevanagari(text: string): string {
  let result = '';
  const chars = [...text];

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const code = char.codePointAt(0) ?? 0;

    // Skip virama - it suppresses the inherent 'a' vowel
    if (code === 0x094D) {
      // If previous transliteration ends with 'a' from consonant, remove it
      if (result.endsWith('a') && i > 0 && isDevanagari(chars[i - 1])) {
        result = result.slice(0, -1);
      }
      continue;
    }

    // Check for vowel signs (matras) - replace inherent 'a'
    if (code >= 0x093E && code <= 0x094C) {
      // Remove the inherent 'a' from the previous consonant
      if (result.endsWith('a') && i > 0) {
        result = result.slice(0, -1);
      }
      result += DEVANAGARI_TO_LATIN[char] ?? '';
      continue;
    }

    // Map the character
    if (char in DEVANAGARI_TO_LATIN) {
      result += DEVANAGARI_TO_LATIN[char];
    } else if (/\s/.test(char)) {
      result += ' ';
    } else if (!isDevanagari(char)) {
      result += char; // Pass through non-Devanagari
    }
  }

  return result;
}

// =============================================================================
// Hindi Language Pack
// =============================================================================

export const hiLanguagePack: LanguagePack = {
  code: 'hi',
  name: 'Hindi',
  nativeName: '\u0939\u093F\u0928\u094D\u0926\u0940',
  script: 'devanagari',
  direction: 'ltr',

  normalize(text: string): string {
    let result = text.normalize('NFC');
    result = normalizeDevanagari(result);
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
      } else if (/^[\d\u0966-\u096F]+$/.test(word)) {
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
    const normalized = this.normalize(text).toLowerCase();
    const tokens = new Set<string>();

    const words = normalized.split(/\s+/).filter((w) => w.length > 0);

    for (const word of words) {
      // Skip pure punctuation
      if (/^\p{P}+$/u.test(word)) continue;

      const cleaned = word.replace(/[\p{P}]+$/u, '').replace(/^[\p{P}]+/u, '');
      if (!cleaned) continue;

      tokens.add(cleaned);

      // Add transliterated form if word contains Devanagari
      if ([...cleaned].some(isDevanagari)) {
        const romanized = transliterateDevanagari(cleaned).toLowerCase().trim();
        if (romanized && romanized !== cleaned) {
          tokens.add(romanized);
        }
      }
    }

    return Array.from(tokens);
  },

  transliterate(text: string): string {
    return transliterateDevanagari(text);
  },

  capabilities: {
    tokenization: true,
    lemmatization: false,
    ner: false,
    spellCheck: false,
    synonyms: false,
    phonetic: true,
    scriptConversion: false,
    translation: false,
    wordSegmentation: false,
  },
};
