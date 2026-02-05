/**
 * India PII Patterns
 *
 * Detects Indian personally identifiable information:
 * - Aadhaar number (12-digit unique ID)
 * - PAN (Permanent Account Number)
 * - Indian phone numbers
 *
 * @module lib/langpack/pii/patterns/india
 */

import type { PatternDefinition } from '@/lib/security/pii-patterns';

// =============================================================================
// Aadhaar Number
// =============================================================================

/**
 * Aadhaar number: 12 digits, often formatted as XXXX XXXX XXXX or XXXX-XXXX-XXXX
 * First digit is never 0 or 1.
 */
const AADHAAR_PATTERN = /\b[2-9][0-9]{3}[-\s]?[0-9]{4}[-\s]?[0-9]{4}\b/g;

/**
 * Validates Aadhaar using Verhoeff algorithm checksum.
 * Simplified validation: checks format and basic constraints.
 */
function validateAadhaar(match: string): boolean {
  const digits = match.replace(/\D/g, '');
  if (digits.length !== 12) return false;

  // First digit must be 2-9
  if (digits[0] === '0' || digits[0] === '1') return false;

  // Should not be all same digits
  if (/^(\d)\1{11}$/.test(digits)) return false;

  // Verhoeff checksum (multiplication and permutation tables)
  const d = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  ];
  const p = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  ];

  let c = 0;
  const reversedDigits = digits.split('').reverse().map(Number);
  for (let i = 0; i < reversedDigits.length; i++) {
    c = d[c][p[i % 8][reversedDigits[i]]];
  }

  return c === 0;
}

// =============================================================================
// PAN (Permanent Account Number)
// =============================================================================

/**
 * PAN: 10-character alphanumeric code
 * Format: AAAPL1234C
 * - First 5: uppercase letters (4th indicates holder type)
 * - Next 4: digits
 * - Last 1: uppercase letter (check digit)
 */
const PAN_PATTERN = /\b[A-Z]{3}[ABCFGHLJPT][A-Z][0-9]{4}[A-Z]\b/g;

function validatePAN(match: string): boolean {
  if (match.length !== 10) return false;

  // 4th character must be one of the valid holder type characters
  const holderTypes = 'ABCFGHLJPT';
  if (!holderTypes.includes(match[3])) return false;

  return true;
}

// =============================================================================
// Indian Phone Numbers
// =============================================================================

/**
 * Indian phone numbers
 * Matches: +91 XXXXX XXXXX, 91-XXXXX-XXXXX, 0XXXXX XXXXX
 */
const INDIA_PHONE_PATTERN = /\b(?:\+?91[-.\s]?)?[6-9][0-9]{4}[-.\s]?[0-9]{5}\b/g;

// =============================================================================
// Export
// =============================================================================

export const INDIA_PII_PATTERNS: PatternDefinition[] = [
  {
    type: 'aadhaar' as PatternDefinition['type'],
    pattern: AADHAAR_PATTERN,
    confidence: 0.90,
    description: 'Indian Aadhaar number (12-digit UID)',
    validator: validateAadhaar,
  },
  {
    type: 'pan_india' as PatternDefinition['type'],
    pattern: PAN_PATTERN,
    confidence: 0.92,
    description: 'Indian PAN (Permanent Account Number)',
    validator: validatePAN,
  },
  {
    type: 'phone' as PatternDefinition['type'],
    pattern: INDIA_PHONE_PATTERN,
    confidence: 0.82,
    description: 'Indian phone number',
  },
];
