/**
 * Language Pack Types
 *
 * Core type definitions for the multilingual language processing system.
 *
 * @module lib/langpack/types
 */

// =============================================================================
// Script Types
// =============================================================================

/**
 * Writing system scripts supported by the language pack system
 */
export type ScriptType =
  | 'latin'
  | 'devanagari'
  | 'han_simplified'
  | 'han_traditional'
  | 'cyrillic'
  | 'arabic'
  | 'hebrew'
  | 'hangul'
  | 'hiragana'
  | 'katakana'
  | 'thai'
  | 'bengali'
  | 'tamil'
  | 'telugu'
  | 'gujarati'
  | 'kannada'
  | 'malayalam'
  | 'punjabi';

// =============================================================================
// Token Types
// =============================================================================

/**
 * A processed token from text
 */
export interface Token {
  /** Original text of the token */
  text: string;
  /** Normalized/lowercase form */
  normalized: string;
  /** Lemmatized form (if available) */
  lemma?: string;
  /** Part-of-speech tag */
  pos?: string;
  /** Character offset start in original text */
  start: number;
  /** Character offset end in original text */
  end: number;
  /** Token type classification */
  type: TokenType;
}

export type TokenType =
  | 'word'
  | 'number'
  | 'punctuation'
  | 'whitespace'
  | 'symbol'
  | 'emoji'
  | 'unknown';

// =============================================================================
// Entity Types
// =============================================================================

/**
 * Named entity extracted from text
 */
export interface Entity {
  /** Entity text */
  text: string;
  /** Entity type/category */
  type: EntityType;
  /** Character offset start */
  start: number;
  /** Character offset end */
  end: number;
  /** Confidence score (0-1) */
  confidence: number;
  /** Normalized/canonical form */
  normalized?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export type EntityType =
  | 'PERSON'
  | 'ORGANIZATION'
  | 'LOCATION'
  | 'DATE'
  | 'TIME'
  | 'MONEY'
  | 'PERCENT'
  | 'EMAIL'
  | 'PHONE'
  | 'URL'
  | 'PRODUCT'
  | 'EVENT'
  | 'LANGUAGE'
  | 'OTHER';

// =============================================================================
// Language Pack Interface
// =============================================================================

/**
 * Core interface for language-specific processing
 */
export interface LanguagePack {
  /** BCP-47 language code (e.g., 'en', 'hi', 'zh-Hans', 'uk') */
  code: string;
  /** Display name of the language */
  name: string;
  /** Native name of the language */
  nativeName: string;
  /** Primary script used */
  script: ScriptType;
  /** Alternative scripts supported */
  alternateScripts?: ScriptType[];
  /** Text direction */
  direction: 'ltr' | 'rtl';

  // -------------------------------------------------------------------------
  // Text Processing Pipeline
  // -------------------------------------------------------------------------

  /**
   * Normalize text (Unicode normalization, script-specific cleanup)
   */
  normalize(text: string): string;

  /**
   * Tokenize text into individual tokens
   */
  tokenize(text: string): Token[];

  /**
   * Lemmatize tokens (reduce to base form)
   */
  lemmatize?(tokens: Token[]): Token[];

  /**
   * Extract named entities from text
   */
  extractEntities?(text: string): Promise<Entity[]>;

  // -------------------------------------------------------------------------
  // Search Support
  // -------------------------------------------------------------------------

  /**
   * Get tokens optimized for search indexing
   */
  getSearchTokens(text: string): string[];

  /**
   * Get phonetic/romanized tokens for fuzzy matching
   * (e.g., Pinyin for Chinese, romanization for Hindi)
   */
  getPhoneticTokens?(text: string): string[];

  /**
   * Expand query with synonyms
   */
  expandSynonyms?(term: string): string[];

  /**
   * Check and correct spelling
   */
  correctSpelling?(text: string): string;

  // -------------------------------------------------------------------------
  // Translation/Conversion
  // -------------------------------------------------------------------------

  /**
   * Convert text to canonical English representation
   * (for cross-lingual search and storage)
   */
  toCanonicalEnglish?(text: string): Promise<string>;

