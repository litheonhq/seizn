/**
 * Ukraine PII Patterns
 *
 * Detects Ukrainian personally identifiable information:
 * - Passport number (2 Cyrillic letters + 6 digits)
 * - ID card number (9 digits)
 * - Tax identification number (ІПН, 10 digits)
 * - Ukrainian phone numbers
 *
 * @module lib/langpack/pii/patterns/ukraine
 */

import type { PatternDefinition } from '@/lib/security/pii-patterns';

// =============================================================================
// Ukrainian Passport (Internal — Серія + Номер)
// =============================================================================

/**
 * Ukrainian internal passport (old format)
 * Format: 2 Cyrillic letters + 6 digits (e.g., СН 123456)
 * Uses Ukrainian Cyrillic letters common in series: АВ, АЕ, АН, ВК, ВМ, СН, etc.
 */
const UKRAINE_PASSPORT_PATTERN = /\b[АВЕІКМНОРСТХ]{2}[-\s]?[0-9]{6}\b/gu;

/**
 * Ukrainian ID card (new format, since 2016)
 * Format: 9 digits (e.g., 000000000)
 */
const UKRAINE_ID_CARD_PATTERN = /\b[0-9]{9}\b/g;

/**
 * Validator: reject common false positives for 9-digit patterns
 */
function validateUkraineIdCard(match: string): boolean {
  const digits = match.replace(/\D/g, '');
  if (digits.length !== 9) return false;

  // Reject all-zeros or all-same
  if (/^(\d)\1{8}$/.test(digits)) return false;
  if (digits === '000000000') return false;

  // Must not start with 0 (realistic ID card numbers)
  // Actually Ukrainian ID cards can start with 0, so just basic validation
  return true;
}

// =============================================================================
// Tax Identification Number (ІПН / РНОКПП)
// =============================================================================

/**
 * Ukrainian individual tax number (ІПН / РНОКПП)
 * Format: 10 digits
 * First 4 digits represent birth date offset from 1899-12-31
 */
const UKRAINE_TAX_ID_PATTERN = /\b[0-9]{10}\b/g;

/**
 * Validates Ukrainian tax ID (ІПН)
 * Uses weighted sum checksum.
 */
function validateUkraineTaxId(match: string): boolean {
  const digits = match.replace(/\D/g, '');
  if (digits.length !== 10) return false;

  // Reject all-zeros or all-same
  if (/^(\d)\1{9}$/.test(digits)) return false;

  // Checksum validation (weighted sum mod 11 mod 10)
  const weights = [-1, 5, 7, 9, 4, 6, 10, 5, 7];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i], 10) * weights[i];
  }

  const check = ((sum % 11) % 10);
  return check === parseInt(digits[9], 10);
}

// =============================================================================
// Ukrainian Phone Numbers
// =============================================================================

/**
 * Ukrainian phone numbers
 * Matches: +380 XX XXX XXXX, 0XX XXX XXXX
 */
const UKRAINE_PHONE_PATTERN = /\b(?:\+?380[-.\s]?|0)[0-9]{2}[-.\s]?[0-9]{3}[-.\s]?[0-9]{2}[-.\s]?[0-9]{2}\b/g;

// =============================================================================
// Export
// =============================================================================

export const UKRAINE_PII_PATTERNS: PatternDefinition[] = [
  {
    type: 'ukraine_passport' as PatternDefinition['type'],
    pattern: UKRAINE_PASSPORT_PATTERN,
    confidence: 0.88,
    description: 'Ukrainian passport number (series + number)',
  },
  {
    type: 'ukraine_tax_id' as PatternDefinition['type'],
    pattern: UKRAINE_TAX_ID_PATTERN,
    confidence: 0.85,
    description: 'Ukrainian tax identification number (ІПН)',
    validator: validateUkraineTaxId,
  },
  {
    type: 'ukraine_phone' as PatternDefinition['type'],
    pattern: UKRAINE_PHONE_PATTERN,
    confidence: 0.83,
    description: 'Ukrainian phone number',
  },
];
