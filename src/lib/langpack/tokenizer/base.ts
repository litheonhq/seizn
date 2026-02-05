/**
 * Base Tokenizer Interface
 *
 * Defines the contract for language-specific tokenizers.
 *
 * @module lib/langpack/tokenizer/base
 */

import type { Token, TokenType, TokenizationOptions } from '../types';

// =============================================================================
// Tokenizer Interface
// =============================================================================

/**
 * Base interface for all tokenizers
 */
export interface Tokenizer {
  /** Language code this tokenizer handles */
  languageCode: string;

  /**
   * Tokenize text into tokens
   */
  tokenize(text: string, options?: TokenizationOptions): Token[];

  /**
   * Get search-optimized tokens (normalized, stemmed if applicable)
   */
  getSearchTokens(text: string): string[];
}

// =============================================================================
// Base Tokenizer Implementation
// =============================================================================

/**
 * Abstract base tokenizer with common functionality
 */
export abstract class BaseTokenizer implements Tokenizer {
  abstract languageCode: string;

  /**
   * Tokenize text - must be implemented by subclasses
   */
  abstract tokenize(text: string, options?: TokenizationOptions): Token[];

  /**
   * Get search-optimized tokens
   */
  getSearchTokens(text: string): string[] {
    const tokens = this.tokenize(text, {
      includePunctuation: false,
      includeWhitespace: false,
      normalize: true,
    });

    return tokens
      .filter((t) => t.type === 'word')
      .map((t) => t.normalized.toLowerCase());
  }

  /**
   * Create a token object
   */
  protected createToken(
    text: string,
    start: number,
    end: number,
    type: TokenType,
    options?: { lemma?: string; pos?: string }
  ): Token {
    return {
      text,
      normalized: text.toLowerCase(),
      start,
      end,
      type,
      ...(options?.lemma && { lemma: options.lemma }),
      ...(options?.pos && { pos: options.pos }),
    };
  }

  /**
   * Classify a character into a token type
   */
  protected classifyChar(char: string): TokenType {
    if (/\s/.test(char)) return 'whitespace';
    if (/\p{P}/u.test(char)) return 'punctuation';
    if (/\d/.test(char)) return 'number';
    if (/\p{S}/u.test(char)) return 'symbol';
    if (/\p{Emoji}/u.test(char)) return 'emoji';
    if (/\p{L}/u.test(char)) return 'word';
    return 'unknown';
  }
}

// =============================================================================
// Simple Whitespace Tokenizer
// =============================================================================

/**
 * Simple whitespace-based tokenizer for Latin scripts
 */
export class WhitespaceTokenizer extends BaseTokenizer {
  languageCode = 'und'; // Undetermined

  tokenize(text: string, options?: TokenizationOptions): Token[] {
    const tokens: Token[] = [];
    const {
      includePunctuation = false,
      includeWhitespace = false,
      normalize = true,
    } = options || {};

    let currentToken = '';
    let currentStart = 0;
    let currentType: TokenType = 'unknown';

    for (let i = 0; i <= text.length; i++) {
      const char = i < text.length ? text[i] : '';
      const charType = char ? this.classifyChar(char) : 'unknown';

      // Check if we need to emit the current token
      const shouldEmit =
        !char || // End of text
        charType !== currentType || // Type changed
        charType === 'whitespace' || // Whitespace always breaks
        charType === 'punctuation'; // Punctuation always breaks

      if (shouldEmit && currentToken) {
        // Filter based on options
        const shouldInclude =
          (currentType === 'whitespace' && includeWhitespace) ||
          (currentType === 'punctuation' && includePunctuation) ||
          (currentType !== 'whitespace' && currentType !== 'punctuation');

        if (shouldInclude) {
          tokens.push(
            this.createToken(
              currentToken,
              currentStart,
              currentStart + currentToken.length,
              currentType
            )
          );
        }

        currentToken = '';
      }

      // Start new token
      if (char) {
        if (!currentToken) {
          currentStart = i;
          currentType = charType;
        }
        currentToken += char;
      }
    }

    return tokens;
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a tokenizer for a given language
 */
export function createTokenizer(languageCode: string): Tokenizer {
  // For now, return a simple whitespace tokenizer
  // Language-specific tokenizers will be added in subsequent files
  const tokenizer = new WhitespaceTokenizer();
  tokenizer.languageCode = languageCode;
  return tokenizer;
}
