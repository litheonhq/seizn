/**
 * Language Pack Module
 *
 * Provides multilingual text processing capabilities including:
 * - Language detection
 * - Text normalization
 * - Tokenization
 * - Language-specific processing
 *
 * @module lib/langpack
 */

// =============================================================================
// Types
// =============================================================================

export type {
  ScriptType,
  Token,
  TokenType,
  Entity,
  EntityType,
  LanguagePack,
  LanguageCapabilities,
  LanguageDetectionResult,
  LanguageSegment,
  NormalizationOptions,
  TokenizationOptions,
  LangPackServiceConfig,
  LangPackStats,
} from './types';

// =============================================================================
// Language Detection
// =============================================================================

export {
  detectLanguage,
  detectScript,
  detectLanguageSegments,
  isMixedLanguage,
  configureDetector,
} from './detector';

// =============================================================================
// Normalization
// =============================================================================

export {
  normalize,
  normalizeForSearch,
  normalizeForDisplay,
  unicodeNormalize,
  normalizeWhitespace,
  removeDiacritics,
  normalizePunctuation,
  removePunctuation,
  removeZeroWidthChars,
  normalizeChineseText,
  normalizeIndicText,
  normalizeArabicText,
  normalizeCyrillicText,
} from './normalizer';

// =============================================================================
// Tokenization
// =============================================================================

export {
  type Tokenizer,
  BaseTokenizer,
  WhitespaceTokenizer,
  createTokenizer,
} from './tokenizer/base';

// =============================================================================
// Registry
// =============================================================================

export {
  langPackRegistry,
  getLanguagePack,
  getLanguagePackOrDefault,
  isLanguageSupported,
  getSupportedLanguages,
  registerLanguagePack,
} from './registry';

// =============================================================================
// Convenience Functions
// =============================================================================

import { detectLanguage } from './detector';
import { normalizeForSearch } from './normalizer';
import { getLanguagePackOrDefault } from './registry';

/**
 * Process text with automatic language detection
 *
 * @param text - Text to process
 * @returns Processed result with detected language and tokens
 */
export async function processText(text: string): Promise<{
  detectedLanguage: string;
  confidence: number;
  normalized: string;
  tokens: string[];
}> {
  // Detect language
  const detection = await detectLanguage(text);

  // Get language pack
  const langPack = getLanguagePackOrDefault(detection.language);

  // Normalize and tokenize
  const normalized = langPack.normalize(text);
  const tokens = langPack.getSearchTokens(normalized);

  return {
    detectedLanguage: detection.language,
    confidence: detection.confidence,
    normalized,
    tokens,
  };
}

/**
 * Get search tokens for text with automatic language detection
 *
 * @param text - Text to tokenize
 * @param languageHint - Optional language hint to skip detection
 * @returns Search-optimized tokens
 */
export async function getSearchTokensAuto(
  text: string,
  languageHint?: string
): Promise<string[]> {
  let langCode: string;

  if (languageHint) {
    langCode = languageHint;
  } else {
    const detection = await detectLanguage(text);
    langCode = detection.language;
  }

  const langPack = getLanguagePackOrDefault(langCode);
  return langPack.getSearchTokens(text);
}

/**
 * Normalize text with automatic language detection
 *
 * @param text - Text to normalize
 * @param languageHint - Optional language hint
 * @returns Normalized text
 */
export async function normalizeAuto(
  text: string,
  languageHint?: string
): Promise<string> {
  let langCode: string;

  if (languageHint) {
    langCode = languageHint;
  } else {
    const detection = await detectLanguage(text);
    langCode = detection.language;
  }

  const langPack = getLanguagePackOrDefault(langCode);
  return langPack.normalize(text);
}
