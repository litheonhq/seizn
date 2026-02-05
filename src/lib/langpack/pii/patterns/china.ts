/**
 * China PII Patterns
 *
 * Detects Chinese personally identifiable information:
 * - 身份证号 (Resident Identity Card number, 18 digits)
 * - Chinese phone numbers
 *
 * @module lib/langpack/pii/patterns/china
 */

import type { PatternDefinition } from '@/lib/security/pii-patterns';

// =============================================================================
// 身份证号 (Resident Identity Card Number)
// =============================================================================

/**
 * Chinese Resident Identity Card Number (身份证号码)
 * 18-digit format: AABBCC YYYYMMDD NNN X
 * - AABBCC: 6-digit area code
 * - YYYYMMDD: 8-digit birth date
 * - NNN: 3-digit sequence number (odd for male, even for female)
 * - X: check digit (0-9 or X)
 */
const CHINA_ID_PATTERN = /\b[1-9][0-9]{5}(?:19|20)[0-9]{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12][0-9]|3[01])[0-9]{3}[0-9Xx]\b/g;

/**
 * Validates Chinese ID card number using ISO 7064:1983 checksum (MOD 11-2)
 */
function validateChinaID(match: string): boolean {
  const id = match.toUpperCase();
  if (id.length !== 18) return false;

  // Weight factors for each digit position
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  // Check digit mapping
  const checkChars = '10X98765432';

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const digit = parseInt(id[i], 10);
    if (isNaN(digit)) return false;
    sum += digit * weights[i];
  }

  const checkIndex = sum % 11;
  return id[17] === checkChars[checkIndex];
}

// =============================================================================
// Chinese Phone Numbers
// =============================================================================

/**
 * Chinese mobile phone numbers
 * Matches: 1XX XXXX XXXX, +86 1XX XXXX XXXX
 * Prefixes: 13x, 14x, 15x, 16x, 17x, 18x, 19x
 */
const CHINA_PHONE_PATTERN = /\b(?:\+?86[-.\s]?)?1[3-9][0-9][-.\s]?[0-9]{4}[-.\s]?[0-9]{4}\b/g;

// =============================================================================
// Export
// =============================================================================

export const CHINA_PII_PATTERNS: PatternDefinition[] = [
  {
    type: 'china_id' as PatternDefinition['type'],
    pattern: CHINA_ID_PATTERN,
    confidence: 0.93,
    description: 'Chinese Resident Identity Card number (身份证号)',
    validator: validateChinaID,
  },
  {
    type: 'china_phone' as PatternDefinition['type'],
    pattern: CHINA_PHONE_PATTERN,
    confidence: 0.82,
    description: 'Chinese mobile phone number',
  },
];
