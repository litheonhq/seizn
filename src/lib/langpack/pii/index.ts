/**
 * Multilingual PII Recognition Module
 *
 * Extends the core PII detector with language-specific patterns for
 * India (Aadhaar, PAN), China (身份证号), and Ukraine (passport/ID).
 *
 * Integrates with the existing pii-detector.ts via the shared
 * PatternDefinition interface.
 *
 * @module lib/langpack/pii
 */

import type { PatternDefinition, PIIType } from '@/lib/security/pii-patterns';
import { INDIA_PII_PATTERNS } from './patterns/india';
import { CHINA_PII_PATTERNS } from './patterns/china';
import { UKRAINE_PII_PATTERNS } from './patterns/ukraine';

// =============================================================================
// Extended PII Types
// =============================================================================

/**
 * Additional PII types for multilingual patterns.
 * These extend the base PIIType from security/pii-patterns.
 */
export type MultilingualPIIType =
  | PIIType
  | 'aadhaar'
  | 'pan_india'
  | 'china_id'
  | 'china_phone'
  | 'ukraine_passport'
  | 'ukraine_tax_id'
  | 'ukraine_phone';

// =============================================================================
// Pattern Registry
// =============================================================================

/**
 * All multilingual PII patterns.
 * Can be merged with the base PII_PATTERNS for comprehensive scanning.
 */
export const MULTILINGUAL_PII_PATTERNS: PatternDefinition[] = [
  ...INDIA_PII_PATTERNS,
  ...CHINA_PII_PATTERNS,
  ...UKRAINE_PII_PATTERNS,
];

/**
 * Get PII patterns for a specific language/region.
 *
 * @param language - BCP-47 language code or country code
 * @returns Array of patterns applicable to that language/region
 */
export function getPatternsForLanguage(language: string): PatternDefinition[] {
  const lang = language.toLowerCase();

  if (lang === 'hi' || lang.startsWith('hi-') || lang === 'in') {
    return INDIA_PII_PATTERNS;
  }

  if (lang === 'zh' || lang.startsWith('zh-') || lang === 'cn') {
    return CHINA_PII_PATTERNS;
  }

  if (lang === 'uk' || lang.startsWith('uk-') || lang === 'ua') {
    return UKRAINE_PII_PATTERNS;
  }

  // Return all patterns for unknown languages
  return MULTILINGUAL_PII_PATTERNS;
}

/**
 * Get all multilingual PII types supported.
 */
export function getMultilingualPIITypes(): string[] {
  return Array.from(
    new Set(MULTILINGUAL_PII_PATTERNS.map((p) => p.type))
  );
}

// =============================================================================
// Multilingual PII Detection
// =============================================================================

export interface MultilingualPIIResult {
  found: boolean;
  count: number;
  types: string[];
  maxConfidence: number;
  matches: Array<{
    type: string;
    value: string;
    startIndex: number;
    endIndex: number;
    confidence: number;
    description?: string;
  }>;
}

/**
 * Scan text for language-specific PII patterns.
 * Runs the multilingual patterns that match the detected language.
 */
export function detectMultilingualPII(
  text: string,
  language: string,
  minConfidence = 0.7
): MultilingualPIIResult {
  const patterns = getPatternsForLanguage(language);
  const matches: MultilingualPIIResult['matches'] = [];
  const seenRanges = new Set<string>();

  for (const patternDef of patterns) {
    const regex = new RegExp(patternDef.pattern.source, patternDef.pattern.flags);

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const matchedValue = match[0];
      const startIndex = match.index;
      const endIndex = startIndex + matchedValue.length;
      const rangeKey = `${startIndex}-${endIndex}`;

      if (seenRanges.has(rangeKey)) continue;

      let confidence = patternDef.confidence;
      if (patternDef.validator) {
        if (!patternDef.validator(matchedValue)) continue;
        confidence = Math.min(confidence + 0.05, 1.0);
      }

      if (confidence < minConfidence) continue;

      seenRanges.add(rangeKey);
      matches.push({
        type: patternDef.type,
        value: matchedValue,
        startIndex,
        endIndex,
        confidence,
        description: patternDef.description,
      });
    }
  }

  matches.sort((a, b) => a.startIndex - b.startIndex);

  const uniqueTypes = Array.from(new Set(matches.map((m) => m.type)));
  const maxConfidence = matches.length > 0
    ? Math.max(...matches.map((m) => m.confidence))
    : 0;

  return {
    found: matches.length > 0,
    count: matches.length,
    types: uniqueTypes,
    maxConfidence,
    matches,
  };
}
