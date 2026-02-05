/**
 * Indic Script Transliteration Transform
 *
 * Handles transliteration between Devanagari script and Latin (romanized) script.
 * Supports Hindi, Sanskrit, Marathi, and other Devanagari-based languages.
 *
 * Uses ITRANS-like mapping for Devanagari ↔ Latin conversion.
 *
 * @module lib/langpack/transforms/indic
 */

// =============================================================================
// Devanagari ↔ Latin Mapping (ITRANS-inspired)
// =============================================================================

const DEVANAGARI_VOWELS: Record<string, string> = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u',
  'ऊ': 'oo', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o',
  'औ': 'au', 'अं': 'am', 'अः': 'ah',
};

const DEVANAGARI_VOWEL_SIGNS: Record<string, string> = {
  'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo',
  'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
  'ं': 'n', 'ः': 'h', '्': '',
};

const DEVANAGARI_CONSONANTS: Record<string, string> = {
  'क': 'ka', 'ख': 'kha', 'ग': 'ga', 'घ': 'gha', 'ङ': 'nga',
  'च': 'cha', 'छ': 'chha', 'ज': 'ja', 'झ': 'jha', 'ञ': 'nya',
  'ट': 'ta', 'ठ': 'tha', 'ड': 'da', 'ढ': 'dha', 'ण': 'na',
  'त': 'ta', 'थ': 'tha', 'द': 'da', 'ध': 'dha', 'न': 'na',
  'प': 'pa', 'फ': 'pha', 'ब': 'ba', 'भ': 'bha', 'म': 'ma',
  'य': 'ya', 'र': 'ra', 'ल': 'la', 'व': 'va', 'श': 'sha',
  'ष': 'sha', 'स': 'sa', 'ह': 'ha',
  // Nukta variants
  'क़': 'qa', 'ख़': 'kha', 'ग़': 'ga', 'ज़': 'za', 'ड़': 'da',
  'ढ़': 'dha', 'फ़': 'fa',
};

const DEVANAGARI_NUMERALS: Record<string, string> = {
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
};

// Build reverse maps for Latin → Devanagari
const LATIN_TO_CONSONANT: Record<string, string> = {};
for (const [dev, lat] of Object.entries(DEVANAGARI_CONSONANTS)) {
  // Store the base (without inherent 'a')
  const base = lat.endsWith('a') ? lat.slice(0, -1) : lat;
  if (!LATIN_TO_CONSONANT[base] || dev.length < (LATIN_TO_CONSONANT[base] || '').length) {
    LATIN_TO_CONSONANT[lat] = dev;
  }
}

// =============================================================================
// Transliteration Functions
// =============================================================================

/**
 * Transliterate Devanagari text to Latin (romanized) script.
 * Uses a simplified ITRANS-like mapping.
 */
export function devanagariToLatin(text: string): string {
  let result = '';
  const chars = [...text]; // Handle multi-codepoint characters

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const nextChar = chars[i + 1] || '';

    // Check for two-char sequences first (vowels with anusvara/visarga)
    const twoChar = char + nextChar;
    if (DEVANAGARI_VOWELS[twoChar]) {
      result += DEVANAGARI_VOWELS[twoChar];
      i++; // Skip next char
      continue;
    }

    // Check numerals
    if (DEVANAGARI_NUMERALS[char]) {
      result += DEVANAGARI_NUMERALS[char];
      continue;
    }

    // Check standalone vowels
    if (DEVANAGARI_VOWELS[char]) {
      result += DEVANAGARI_VOWELS[char];
      continue;
    }

    // Check consonants
    if (DEVANAGARI_CONSONANTS[char]) {
      const consonantBase = DEVANAGARI_CONSONANTS[char];

      // Check for halant (virama) - removes inherent vowel
      if (nextChar === '्') {
        result += consonantBase.endsWith('a')
          ? consonantBase.slice(0, -1)
          : consonantBase;
        i++; // Skip halant
        continue;
      }

      // Check for vowel sign following the consonant
      if (DEVANAGARI_VOWEL_SIGNS[nextChar] !== undefined) {
        const base = consonantBase.endsWith('a')
          ? consonantBase.slice(0, -1)
          : consonantBase;
        result += base + DEVANAGARI_VOWEL_SIGNS[nextChar];
        i++; // Skip vowel sign
        continue;
      }

      // Consonant with inherent 'a'
      result += consonantBase;
      continue;
    }

    // Vowel signs in isolation
    if (DEVANAGARI_VOWEL_SIGNS[char] !== undefined) {
      result += DEVANAGARI_VOWEL_SIGNS[char];
      continue;
    }

    // Pass through other characters (spaces, punctuation, etc.)
    result += char;
  }

  return result;
}

/**
 * Check if text contains Devanagari characters
 */
export function containsDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

/**
 * Check if text contains Latin transliteration of Indic words
 * (heuristic: common Hindi romanized patterns)
 */
export function containsIndicRomanized(text: string): boolean {
  // Common Hindi romanized word patterns
  const indicPatterns = /\b(mein|hai|hain|hoon|kya|nahi|aur|tum|hum|yeh|woh|tha|thi|kuch|bahut|acha|theek)\b/i;
  return indicPatterns.test(text);
}

/**
 * Generate variants for cross-script search.
 * Given Devanagari text, returns the romanized form.
 * Given romanized text, indicates it might be Indic.
 */
export function getIndicVariants(text: string): {
  devanagari: string;
  romanized: string;
} {
  if (containsDevanagari(text)) {
    return {
      devanagari: text,
      romanized: devanagariToLatin(text),
    };
  }

  // For romanized input, we return as-is (reverse mapping is complex)
  return {
    devanagari: '', // Would need complex reverse mapping
    romanized: text,
  };
}