  /**
   * Convert between scripts (e.g., simplified ↔ traditional Chinese)
   */
  convertScript?(text: string, target: ScriptType): string;

  /**
   * Transliterate to Latin script
   */
  transliterate?(text: string): string;

  // -------------------------------------------------------------------------
  // Capabilities
  // -------------------------------------------------------------------------

  /** Features supported by this language pack */
  capabilities: LanguageCapabilities;
}

/**
 * Capabilities available for a language pack
 */
export interface LanguageCapabilities {
  /** Has tokenization support */
  tokenization: boolean;
  /** Has lemmatization support */
  lemmatization: boolean;
  /** Has NER support */
  ner: boolean;
  /** Has spell checking */
  spellCheck: boolean;
  /** Has synonym expansion */
  synonyms: boolean;
  /** Has phonetic/romanization support */
  phonetic: boolean;
  /** Has script conversion */
  scriptConversion: boolean;
  /** Has translation to English */
  translation: boolean;
  /** Supports word segmentation (for languages without spaces) */
  wordSegmentation: boolean;
}

// =============================================================================
// Language Detection Types
// =============================================================================

/**
 * Result of language detection
 */
export interface LanguageDetectionResult {
  /** Detected BCP-47 language code */
  language: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Detected script */
  script: ScriptType;
  /** Alternative language candidates */
  alternatives?: Array<{
    language: string;
    confidence: number;
  }>;
  /** Whether the text appears to be mixed-language */
  isMixedLanguage?: boolean;
  /** Detected language segments (for code-switching) */
  segments?: LanguageSegment[];
}

/**
 * A segment of text with detected language
 */
export interface LanguageSegment {
  /** Text content */
  text: string;
  /** Start offset */
  start: number;
  /** End offset */
  end: number;
  /** Detected language */
  language: string;
  /** Confidence score */
  confidence: number;
}

// =============================================================================
// Normalization Options
// =============================================================================

/**
 * Options for text normalization
 */
export interface NormalizationOptions {
  /** Unicode normalization form (default: NFKC) */
  form?: 'NFC' | 'NFD' | 'NFKC' | 'NFKD';
  /** Convert to lowercase */
  lowercase?: boolean;
  /** Remove diacritics/accents */
  removeDiacritics?: boolean;
  /** Normalize whitespace */
  normalizeWhitespace?: boolean;
  /** Remove punctuation */
  removePunctuation?: boolean;
  /** Remove zero-width characters */
  removeZeroWidth?: boolean;
  /** Language-specific normalization */
  languageSpecific?: boolean;
}

// =============================================================================
// Tokenization Options
// =============================================================================

/**
 * Options for tokenization
 */
export interface TokenizationOptions {
  /** Include punctuation tokens */
  includePunctuation?: boolean;
  /** Include whitespace tokens */
  includeWhitespace?: boolean;
  /** Normalize tokens */
  normalize?: boolean;
  /** Preserve case */
  preserveCase?: boolean;
  /** Mode for CJK languages */
  segmentationMode?: 'default' | 'search' | 'all';
}

// =============================================================================
// Service Types
// =============================================================================

/**
 * Configuration for language pack service
 */
export interface LangPackServiceConfig {
  /** Default language for fallback */
  defaultLanguage: string;
  /** Minimum confidence for language detection */
  minDetectionConfidence: number;
  /** Enable caching */
  enableCache: boolean;
  /** Cache TTL in seconds */
  cacheTtlSeconds: number;
  /** External service URLs */
  services?: {
    /** FastText language detection service URL */
    fastTextUrl?: string;
    /** Translation service URL */
    translationUrl?: string;
    /** NER service URL */
    nerUrl?: string;
  };
}

/**
 * Stats for language pack operations
 */
export interface LangPackStats {
  /** Number of texts processed */
  textsProcessed: number;
  /** Language distribution */
  languageDistribution: Record<string, number>;
  /** Average processing time in ms */
  avgProcessingTimeMs: number;
  /** Cache hit rate */
  cacheHitRate: number;
}
