/**
 * Text Normalization
 *
 * Provides Unicode normalization and language-specific text cleanup.
 *
 * @module lib/langpack/normalizer
 */

import type { NormalizationOptions, ScriptType } from './types';

// =============================================================================
// Unicode Normalization
// =============================================================================

/**
 * Normalize text using specified Unicode normalization form
 *
 * @param text - Text to normalize
 * @param form - Normalization form (NFC, NFD, NFKC, NFKD)
 * @returns Normalized text
 */
export function unicodeNormalize(
  text: string,
  form: 'NFC' | 'NFD' | 'NFKC' | 'NFKD' = 'NFKC'
): string {
  return text.normalize(form);
}

// =============================================================================
// Zero-Width Character Handling
// =============================================================================

/**
 * Zero-width characters that may need special handling
 */
const ZERO_WIDTH_CHARS = [
  '\u200B', // Zero Width Space
  '\u200C', // Zero Width Non-Joiner (ZWNJ)
  '\u200D', // Zero Width Joiner (ZWJ)
  '\u200E', // Left-to-Right Mark
  '\u200F', // Right-to-Left Mark
  '\u2060', // Word Joiner
  '\uFEFF', // Byte Order Mark
];

/**
 * Remove zero-width characters from text
 *
 * Note: Be careful with ZWJ/ZWNJ in scripts like Devanagari where they affect rendering
 */
export function removeZeroWidthChars(text: string, preserveJoiners = false): string {
  if (preserveJoiners) {
    // Keep ZWJ and ZWNJ for Indic scripts
    return text.replace(/[\u200B\u200E\u200F\u2060\uFEFF]/g, '');
  }
  return text.replace(new RegExp(`[${ZERO_WIDTH_CHARS.join('')}]`, 'g'), '');
}

// =============================================================================
// Whitespace Normalization
// =============================================================================

/**
 * Various Unicode whitespace characters
 */
const WHITESPACE_CHARS = [
  '\u0020', // Space
  '\u00A0', // No-Break Space
  '\u1680', // Ogham Space Mark
  '\u2000', // En Quad
  '\u2001', // Em Quad
  '\u2002', // En Space
  '\u2003', // Em Space
  '\u2004', // Three-Per-Em Space
  '\u2005', // Four-Per-Em Space
  '\u2006', // Six-Per-Em Space
  '\u2007', // Figure Space
  '\u2008', // Punctuation Space
  '\u2009', // Thin Space
  '\u200A', // Hair Space
  '\u202F', // Narrow No-Break Space
  '\u205F', // Medium Mathematical Space
  '\u3000', // Ideographic Space
];

/**
 * Normalize whitespace to standard spaces
 */
export function normalizeWhitespace(text: string): string {
  // Replace all Unicode whitespace with regular space
  let result = text.replace(new RegExp(`[${WHITESPACE_CHARS.join('')}]`, 'g'), ' ');

  // Collapse multiple spaces
  result = result.replace(/  +/g, ' ');

  // Trim
  return result.trim();
}

// =============================================================================
// Diacritic Removal
// =============================================================================

/**
 * Remove diacritics/accents from text
 *
 * Uses Unicode NFD normalization to separate base characters from combining marks
 */
export function removeDiacritics(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Combining Diacritical Marks
    .normalize('NFC');
}

// =============================================================================
// Punctuation Normalization
// =============================================================================

/**
 * Punctuation normalization mappings
 */
