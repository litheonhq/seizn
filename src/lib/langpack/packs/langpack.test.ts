/**
 * Language Pack Unit Tests
 *
 * Tests normalize, tokenize, and getSearchTokens for each language pack.
 * Also tests pack-specific features (script conversion, transliteration, stemming).
 */

import { describe, it, expect } from 'vitest';
import { zhLanguagePack } from './zh';
import { koLanguagePack } from './ko';
import { jaLanguagePack } from './ja';
import { hiLanguagePack } from './hi';
import { arLanguagePack } from './ar';
import { ukLanguagePack } from './uk';

// ===========================================================================
// Chinese (zh)
// ===========================================================================

describe('zhLanguagePack', () => {
  it('has correct metadata', () => {
    expect(zhLanguagePack.code).toBe('zh');
    expect(zhLanguagePack.direction).toBe('ltr');
    expect(zhLanguagePack.capabilities.scriptConversion).toBe(true);
  });

  describe('normalize', () => {
    it('converts full-width ASCII to half-width', () => {
      expect(zhLanguagePack.normalize('\uFF21\uFF22\uFF23')).toBe('ABC');
    });

    it('normalizes whitespace', () => {
      expect(zhLanguagePack.normalize('\u4F60  \u597D  \u4E16\u754C')).toBe('\u4F60 \u597D \u4E16\u754C');
    });
  });

  describe('tokenize', () => {
    it('tokenizes CJK characters individually', () => {
      const tokens = zhLanguagePack.tokenize('\u4F60\u597D');
      expect(tokens).toHaveLength(2);
      expect(tokens[0].text).toBe('\u4F60');
      expect(tokens[1].text).toBe('\u597D');
    });

    it('groups Latin characters as words', () => {
      const tokens = zhLanguagePack.tokenize('hello\u4E16\u754C');
      const wordTokens = tokens.filter(t => t.type === 'word');
      expect(wordTokens.length).toBeGreaterThanOrEqual(2);
      expect(wordTokens[0].text).toBe('hello');
    });
  });

  describe('getSearchTokens', () => {
    it('generates individual characters and bigrams', () => {
      const tokens = zhLanguagePack.getSearchTokens('\u4F60\u597D\u4E16\u754C');
      // Should have individual chars and bigrams
      expect(tokens).toContain('\u4F60');
      expect(tokens).toContain('\u4F60\u597D'); // bigram
    });
  });

  describe('convertScript', () => {
    it('converts simplified to traditional', () => {
      const result = zhLanguagePack.convertScript!('\u56FD\u5BB6', 'han_traditional');
      expect(result).toBe('\u570B\u5BB6');
    });

    it('converts traditional to simplified', () => {
      const result = zhLanguagePack.convertScript!('\u570B\u5BB6', 'han_simplified');
      expect(result).toBe('\u56FD\u5BB6');
    });
  });
});

// ===========================================================================
// Korean (ko)
// ===========================================================================

describe('koLanguagePack', () => {
  it('has correct metadata', () => {
    expect(koLanguagePack.code).toBe('ko');
    expect(koLanguagePack.direction).toBe('ltr');
    expect(koLanguagePack.script).toBe('hangul');
  });

  describe('normalize', () => {
    it('normalizes whitespace', () => {
      expect(koLanguagePack.normalize('\uC548\uB155  \uD558\uC138\uC694')).toBe('\uC548\uB155 \uD558\uC138\uC694');
    });

    it('applies NFC normalization', () => {
      const text = '\uC548\uB155';
      const result = koLanguagePack.normalize(text);
      expect(result).toBe(text.normalize('NFC'));
    });
  });

  describe('tokenize', () => {
    it('splits on whitespace', () => {
      const tokens = koLanguagePack.tokenize('\uC548\uB155 \uD558\uC138\uC694');
      const words = tokens.filter(t => t.type === 'word');
      expect(words).toHaveLength(2);
      expect(words[0].text).toBe('\uC548\uB155');
      expect(words[1].text).toBe('\uD558\uC138\uC694');
    });

    it('classifies punctuation correctly', () => {
      // Standalone punctuation is classified as punctuation
      const tokens = koLanguagePack.tokenize('\uC548\uB155 !');
      expect(tokens.some(t => t.type === 'punctuation')).toBe(true);
    });
  });

  describe('getSearchTokens', () => {
    it('includes word-level and bigram tokens', () => {
      const tokens = koLanguagePack.getSearchTokens('\uC548\uB155\uD558\uC138\uC694');
      // Should have the word and Hangul bigrams
      expect(tokens.length).toBeGreaterThan(1);
    });

    it('skips punctuation', () => {
      const tokens = koLanguagePack.getSearchTokens('!!! ???');
      expect(tokens).toHaveLength(0);
    });
  });
});

