/**
 * Korean Language Pack
 *
 * Provides Korean-specific text processing with Hangul jamo composition,
 * word boundary splitting, and character bigrams for partial matching.
 *
 * @module lib/langpack/packs/ko
 */

import type { LanguagePack, Token } from '../types';

// =============================================================================
// Hangul Constants
// =============================================================================

/** Hangul syllable block range */
const HANGUL_SYLLABLE_START = 0xAC00;
const HANGUL_SYLLABLE_END = 0xD7A3;

/** Hangul Jamo ranges */
const JAMO_INITIAL_START = 0x1100;   // Leading consonants (Choseong)
const JAMO_MEDIAL_START = 0x1161;    // Vowels (Jungseong)
const JAMO_FINAL_START = 0x11A8;     // Trailing consonants (Jongseong)

/** Compatibility Jamo range */
const COMPAT_JAMO_START = 0x3131;
const COMPAT_JAMO_END = 0x3163;

/** Number of possible medial/final combinations per initial */
const MEDIAL_COUNT = 21;
const FINAL_COUNT = 28; // 27 finals + no final

// =============================================================================
// Helper Functions
// =============================================================================

/** Check if a character is a Hangul syllable block */
function isHangulSyllable(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code >= HANGUL_SYLLABLE_START && code <= HANGUL_SYLLABLE_END;
}

/** Check if a character is any Hangul (syllable or jamo) */
function isHangul(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= HANGUL_SYLLABLE_START && code <= HANGUL_SYLLABLE_END) ||
    (code >= COMPAT_JAMO_START && code <= COMPAT_JAMO_END) ||
    (code >= 0x1100 && code <= 0x11FF) // Hangul Jamo
  );
}

/**
 * Compose Hangul compatibility jamo into syllable blocks where possible.
 * This handles sequences of compatibility jamo (U+3131-U+3163) and
 * composes them into proper syllable blocks.
 */
function composeHangulJamo(text: string): string {
  // Map compatibility jamo to initial/medial/final indices
  const initialMap: Record<number, number> = {
    0x3131: 0,  0x3132: 1,  0x3134: 2,  0x3137: 3,  0x3138: 4,
    0x3139: 5,  0x3141: 6,  0x3142: 7,  0x3143: 8,  0x3145: 9,
    0x3146: 10, 0x3147: 11, 0x3148: 12, 0x3149: 13, 0x314A: 14,
    0x314B: 15, 0x314C: 16, 0x314D: 17, 0x314E: 18,
  };

  const medialMap: Record<number, number> = {
    0x314F: 0,  0x3150: 1,  0x3151: 2,  0x3152: 3,  0x3153: 4,
    0x3154: 5,  0x3155: 6,  0x3156: 7,  0x3157: 8,  0x3158: 9,
    0x3159: 10, 0x315A: 11, 0x315B: 12, 0x315C: 13, 0x315D: 14,
    0x315E: 15, 0x315F: 16, 0x3160: 17, 0x3161: 18, 0x3162: 19,
    0x3163: 20,
  };

  const finalMap: Record<number, number> = {
    0x3131: 1,  0x3132: 2,  0x3133: 3,  0x3134: 4,  0x3135: 5,
    0x3136: 6,  0x3137: 7,  0x3139: 8,  0x313A: 9,  0x313B: 10,
    0x313C: 11, 0x313D: 12, 0x313E: 13, 0x313F: 14, 0x3140: 15,
    0x3141: 16, 0x3142: 17, 0x3144: 18, 0x3145: 19, 0x3146: 20,
    0x3147: 21, 0x3148: 22, 0x314A: 23, 0x314B: 24, 0x314C: 25,
    0x314D: 26, 0x314E: 27,
  };

  let result = '';
  let i = 0;

  while (i < text.length) {
    const code = text.charCodeAt(i);

    // Check if this could be the start of a syllable (initial consonant)
    if (code in initialMap && i + 1 < text.length) {
      const nextCode = text.charCodeAt(i + 1);
      if (nextCode in medialMap) {
        const initial = initialMap[code];
        const medial = medialMap[nextCode];
        let final_ = 0;
        let consumed = 2;

        // Check for a final consonant
        if (i + 2 < text.length) {
          const finalCode = text.charCodeAt(i + 2);
          if (finalCode in finalMap) {
            // Only consume final if the next char is NOT a medial vowel
            // (otherwise the final consonant is the initial of the next syllable)
            if (i + 3 >= text.length || !(text.charCodeAt(i + 3) in medialMap)) {
              final_ = finalMap[finalCode];
              consumed = 3;
            }
          }
        }

        const syllable = HANGUL_SYLLABLE_START + initial * MEDIAL_COUNT * FINAL_COUNT + medial * FINAL_COUNT + final_;
        result += String.fromCharCode(syllable);
        i += consumed;
        continue;
      }
    }

    result += text[i];
    i++;
  }

  return result;
}

/** Generate bigrams from a string of characters */
function generateBigrams(chars: string[]): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < chars.length - 1; i++) {
    bigrams.push(chars[i] + chars[i + 1]);
  }
  return bigrams;
}

// =============================================================================
// Korean Language Pack
// =============================================================================

export const koLanguagePack: LanguagePack = {
  code: 'ko',
  name: 'Korean',
  nativeName: '\uD55C\uAD6D\uC5B4',
  script: 'hangul',
  direction: 'ltr',

  normalize(text: string): string {
    let result = text.normalize('NFC');
    // Compose any loose jamo into syllable blocks
    result = composeHangulJamo(result);
    // Normalize whitespace
    result = result.replace(/\s+/g, ' ').trim();
    return result;
  },

  tokenize(text: string): Token[] {
    const normalized = this.normalize(text);
    const tokens: Token[] = [];
    // Korean uses spaces between words, so split on whitespace
    const regex = /([^\s]+)/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(normalized)) !== null) {
      const word = match[1];
      const start = match.index;
      const end = start + word.length;

      // Classify the token
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
    const normalized = this.normalize(text).toLowerCase();
    const tokens = new Set<string>();

    // Split on whitespace for word-level tokens
    const words = normalized.split(/\s+/).filter((w) => w.length > 0);

    for (const word of words) {
      // Skip pure punctuation
      if (/^\p{P}+$/u.test(word)) continue;

      // Remove trailing punctuation from word
      const cleaned = word.replace(/[\p{P}]+$/u, '').replace(/^[\p{P}]+/u, '');
      if (!cleaned) continue;

      tokens.add(cleaned);

      // Generate character bigrams for partial matching of Hangul
      const hangulChars = [...cleaned].filter((c) => isHangul(c));
      if (hangulChars.length >= 2) {
        const bigrams = generateBigrams(hangulChars);
        for (const bigram of bigrams) {
          tokens.add(bigram);
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
    wordSegmentation: true,
  },
};
