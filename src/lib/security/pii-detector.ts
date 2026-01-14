/**
 * PII (Personally Identifiable Information) Detector
 *
 * Detects personally identifiable information in text content.
 * Returns structured results with position information for masking.
 */

import { PII_PATTERNS, type PIIType, type PatternDefinition } from './pii-patterns';

// =============================================================================
// Types
// =============================================================================

/**
 * A single PII match found in the text
 */
export interface PIIMatch {
  /** The type of PII detected */
  type: PIIType;
  /** The matched value */
  value: string;
  /** Start index in the original text */
  startIndex: number;
  /** End index in the original text */
  endIndex: number;
  /** Confidence score (0-1) */
  confidence: number;
  /** Pattern description */
  description?: string;
}

/**
 * Result of PII detection
 */
export interface PIIDetectionResult {
  /** Whether any PII was found */
  found: boolean;
  /** Total number of matches */
  count: number;
  /** All matches found */
  matches: PIIMatch[];
  /** Unique types found */
  types: PIIType[];
  /** Highest confidence score among matches */
  maxConfidence: number;
}

/**
 * Options for PII detection
 */
export interface DetectionOptions {
  /** Minimum confidence threshold (0-1, default: 0.7) */
  minConfidence?: number;
  /** Only detect these types (default: all) */
  includeTypes?: PIIType[];
  /** Exclude these types from detection */
  excludeTypes?: PIIType[];
  /** Include the matched value in results (default: true) */
  includeValues?: boolean;
}

// =============================================================================
// Detection Functions
// =============================================================================

/**
 * Detect PII in text content
 *
 * @param text - Text to scan for PII
 * @param options - Detection options
 * @returns Detection result with all matches
 *
 * @example
 * ```ts
 * const result = detectPII('Contact: john@example.com, 010-1234-5678');
 * // result.found = true
 * // result.matches = [{ type: 'email', value: 'john@example.com', ... }, ...]
 * ```
 */
export function detectPII(text: string, options: DetectionOptions = {}): PIIDetectionResult {
  const {
    minConfidence = 0.7,
    includeTypes,
    excludeTypes = [],
    includeValues = true,
  } = options;

  const matches: PIIMatch[] = [];
  const seenRanges = new Set<string>(); // Avoid duplicate detections

  // Filter patterns based on options
  let patterns = PII_PATTERNS;

  if (includeTypes && includeTypes.length > 0) {
    patterns = patterns.filter((p) => includeTypes.includes(p.type));
  }

  if (excludeTypes.length > 0) {
    patterns = patterns.filter((p) => !excludeTypes.includes(p.type));
  }

  // Run each pattern
  for (const patternDef of patterns) {
    // Clone regex to reset lastIndex
    const regex = new RegExp(patternDef.pattern.source, patternDef.pattern.flags);

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const matchedValue = match[0];
      const startIndex = match.index;
      const endIndex = startIndex + matchedValue.length;
      const rangeKey = `${startIndex}-${endIndex}`;

      // Skip if already detected at this position
      if (seenRanges.has(rangeKey)) continue;

      // Run validator if exists
      let confidence = patternDef.confidence;
      if (patternDef.validator) {
        if (!patternDef.validator(matchedValue)) {
          continue; // Validation failed
        }
        // Boost confidence on validation pass
        confidence = Math.min(confidence + 0.05, 1.0);
      }

      // Check confidence threshold
      if (confidence < minConfidence) continue;

      seenRanges.add(rangeKey);

      const piiMatch: PIIMatch = {
        type: patternDef.type,
        value: includeValues ? matchedValue : '[REDACTED]',
        startIndex,
        endIndex,
        confidence,
        description: patternDef.description,
      };

      matches.push(piiMatch);
    }
  }

  // Sort by position
  matches.sort((a, b) => a.startIndex - b.startIndex);

  // Calculate aggregate stats
  const uniqueTypes = Array.from(new Set(matches.map((m) => m.type)));
  const maxConfidence = matches.length > 0 ? Math.max(...matches.map((m) => m.confidence)) : 0;

  return {
    found: matches.length > 0,
    count: matches.length,
    matches,
    types: uniqueTypes,
    maxConfidence,
  };
}

/**
 * Quick check if text contains any PII
 *
 * @param text - Text to check
 * @param options - Detection options
 * @returns True if any PII is detected
 *
 * @example
 * ```ts
 * if (hasPII(userInput)) {
 *   console.warn('Input contains personal information');
 * }
 * ```
 */
export function hasPII(text: string, options: DetectionOptions = {}): boolean {
  // For quick check, use early return optimization
  const {
    minConfidence = 0.7,
    includeTypes,
    excludeTypes = [],
  } = options;

  // Filter patterns
  let patterns = PII_PATTERNS;

  if (includeTypes && includeTypes.length > 0) {
    patterns = patterns.filter((p) => includeTypes.includes(p.type));
  }

  if (excludeTypes.length > 0) {
    patterns = patterns.filter((p) => !excludeTypes.includes(p.type));
  }

  // Check each pattern, return early on first match
  for (const patternDef of patterns) {
    if (patternDef.confidence < minConfidence) continue;

    const regex = new RegExp(patternDef.pattern.source, patternDef.pattern.flags);
    const match = regex.exec(text);

    if (match) {
      // Validate if needed
      if (patternDef.validator) {
        if (patternDef.validator(match[0])) {
          return true;
        }
        // Validator failed, continue checking
        continue;
      }
      return true;
    }
  }

  return false;
}

/**
 * Detect specific PII type in text
 *
 * @param text - Text to scan
 * @param type - Specific PII type to detect
 * @returns Array of matches for the specified type
 */
export function detectPIIByType(text: string, type: PIIType): PIIMatch[] {
  const result = detectPII(text, { includeTypes: [type] });
  return result.matches;
}

/**
 * Count PII occurrences by type
 *
 * @param text - Text to scan
 * @returns Object with counts per type
 */
export function countPIIByType(text: string): Record<PIIType, number> {
  const result = detectPII(text);
  const counts: Partial<Record<PIIType, number>> = {};

  for (const match of result.matches) {
    counts[match.type] = (counts[match.type] || 0) + 1;
  }

  return counts as Record<PIIType, number>;
}

/**
 * Get human-readable summary of detected PII
 *
 * @param result - Detection result
 * @returns Summary string
 */
export function summarizePII(result: PIIDetectionResult): string {
  if (!result.found) {
    return 'No PII detected';
  }

  const typeCounts: Record<string, number> = {};
  for (const match of result.matches) {
    typeCounts[match.type] = (typeCounts[match.type] || 0) + 1;
  }

  const parts = Object.entries(typeCounts).map(([type, count]) => {
    const typeLabel = type.replace(/_/g, ' ');
    return `${count} ${typeLabel}${count > 1 ? 's' : ''}`;
  });

  return `Detected: ${parts.join(', ')}`;
}