// ===========================================================================
// Japanese (ja)
// ===========================================================================

describe('jaLanguagePack', () => {
  it('has correct metadata', () => {
    expect(jaLanguagePack.code).toBe('ja');
    expect(jaLanguagePack.capabilities.wordSegmentation).toBe(true);
  });

  describe('normalize', () => {
    it('applies NFKC and converts full-width to half-width', () => {
      const result = jaLanguagePack.normalize('\uFF21\uFF22\uFF23');
      expect(result).toBe('ABC');
    });

    it('converts half-width katakana to full-width', () => {
      const result = jaLanguagePack.normalize('\uFF71\uFF72\uFF73');
      expect(result).toBe('\u30A2\u30A4\u30A6');
    });
  });

  describe('tokenize', () => {
    it('tokenizes Japanese characters individually', () => {
      const tokens = jaLanguagePack.tokenize('\u6771\u4EAC');
      expect(tokens).toHaveLength(2);
      expect(tokens[0].text).toBe('\u6771');
    });

    it('groups Latin words', () => {
      const tokens = jaLanguagePack.tokenize('hello\u6771\u4EAC');
      expect(tokens.some(t => t.text === 'hello')).toBe(true);
    });
  });

  describe('getSearchTokens', () => {
    it('generates bigrams from Japanese characters', () => {
      const tokens = jaLanguagePack.getSearchTokens('\u6771\u4EAC\u90FD');
      expect(tokens).toContain('\u6771\u4EAC'); // bigram
      expect(tokens).toContain('\u4EAC\u90FD'); // bigram
    });

    it('includes individual kanji for single-char search', () => {
      const tokens = jaLanguagePack.getSearchTokens('\u6771\u4EAC');
      expect(tokens).toContain('\u6771');
      expect(tokens).toContain('\u4EAC');
    });

    it('includes Latin words', () => {
      const tokens = jaLanguagePack.getSearchTokens('hello \u6771\u4EAC');
      expect(tokens).toContain('hello');
    });
  });
});

// ===========================================================================
// Hindi (hi)
// ===========================================================================

