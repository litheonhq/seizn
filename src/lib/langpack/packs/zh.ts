/**
 * Chinese Language Pack
 *
 * Provides Chinese-specific text processing with bigram tokenization,
 * full-width/half-width conversion, and simplified/traditional mapping.
 *
 * @module lib/langpack/packs/zh
 */

import type { LanguagePack, Token, ScriptType } from '../types';

// =============================================================================
// Simplified <-> Traditional Character Mapping (common characters)
// =============================================================================

const SIMPLIFIED_TO_TRADITIONAL: Record<string, string> = {
  '\u4E07': '\u842C', '\u4E0E': '\u8207', '\u4E13': '\u5C08', '\u4E1A': '\u696D',
  '\u4E1C': '\u6771', '\u4E24': '\u5169', '\u4E2A': '\u500B', '\u4E3A': '\u70BA',
  '\u4E48': '\u9EBC', '\u4E49': '\u7FA9', '\u4E66': '\u66F8', '\u4E70': '\u8CB7',
  '\u4E86': '\u4E86', '\u4EA7': '\u7522', '\u4EBA': '\u4EBA', '\u4ECE': '\u5F9E',
  '\u4F1A': '\u6703', '\u4F20': '\u50B3', '\u4F53': '\u9AD4', '\u4F60': '\u4F60',
  '\u5173': '\u95DC', '\u519B': '\u8ECD', '\u51B3': '\u6C7A', '\u51FA': '\u51FA',
  '\u521B': '\u5275', '\u52A8': '\u52D5', '\u529E': '\u8FA6',
  '\u52B1': '\u52F5', '\u533B': '\u91AB', '\u534E': '\u83EF', '\u53D1': '\u767C',
  '\u53EA': '\u53EA', '\u540E': '\u5F8C', '\u542C': '\u807D', '\u544A': '\u544A',
  '\u56E2': '\u5718', '\u56FD': '\u570B', '\u56FE': '\u5716', '\u5728': '\u5728',
  '\u573A': '\u5834', '\u5904': '\u8655', '\u591A': '\u591A', '\u5927': '\u5927',
  '\u5B66': '\u5B78', '\u5B9E': '\u5BE6', '\u5BF9': '\u5C0D', '\u5C06': '\u5C07',
  '\u5C14': '\u723E', '\u5C9B': '\u5CF6', '\u5E02': '\u5E02', '\u5E26': '\u5E36',
  '\u5E72': '\u5E79', '\u5E7F': '\u5EE3', '\u5F00': '\u958B', '\u5F53': '\u7576',
  '\u5F97': '\u5F97', '\u603B': '\u7E3D', '\u60C5': '\u60C5', '\u6210': '\u6210',
  '\u6218': '\u6230', '\u623F': '\u623F', '\u624D': '\u624D', '\u6279': '\u6279',
  '\u62A5': '\u5831', '\u636E': '\u64DA', '\u65E0': '\u7121', '\u65F6': '\u6642',
  '\u663E': '\u986F', '\u66F4': '\u66F4', '\u6761': '\u689D', '\u6765': '\u4F86',
  '\u6768': '\u694A', '\u6837': '\u6A23', '\u68C0': '\u6AA2', '\u6B21': '\u6B21',
  '\u6B63': '\u6B63', '\u6C14': '\u6C23', '\u6C49': '\u6F22', '\u6CA1': '\u6C92',
  '\u6CD5': '\u6CD5', '\u6D3B': '\u6D3B', '\u70B9': '\u9EDE', '\u7231': '\u611B',
  '\u7269': '\u7269', '\u73B0': '\u73FE', '\u7406': '\u7406', '\u751F': '\u751F',
  '\u7535': '\u96FB', '\u767E': '\u767E', '\u7684': '\u7684', '\u76EE': '\u76EE',
  '\u7B2C': '\u7B2C', '\u7ECF': '\u7D93', '\u7ED3': '\u7D50', '\u7ED9': '\u7D66',
  '\u7EDF': '\u7D71', '\u8005': '\u8005', '\u80FD': '\u80FD', '\u81EA': '\u81EA',
  '\u89C1': '\u898B', '\u89C4': '\u898F', '\u89C9': '\u89BA', '\u8BA4': '\u8A8D',
  '\u8BB0': '\u8A18', '\u8BB8': '\u8A31', '\u8BC6': '\u8B58', '\u8BDD': '\u8A71',
  '\u8BF4': '\u8AAA', '\u8C03': '\u8ABF', '\u8D28': '\u8CEA', '\u8D70': '\u8D70',
  '\u8FBE': '\u9054', '\u8FD0': '\u904B', '\u8FDB': '\u9032', '\u8FDE': '\u9023',
  '\u8FD9': '\u9019', '\u901A': '\u901A', '\u9053': '\u9053', '\u90A3': '\u90A3',
  '\u91CC': '\u88E1', '\u94B1': '\u9322', '\u957F': '\u9577', '\u95E8': '\u9580',
  '\u95EE': '\u554F', '\u95F4': '\u9593', '\u961F': '\u968A', '\u9645': '\u969B',
  '\u9662': '\u9662', '\u96BE': '\u96E3', '\u9879': '\u9805', '\u9A6C': '\u99AC',
  '\u9AD8': '\u9AD8', '\u9F99': '\u9F8D',
};

