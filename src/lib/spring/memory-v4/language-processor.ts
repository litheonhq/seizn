/**
 * Language Processor Service
 *
 * Bridges the LangPack module with Spring Memory v4 services.
 * Handles language detection, normalization, tokenization, and
 * canonical English translation for cross-lingual search.
 *
 * @module spring/memory-v4/language-processor
 */

import Anthropic from '@anthropic-ai/sdk';
import { detectLanguage, detectScript } from '@/lib/langpack/detector';
import { getLanguagePackOrDefault } from '@/lib/langpack/registry';
import { computeEmbedding } from '@/lib/embeddings';
import type { ScriptType } from '@/lib/langpack/types';
import { containsChinese, getChineseVariants } from '@/lib/langpack/transforms/chinese';
import { containsDevanagari, devanagariToLatin } from '@/lib/langpack/transforms/indic';
import { containsCyrillic, cyrillicToLatin } from '@/lib/langpack/transforms/cyrillic';

// =============================================================================
// Types
// =============================================================================

export interface LanguageProcessingResult {
  /** BCP-47 language code */
  language: string;
  /** Language detection confidence (0-1) */
  languageConfidence: number;
  /** Detected script type */
  scriptType: string;
  /** Normalized text for search */
  contentNormalized: string;
  /** Lexical tokens for keyword search */
  lexTokens: string[];
  /** Phonetic tokens for fuzzy matching (if available) */
  phoneticTokens: string[];
}

export interface CanonicalResult {
  /** English canonical translation */
  contentCanonicalEn: string;
  /** Embedding of the canonical English content */
  embeddingCanonical: number[];
}

/**
 * Alternative script representations for cross-script search.
 * Keys correspond to PGroonga-indexed columns in content_alt JSONB.
 */
export interface ContentAltResult {
  /** Simplified Chinese variant */
  zh_hans?: string;
  /** Traditional Chinese variant */
  zh_hant?: string;
  /** Romanized/transliterated form (Latin script) */
  romanized?: string;
}

// =============================================================================
// Language Processor Service
// =============================================================================