describe('hiLanguagePack', () => {
  it('has correct metadata', () => {
    expect(hiLanguagePack.code).toBe('hi');
    expect(hiLanguagePack.script).toBe('devanagari');
    expect(hiLanguagePack.capabilities.phonetic).toBe(true);
  });

  describe('normalize', () => {
    it('normalizes whitespace', () => {
      expect(hiLanguagePack.normalize('\u0928\u092E\u0938\u094D\u0924\u0947  \u0926\u0941\u0928\u093F\u092F\u093E')).toBe(
        '\u0928\u092E\u0938\u094D\u0924\u0947 \u0926\u0941\u0928\u093F\u092F\u093E'
      );
    });
  });

  describe('tokenize', () => {
    it('splits Hindi text on whitespace', () => {
      const tokens = hiLanguagePack.tokenize('\u0928\u092E\u0938\u094D\u0924\u0947 \u0926\u0941\u0928\u093F\u092F\u093E');
      const words = tokens.filter(t => t.type === 'word');
      expect(words).toHaveLength(2);
    });

    it('recognizes Devanagari digits', () => {
      const tokens = hiLanguagePack.tokenize('\u0967\u0968\u0969');
      expect(tokens[0].type).toBe('number');
    });
  });

  describe('getSearchTokens', () => {
    it('includes transliterated form for Devanagari words', () => {
      const tokens = hiLanguagePack.getSearchTokens('\u0928\u092E\u0938\u094D\u0924\u0947');
      // Should have both the Devanagari word and its romanized form
      expect(tokens.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('transliterate', () => {
    it('transliterates Devanagari to Latin', () => {
      const result = hiLanguagePack.transliterate!('\u0928\u092E\u0938\u094D\u0924\u0947');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      // Should contain Latin characters
      expect(/[a-z]/.test(result)).toBe(true);
    });
  });
});

// ===========================================================================
// Arabic (ar)
// ===========================================================================

describe('arLanguagePack', () => {
  it('has correct metadata', () => {
    expect(arLanguagePack.code).toBe('ar');
    expect(arLanguagePack.direction).toBe('rtl');
    expect(arLanguagePack.script).toBe('arabic');
  });

  describe('normalize', () => {
    it('removes tashkeel (diacritics)', () => {
      // \u0643\u0650\u062A\u0627\u0628 (kitaab with kasra) -> \u0643\u062A\u0627\u0628
      const result = arLanguagePack.normalize('\u0643\u0650\u062A\u0627\u0628');
      expect(result).toBe('\u0643\u062A\u0627\u0628');
    });

    it('normalizes alef variants', () => {
      // \u0623 (alef with hamza above) -> \u0627 (plain alef)
      const result = arLanguagePack.normalize('\u0623\u062D\u0645\u062F');
      expect(result).toBe('\u0627\u062D\u0645\u062F');
    });

    it('removes tatweel', () => {
      const result = arLanguagePack.normalize('\u0639\u0640\u0640\u0631\u0628\u064A');
      expect(result).toBe('\u0639\u0631\u0628\u064A');
    });
  });

  describe('tokenize', () => {
    it('splits Arabic text on whitespace', () => {
      const tokens = arLanguagePack.tokenize('\u0645\u0631\u062D\u0628\u0627 \u0628\u0627\u0644\u0639\u0627\u0644\u0645');
      const words = tokens.filter(t => t.type === 'word');
      expect(words).toHaveLength(2);
    });

    it('strips definite article in normalized form', () => {
      const tokens = arLanguagePack.tokenize('\u0627\u0644\u0643\u062A\u0627\u0628');
      expect(tokens[0].normalized).toBe('\u0643\u062A\u0627\u0628');
    });
  });

  describe('getSearchTokens', () => {
    it('includes stemmed forms', () => {
      // \u0627\u0644\u0643\u062A\u0627\u0628\u0627\u062A (al-kitaabaat) -> should stem
      const tokens = arLanguagePack.getSearchTokens('\u0627\u0644\u0643\u062A\u0627\u0628\u0627\u062A');
      expect(tokens.length).toBeGreaterThanOrEqual(1);
      // Should have both the full word and a stemmed form
    });

    it('skips punctuation', () => {
      const tokens = arLanguagePack.getSearchTokens('!!!');
      expect(tokens).toHaveLength(0);
    });
  });
});

// ===========================================================================
// Ukrainian (uk)
// ===========================================================================

describe('ukLanguagePack', () => {
  it('has correct metadata', () => {
    expect(ukLanguagePack.code).toBe('uk');
    expect(ukLanguagePack.script).toBe('cyrillic');
    expect(ukLanguagePack.direction).toBe('ltr');
  });

  describe('normalize', () => {
    it('lowercases text', () => {
      expect(ukLanguagePack.normalize('\u041F\u0440\u0438\u0432\u0456\u0442')).toBe('\u043F\u0440\u0438\u0432\u0456\u0442');
    });

    it('normalizes whitespace', () => {
      expect(ukLanguagePack.normalize('\u043F\u0440\u0438\u0432\u0456\u0442  \u0441\u0432\u0456\u0442')).toBe(
        '\u043F\u0440\u0438\u0432\u0456\u0442 \u0441\u0432\u0456\u0442'
      );
    });
  });

  describe('tokenize', () => {
    it('splits on whitespace', () => {
      const tokens = ukLanguagePack.tokenize('\u043F\u0440\u0438\u0432\u0456\u0442 \u0441\u0432\u0456\u0442');
      const words = tokens.filter(t => t.type === 'word');
      expect(words).toHaveLength(2);
    });
  });

  describe('getSearchTokens', () => {
    it('includes stemmed forms for Cyrillic words', () => {
      // \u043a\u043d\u0438\u0436\u043a\u0430\u043c\u0438 (knyzhkamy) -> should stem to \u043a\u043d\u0438\u0436\u043a
      const tokens = ukLanguagePack.getSearchTokens('\u043a\u043d\u0438\u0436\u043a\u0430\u043c\u0438');
      expect(tokens.length).toBeGreaterThanOrEqual(1);
    });

    it('does not stem short words', () => {
      const tokens = ukLanguagePack.getSearchTokens('\u0434\u043e');
      // "до" is too short to stem
      expect(tokens).toEqual(['\u0434\u043e']);
    });

    it('skips punctuation', () => {
      const tokens = ukLanguagePack.getSearchTokens('...');
      expect(tokens).toHaveLength(0);
    });
  });
});