// Build reverse mapping
const TRADITIONAL_TO_SIMPLIFIED: Record<string, string> = {};
for (const [simp, trad] of Object.entries(SIMPLIFIED_TO_TRADITIONAL)) {
  if (simp !== trad) {
    TRADITIONAL_TO_SIMPLIFIED[trad] = simp;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/** Check if a character is CJK */
function isCJK(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4DBF) ||   // CJK Extension A
    (code >= 0xF900 && code <= 0xFAFF) ||   // CJK Compat Ideographs
    (code >= 0x20000 && code <= 0x2A6DF)    // CJK Extension B
  );
}

/** Full-width ASCII to half-width */
function fullWidthToHalfWidth(text: string): string {
  return text.replace(/[\uFF01-\uFF5E]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  ).replace(/\u3000/g, ' ');
}

/** Generate character bigrams from text */
function generateBigrams(chars: string[]): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < chars.length - 1; i++) {
    bigrams.push(chars[i] + chars[i + 1]);
  }
  return bigrams;
}

// =============================================================================
// Chinese Language Pack
// =============================================================================

export const zhLanguagePack: LanguagePack = {
  code: 'zh',
  name: 'Chinese',
  nativeName: '\u4E2D\u6587',
  script: 'han_simplified',
  alternateScripts: ['han_traditional'],
  direction: 'ltr',

  normalize(text: string): string {
    let result = text.normalize('NFC');
    result = fullWidthToHalfWidth(result);
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

      if (isCJK(char)) {
        // Each CJK character is its own token
        tokens.push({
          text: char,
          normalized: char,
          start: i,
          end: i + 1,
          type: 'word',
        });
        i++;
      } else if (/[\p{L}\p{N}]/u.test(char)) {
        // Collect non-CJK word characters
        let word = '';
        const start = i;
        while (i < normalized.length && /[\p{L}\p{N}]/u.test(normalized[i]) && !isCJK(normalized[i])) {
          word += normalized[i];
          i++;
        }
        tokens.push({
          text: word,
          normalized: word.toLowerCase(),
          start,
          end: i,
          type: 'word',
        });
      } else {
        // Punctuation and other characters
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

    // Extract CJK characters and non-CJK words separately
    const cjkChars: string[] = [];
    const parts = normalized.split(/\s+/);

    for (const part of parts) {
      let nonCjk = '';
      for (const char of part) {
        if (isCJK(char)) {
          if (nonCjk) {
            tokens.add(nonCjk);
            nonCjk = '';
          }
          cjkChars.push(char);
          tokens.add(char); // Individual characters
        } else if (/[\p{L}\p{N}]/u.test(char)) {
          nonCjk += char;
        } else {
          if (nonCjk) {
            tokens.add(nonCjk);
            nonCjk = '';
          }
        }
      }
      if (nonCjk) {
        tokens.add(nonCjk);
      }
    }

    // Generate bigrams from CJK sequences
    const bigrams = generateBigrams(cjkChars);
    for (const bigram of bigrams) {
      tokens.add(bigram);
    }

    return Array.from(tokens).filter((t) => t.length > 0);
  },

  convertScript(text: string, target: ScriptType): string {
    const mapping =
      target === 'han_traditional'
        ? SIMPLIFIED_TO_TRADITIONAL
        : TRADITIONAL_TO_SIMPLIFIED;

    let result = '';
    for (const char of text) {
      result += mapping[char] ?? char;
    }
    return result;
  },

  capabilities: {
    tokenization: true,
    lemmatization: false,
    ner: false,
    spellCheck: false,
    synonyms: false,
    phonetic: false,
    scriptConversion: true,
    translation: false,
    wordSegmentation: true,
  },
};