const PUNCTUATION_MAP: Record<string, string> = {
  // Quotes
  '\u2018': "'", // Left Single Quote
  '\u2019': "'", // Right Single Quote
  '\u201A': "'", // Single Low-9 Quote
  '\u201B': "'", // Single High-Reversed-9 Quote
  '\u201C': '"', // Left Double Quote
  '\u201D': '"', // Right Double Quote
  '\u201E': '"', // Double Low-9 Quote
  '\u201F': '"', // Double High-Reversed-9 Quote
  '\u2039': "'", // Single Left-Pointing Angle Quote
  '\u203A': "'", // Single Right-Pointing Angle Quote
  '\u00AB': '"', // Left-Pointing Double Angle Quote
  '\u00BB': '"', // Right-Pointing Double Angle Quote

  // Dashes
  '\u2010': '-', // Hyphen
  '\u2011': '-', // Non-Breaking Hyphen
  '\u2012': '-', // Figure Dash
  '\u2013': '-', // En Dash
  '\u2014': '-', // Em Dash
  '\u2015': '-', // Horizontal Bar
  '\u2212': '-', // Minus Sign

  // Ellipsis
  '\u2026': '...', // Horizontal Ellipsis

  // Other
  '\u00B7': '.', // Middle Dot
  '\u2022': '*', // Bullet
  '\u2023': '*', // Triangular Bullet
  '\u2043': '-', // Hyphen Bullet
};

/**
 * Normalize punctuation to ASCII equivalents
 */
export function normalizePunctuation(text: string): string {
  let result = text;
  for (const [unicode, ascii] of Object.entries(PUNCTUATION_MAP)) {
    result = result.replace(new RegExp(unicode, 'g'), ascii);
  }
  return result;
}

/**
 * Remove all punctuation from text
 */
export function removePunctuation(text: string): string {
  return text.replace(/[\p{P}\p{S}]/gu, '');
}

// =============================================================================
// Script-Specific Normalization
// =============================================================================

/**
 * Normalize Chinese text
 * - Full-width to half-width conversion
 * - Punctuation normalization
 */
export function normalizeChineseText(text: string): string {
  let result = text;

  // Full-width ASCII to half-width
  result = result.replace(/[\uFF01-\uFF5E]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xFEE0)
  );

  // Ideographic space to regular space
  result = result.replace(/\u3000/g, ' ');

  // Chinese punctuation normalization
  const chinesePunctuation: Record<string, string> = {
    '\u3002': '.', // Ideographic Full Stop
    '\uFF0C': ',', // Fullwidth Comma
    '\u3001': ',', // Ideographic Comma
    '\uFF1F': '?', // Fullwidth Question Mark
    '\uFF01': '!', // Fullwidth Exclamation Mark
    '\uFF1A': ':', // Fullwidth Colon
    '\uFF1B': ';', // Fullwidth Semicolon
    '\u300C': '"', // Left Corner Bracket
    '\u300D': '"', // Right Corner Bracket
    '\u300E': '"', // Left White Corner Bracket
    '\u300F': '"', // Right White Corner Bracket
  };

  for (const [cn, ascii] of Object.entries(chinesePunctuation)) {
    result = result.replace(new RegExp(cn, 'g'), ascii);
  }

  return result;
}

/**
 * Normalize Indic text
 * - Handle ZWJ/ZWNJ properly
 * - Normalize Nukta forms
 */
export function normalizeIndicText(text: string): string {
  // NFKC normalization preserves ZWJ/ZWNJ while normalizing other forms
  let result = text.normalize('NFKC');

  // Normalize common variations (Hindi example)
  // Note: Add more script-specific normalizations as needed
  const indicNormalizations: Record<string, string> = {
    '\u0929': '\u0928\u093C', // ऩ → न + nukta
    '\u0931': '\u0930\u093C', // ऱ → र + nukta
    '\u0934': '\u0933\u093C', // ऴ → ळ + nukta
  };

  for (const [from, to] of Object.entries(indicNormalizations)) {
    result = result.replace(new RegExp(from, 'g'), to);
  }

  return result;
}

/**
 * Normalize Arabic text
 * - Remove Tatweel (kashida)
 * - Normalize Alef variations
 */