export class LanguageProcessor {
  private anthropic: Anthropic | null = null;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    // Never instantiate server-side LLM clients in browser-like runtimes (ex: jsdom tests).
    // This avoids SDK safeguards throwing and prevents accidental client-bundle usage.
    const g = globalThis as unknown as { window?: unknown; document?: unknown };
    const isBrowserLike =
      typeof g.window !== 'undefined' || typeof g.document !== 'undefined';
    if (apiKey && !isBrowserLike) {
      this.anthropic = new Anthropic({ apiKey });
    }
  }

  /**
   * Process text for storage: detect language, normalize, and tokenize
   */
  async processForStorage(
    content: string,
    languageHint?: string
  ): Promise<LanguageProcessingResult> {
    // 1. Detect language (or use hint)
    let language: string;
    let languageConfidence: number;
    let scriptType: ScriptType;

    if (languageHint) {
      language = languageHint;
      languageConfidence = 1.0;
      scriptType = detectScript(content).script;
    } else {
      const detection = await detectLanguage(content);
      language = detection.language;
      languageConfidence = detection.confidence;
      scriptType = detection.script;
    }

    // 2. Get language pack for normalization and tokenization
    const langPack = getLanguagePackOrDefault(language);

    // 3. Normalize text
    const contentNormalized = langPack.normalize(content);

    // 4. Generate lexical tokens
    const lexTokens = langPack.getSearchTokens(contentNormalized);

    // 5. Generate phonetic tokens (if language pack supports it)
    let phoneticTokens: string[] = [];
    if (langPack.getPhoneticTokens) {
      phoneticTokens = langPack.getPhoneticTokens(content);
    }

    return {
      language,
      languageConfidence,
      scriptType,
      contentNormalized,
      lexTokens,
      phoneticTokens,
    };
  }

  /**
   * Generate canonical English representation for non-English content.
   * Used for cross-lingual search.
   *
   * Returns null for English content (no translation needed).
   */
  async generateCanonical(
    content: string,
    sourceLang: string
  ): Promise<CanonicalResult | null> {
    // Skip for English content
    if (sourceLang === 'en' || sourceLang.startsWith('en-')) {
      return null;
    }

    if (!this.anthropic) {
      return null;
    }

    try {
      // Truncate long content for translation
      const maxChars = 4000;
      const truncatedContent =
        content.length > maxChars
          ? content.slice(0, maxChars) + '...'
          : content;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `Translate the following text to English. Preserve the meaning accurately. Return ONLY the English translation, nothing else.\n\nSource language: ${sourceLang}\nText:\n${truncatedContent}`,
          },
        ],
      });

      const textContent = response.content[0];
      if (textContent.type !== 'text') {
        return null;
      }

      const contentCanonicalEn = textContent.text.trim();

      // Generate embedding for the canonical English content
      const embeddingCanonical = await computeEmbedding(
        contentCanonicalEn,
        'document'
      );

      return {
        contentCanonicalEn,
        embeddingCanonical,
      };
    } catch (error) {
      console.error(
        '[LanguageProcessor] Canonical translation failed:',
        error
      );
      return null;
    }
  }

  /**
   * Generate alternative script representations for cross-script search.
   * Returns variants based on detected script (e.g., simplified/traditional
   * Chinese, romanized Devanagari/Cyrillic).
   */
  generateContentAlt(content: string, language: string): ContentAltResult {
    const alt: ContentAltResult = {};

    // Chinese: generate both simplified and traditional variants
    if (containsChinese(content)) {
      const variants = getChineseVariants(content);
      alt.zh_hans = variants.simplified;
      alt.zh_hant = variants.traditional;
      // Don't set romanized for Chinese (Pinyin would need a separate module)
    }

    // Devanagari (Hindi, Marathi, Sanskrit): romanize to Latin
    if (containsDevanagari(content)) {
      alt.romanized = devanagariToLatin(content);
    }

    // Cyrillic (Ukrainian, Russian): romanize to Latin
    if (containsCyrillic(content)) {
      alt.romanized = cyrillicToLatin(content, language);
    }

    // Return empty object if no variants generated (caller should check)
    return alt;
  }

  /**
   * Process text for search query: detect language, normalize, and prepare
   * for cross-lingual search.
   */
  async processQuery(
    query: string,
    languageHint?: string
  ): Promise<{
    language: string;
    normalizedQuery: string;
    searchTokens: string[];
    isEnglish: boolean;
  }> {
    let language: string;

    if (languageHint) {
      language = languageHint;
    } else {
      const detection = await detectLanguage(query);
      language = detection.language;
    }

    const langPack = getLanguagePackOrDefault(language);
    const normalizedQuery = langPack.normalize(query);
    const searchTokens = langPack.getSearchTokens(normalizedQuery);
    const isEnglish = language === 'en' || language.startsWith('en-');

    return {
      language,
      normalizedQuery,
      searchTokens,
      isEnglish,
    };
  }

  /**
   * Extract keywords using language-aware tokenization.
   * Replaces the English-biased extractBasicKeywords in NoteBuilder.
   */
  extractKeywordsMultilingual(
    content: string,
    language?: string
  ): string[] {
    const langCode = language || 'en';
    const langPack = getLanguagePackOrDefault(langCode);

    // Get search tokens (already normalized and filtered)
    const tokens = langPack.getSearchTokens(content);

    // Count frequencies
    const freq = new Map<string, number>();
    for (const token of tokens) {
      if (token.length < 2) continue; // Skip single-char tokens
      freq.set(token, (freq.get(token) || 0) + 1);
    }

    // Common stop words for major languages
    const universalStopWords = new Set([
      // English
      'the', 'is', 'are', 'was', 'were', 'been', 'being',
      'have', 'has', 'had', 'having', 'this', 'that', 'these',
      'those', 'with', 'from', 'they', 'their', 'which', 'about',
      'would', 'could', 'should', 'there', 'where', 'what', 'when',
      'into', 'more', 'some', 'such', 'than', 'then', 'them',
      'also', 'just', 'only', 'very',
    ]);

    // Sort by frequency and return top keywords
    return Array.from(freq.entries())
      .filter(([word]) => !universalStopWords.has(word))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }
}

// =============================================================================
// Singleton
// =============================================================================

let instance: LanguageProcessor | null = null;

export function getLanguageProcessor(): LanguageProcessor {
  if (!instance) {
    instance = new LanguageProcessor();
  }
  return instance;
}
