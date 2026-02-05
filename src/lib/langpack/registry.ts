/**
 * Language Pack Registry
 *
 * Central registry for managing language packs and their capabilities.
 *
 * @module lib/langpack/registry
 */

import type {
  LanguagePack,
  LanguageCapabilities,
  ScriptType,
  Token,
  Entity,
} from './types';
import { normalize, normalizeForSearch } from './normalizer';
import { createTokenizer, type Tokenizer } from './tokenizer/base';

// =============================================================================
// Default Language Pack Implementation
// =============================================================================

/**
 * Create a basic language pack with minimal features
 */
function createBasicLanguagePack(
  code: string,
  name: string,
  nativeName: string,
  script: ScriptType,
  direction: 'ltr' | 'rtl' = 'ltr'
): LanguagePack {
  const tokenizer: Tokenizer = createTokenizer(code);

  return {
    code,
    name,
    nativeName,
    script,
    direction,

    normalize(text: string): string {
      return normalize(text, { form: 'NFKC', normalizeWhitespace: true }, script);
    },

    tokenize(text: string): Token[] {
      return tokenizer.tokenize(text);
    },

    getSearchTokens(text: string): string[] {
      const normalized = normalizeForSearch(text, script);
      return tokenizer.getSearchTokens(normalized);
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
}

// =============================================================================
// Language Pack Registry
// =============================================================================

/**
 * Registry of all available language packs
 */
class LanguagePackRegistry {
  private packs: Map<string, LanguagePack> = new Map();
  private defaultPack: LanguagePack;

  constructor() {
    // Initialize with basic language packs
    this.registerBasicPacks();
    this.defaultPack = this.packs.get('en')!;
  }

  /**
   * Register built-in basic language packs
   */
  private registerBasicPacks(): void {
    // English
    this.register(createBasicLanguagePack('en', 'English', 'English', 'latin'));

    // European languages
    this.register(createBasicLanguagePack('de', 'German', 'Deutsch', 'latin'));
    this.register(createBasicLanguagePack('fr', 'French', 'Français', 'latin'));
    this.register(createBasicLanguagePack('es', 'Spanish', 'Español', 'latin'));
    this.register(createBasicLanguagePack('it', 'Italian', 'Italiano', 'latin'));
    this.register(createBasicLanguagePack('pt', 'Portuguese', 'Português', 'latin'));
    this.register(createBasicLanguagePack('nl', 'Dutch', 'Nederlands', 'latin'));
    this.register(createBasicLanguagePack('pl', 'Polish', 'Polski', 'latin'));

    // CJK languages
    this.register(
      createBasicLanguagePack('zh', 'Chinese', '中文', 'han_simplified')
    );
    this.register(
      createBasicLanguagePack('zh-Hans', 'Chinese (Simplified)', '简体中文', 'han_simplified')
    );
    this.register(
      createBasicLanguagePack('zh-Hant', 'Chinese (Traditional)', '繁體中文', 'han_traditional')
    );
    this.register(createBasicLanguagePack('ja', 'Japanese', '日本語', 'hiragana'));
    this.register(createBasicLanguagePack('ko', 'Korean', '한국어', 'hangul'));

    // Indic languages
    this.register(createBasicLanguagePack('hi', 'Hindi', 'हिन्दी', 'devanagari'));
    this.register(createBasicLanguagePack('bn', 'Bengali', 'বাংলা', 'bengali'));
    this.register(createBasicLanguagePack('ta', 'Tamil', 'தமிழ்', 'tamil'));
    this.register(createBasicLanguagePack('te', 'Telugu', 'తెలుగు', 'telugu'));
    this.register(createBasicLanguagePack('mr', 'Marathi', 'मराठी', 'devanagari'));
    this.register(createBasicLanguagePack('gu', 'Gujarati', 'ગુજરાતી', 'gujarati'));
    this.register(createBasicLanguagePack('kn', 'Kannada', 'ಕನ್ನಡ', 'kannada'));
    this.register(createBasicLanguagePack('ml', 'Malayalam', 'മലയാളം', 'malayalam'));
    this.register(createBasicLanguagePack('pa', 'Punjabi', 'ਪੰਜਾਬੀ', 'punjabi'));

    // Cyrillic languages
    this.register(createBasicLanguagePack('ru', 'Russian', 'Русский', 'cyrillic'));
    this.register(createBasicLanguagePack('uk', 'Ukrainian', 'Українська', 'cyrillic'));
    this.register(createBasicLanguagePack('bg', 'Bulgarian', 'Български', 'cyrillic'));

    // RTL languages
    this.register(createBasicLanguagePack('ar', 'Arabic', 'العربية', 'arabic', 'rtl'));
    this.register(createBasicLanguagePack('he', 'Hebrew', 'עברית', 'hebrew', 'rtl'));
    this.register(createBasicLanguagePack('fa', 'Persian', 'فارسی', 'arabic', 'rtl'));

    // Other languages
    this.register(createBasicLanguagePack('th', 'Thai', 'ไทย', 'thai'));
    this.register(createBasicLanguagePack('vi', 'Vietnamese', 'Tiếng Việt', 'latin'));
    this.register(createBasicLanguagePack('id', 'Indonesian', 'Bahasa Indonesia', 'latin'));
    this.register(createBasicLanguagePack('tr', 'Turkish', 'Türkçe', 'latin'));
  }

  /**
   * Register a language pack
   */
  register(pack: LanguagePack): void {
    this.packs.set(pack.code, pack);
  }

  /**
   * Get a language pack by code
   */
  get(code: string): LanguagePack | undefined {
    // Try exact match first
    if (this.packs.has(code)) {
      return this.packs.get(code);
    }

    // Try base language code (e.g., 'en' from 'en-US')
    const baseCode = code.split('-')[0];
    if (this.packs.has(baseCode)) {
      return this.packs.get(baseCode);
    }

    return undefined;
  }

  /**
   * Get a language pack or return the default
   */
  getOrDefault(code: string): LanguagePack {
    return this.get(code) || this.defaultPack;
  }

  /**
   * Check if a language is supported
   */
  isSupported(code: string): boolean {
    return this.get(code) !== undefined;
  }

  /**
   * Get all supported language codes
   */
  getSupportedLanguages(): string[] {
    return Array.from(this.packs.keys());
  }

  /**
   * Get languages by script type
   */
  getLanguagesByScript(script: ScriptType): LanguagePack[] {
    return Array.from(this.packs.values()).filter(
      (pack) => pack.script === script
    );
  }

  /**
   * Get languages with a specific capability
   */
  getLanguagesWithCapability(
    capability: keyof LanguageCapabilities
  ): LanguagePack[] {
    return Array.from(this.packs.values()).filter(
      (pack) => pack.capabilities[capability]
    );
  }

  /**
   * Set the default language pack
   */
  setDefault(code: string): void {
    const pack = this.get(code);
    if (pack) {
      this.defaultPack = pack;
    }
  }

  /**
   * Get the default language pack
   */
  getDefault(): LanguagePack {
    return this.defaultPack;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * Global language pack registry instance
 */
export const langPackRegistry = new LanguagePackRegistry();

/**
 * Get a language pack by code
 */
export function getLanguagePack(code: string): LanguagePack | undefined {
  return langPackRegistry.get(code);
}

/**
 * Get a language pack or the default
 */
export function getLanguagePackOrDefault(code: string): LanguagePack {
  return langPackRegistry.getOrDefault(code);
}

/**
 * Check if a language is supported
 */
export function isLanguageSupported(code: string): boolean {
  return langPackRegistry.isSupported(code);
}

/**
 * Get all supported language codes
 */
export function getSupportedLanguages(): string[] {
  return langPackRegistry.getSupportedLanguages();
}

/**
 * Register a custom language pack
 */
export function registerLanguagePack(pack: LanguagePack): void {
  langPackRegistry.register(pack);
}