export function normalizeArabicText(text: string): string {
  let result = text;

  // Remove Tatweel (elongation character)
  result = result.replace(/\u0640/g, '');

  // Normalize Alef variations
  const alefNormalizations: Record<string, string> = {
    '\u0622': '\u0627', // Alef with Madda → Alef
    '\u0623': '\u0627', // Alef with Hamza Above → Alef
    '\u0625': '\u0627', // Alef with Hamza Below → Alef
    '\u0671': '\u0627', // Alef Wasla → Alef
  };

  for (const [from, to] of Object.entries(alefNormalizations)) {
    result = result.replace(new RegExp(from, 'g'), to);
  }

  return result;
}

/**
 * Normalize Cyrillic text
 * - Handle common letter variations
 */
export function normalizeCyrillicText(text: string): string {
  const result = text.normalize('NFKC');

  // Normalize common variations
  const cyrillicNormalizations: Record<string, string> = {
    '\u0451': '\u0435', // ё → е (optional, depends on use case)
    '\u0419': '\u0418', // Й → И (optional)
  };

  // Note: These normalizations are optional and may not be desired
  // Uncomment if needed for your use case
  // for (const [from, to] of Object.entries(cyrillicNormalizations)) {
  //   result = result.replace(new RegExp(from, 'g'), to);
  // }

  return result;
}

// =============================================================================
// Main Normalization Function
// =============================================================================

/**
 * Normalize text with configurable options
 *
 * @param text - Text to normalize
 * @param options - Normalization options
 * @param script - Optional script hint for language-specific normalization
 * @returns Normalized text
 */
export function normalize(
  text: string,
  options: NormalizationOptions = {},
  script?: ScriptType
): string {
  const {
    form = 'NFKC',
    lowercase = false,
    removeDiacritics: shouldRemoveDiacritics = false,
    normalizeWhitespace: shouldNormalizeWhitespace = true,
    removePunctuation: shouldRemovePunctuation = false,
    removeZeroWidth = true,
    languageSpecific = true,
  } = options;

  let result = text;

  // Unicode normalization first
  result = unicodeNormalize(result, form);

  // Script-specific normalization
  if (languageSpecific && script) {
    switch (script) {
      case 'han_simplified':
      case 'han_traditional':
        result = normalizeChineseText(result);
        break;
      case 'devanagari':
      case 'bengali':
      case 'tamil':
      case 'telugu':
      case 'gujarati':
      case 'kannada':
      case 'malayalam':
      case 'punjabi':
        result = normalizeIndicText(result);
        break;
      case 'arabic':
        result = normalizeArabicText(result);
        break;
      case 'cyrillic':
        result = normalizeCyrillicText(result);
        break;
    }
  }

  // Zero-width character removal
  if (removeZeroWidth) {
    // Preserve joiners for Indic scripts
    const preserveJoiners = script
      ? ['devanagari', 'bengali', 'tamil', 'telugu', 'gujarati', 'kannada', 'malayalam', 'punjabi'].includes(script)
      : false;
    result = removeZeroWidthChars(result, preserveJoiners);
  }

  // Whitespace normalization
  if (shouldNormalizeWhitespace) {
    result = normalizeWhitespace(result);
  }

  // Diacritic removal
  if (shouldRemoveDiacritics) {
    result = removeDiacritics(result);
  }

  // Punctuation removal
  if (shouldRemovePunctuation) {
    result = removePunctuation(result);
  }

  // Lowercase
  if (lowercase) {
    result = result.toLowerCase();
  }

  return result;
}

/**
 * Quick normalization for search indexing
 * - NFKC normalization
 * - Lowercase
 * - Whitespace normalization
 */
export function normalizeForSearch(text: string, script?: ScriptType): string {
  return normalize(
    text,
    {
      form: 'NFKC',
      lowercase: true,
      normalizeWhitespace: true,
      removeZeroWidth: true,
      languageSpecific: true,
    },
    script
  );
}

/**
 * Quick normalization for display
 * - NFC normalization (preserves visual form)
 * - Whitespace normalization
 */
export function normalizeForDisplay(text: string): string {
  return normalize(text, {
    form: 'NFC',
    lowercase: false,
    normalizeWhitespace: true,
    removeZeroWidth: false,
    languageSpecific: false,
  });
}
