/**
 * PII (Personally Identifiable Information) Detection Patterns
 *
 * Regex patterns for detecting various types of sensitive personal data.
 * Used by pii-detector.ts and pii-masker.ts for detection and masking.
 */

// =============================================================================
// Pattern Types
// =============================================================================

export type PIIType =
  | 'email'
  | 'phone'
  | 'phone_kr'
  | 'credit_card'
  | 'ssn'
  | 'rrn'
  | 'ip_address'
  | 'ipv6_address'
  | 'api_key_openai'
  | 'api_key_seizn'
  | 'api_key_stripe'
  | 'api_key_generic'
  | 'aws_access_key'
  | 'github_token'
  | 'jwt';

// =============================================================================
// Email Patterns
// =============================================================================

/**
 * Standard email address pattern
 * Matches: user@example.com, user.name+tag@subdomain.example.co.kr
 */
export const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// =============================================================================
// Phone Number Patterns
// =============================================================================

/**
 * International phone number patterns
 * Matches: +1-xxx-xxx-xxxx, (xxx) xxx-xxxx, xxx.xxx.xxxx, xxx-xxx-xxxx
 */
export const PHONE_PATTERN = /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g;

/**
 * Korean phone numbers
 * Matches: 010-xxxx-xxxx, 02-xxx-xxxx, 031-xxxx-xxxx
 */
export const PHONE_KR_PATTERN = /\b0[1-9][0-9]?[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{4}\b/g;

// =============================================================================
// Financial Patterns
// =============================================================================

/**
 * Credit card numbers (major brands)
 * Matches: Visa, Mastercard, Amex, Discover, JCB
 * With or without separators
 */
export const CREDIT_CARD_PATTERN = /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})\b/g;

/**
 * Credit card with separators (spaces or dashes)
 * Matches: xxxx-xxxx-xxxx-xxxx, xxxx xxxx xxxx xxxx
 */
export const CREDIT_CARD_SEPARATED_PATTERN = /\b[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}\b/g;

// =============================================================================
// Government ID Patterns
// =============================================================================

/**
 * US Social Security Number (SSN)
 * Matches: xxx-xx-xxxx, xxx.xx.xxxx, xxx xx xxxx
 */
export const SSN_PATTERN = /\b[0-9]{3}[-.\s]?[0-9]{2}[-.\s]?[0-9]{4}\b/g;

/**
 * Korean Resident Registration Number (RRN)
 * Format: YYMMDD-GNNNNNN (6 digits - 7 digits)
 * G = gender digit (1-4 for citizens, 5-8 for foreigners)
 */
export const RRN_PATTERN = /\b[0-9]{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12][0-9]|3[01])[-\s]?[1-8][0-9]{6}\b/g;

// =============================================================================
// IP Address Patterns
// =============================================================================

/**
 * IPv4 address
 * Matches: 192.168.1.1, 10.0.0.1, 255.255.255.0
 */
export const IP_ADDRESS_PATTERN = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;

/**
 * IPv6 address (full format)
 * Matches: 2001:0db8:85a3:0000:0000:8a2e:0370:7334
 */
export const IPV6_ADDRESS_PATTERN = /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g;

// =============================================================================
// API Key Patterns
// =============================================================================

/**
 * OpenAI API keys
 * Matches: sk-xxx... (prefix pattern)
 */
export const API_KEY_OPENAI_PATTERN = /\bsk-[A-Za-z0-9]{20,}\b/g;

/**
 * Seizn API keys
 * Matches: szn_xxx...
 */
export const API_KEY_SEIZN_PATTERN = /\bszn_[A-Za-z0-9_-]{20,}\b/g;

/**
 * Stripe API keys
 * Matches: sk_live_xxx, sk_test_xxx, pk_live_xxx, pk_test_xxx
 */
export const API_KEY_STRIPE_PATTERN = /\b[sp]k_(?:live|test)_[A-Za-z0-9]{20,}\b/g;

/**
 * Generic API key pattern (long alphanumeric with underscore separator)
 * Matches: xxx_xxx format where total length >= 32
 */
export const API_KEY_GENERIC_PATTERN = /\b[A-Za-z0-9]{16,}_[A-Za-z0-9]{16,}\b/g;

// =============================================================================
// Cloud Service Patterns
// =============================================================================

/**
 * AWS Access Key ID
 * Matches: AKIA... (20 characters)
 */
export const AWS_ACCESS_KEY_PATTERN = /\bAKIA[0-9A-Z]{16}\b/g;

/**
 * GitHub Personal Access Token (classic)
 * Matches: ghp_xxx (40 characters)
 */
export const GITHUB_TOKEN_CLASSIC_PATTERN = /\bghp_[A-Za-z0-9]{36}\b/g;

/**
 * GitHub Fine-grained Token
 * Matches: github_pat_xxx
 */
export const GITHUB_TOKEN_FINEGRAINED_PATTERN = /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g;

/**
 * GitHub OAuth tokens
 * Matches: gho_, ghu_, ghs_, ghr_ prefixes
 */
export const GITHUB_OAUTH_PATTERN = /\bgh[osur]_[A-Za-z0-9]{36}\b/g;

// =============================================================================
// Token Patterns
// =============================================================================

/**
 * JWT tokens
 * Matches: eyJxxx.eyJxxx.xxx format
 */
export const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\b/g;

// =============================================================================
// Pattern Registry
// =============================================================================

export interface PatternDefinition {
  type: PIIType;
  pattern: RegExp;
  confidence: number;
  description: string;
  validator?: (match: string) => boolean;
}

/**
 * All PII patterns with metadata
 */
export const PII_PATTERNS: PatternDefinition[] = [
  // Email
  {
    type: 'email',
    pattern: EMAIL_PATTERN,
    confidence: 0.95,
    description: 'Email address',
  },

  // Phone numbers
  {
    type: 'phone',
    pattern: PHONE_PATTERN,
    confidence: 0.85,
    description: 'International phone number',
  },
  {
    type: 'phone_kr',
    pattern: PHONE_KR_PATTERN,
    confidence: 0.85,
    description: 'Korean phone number',
  },

  // Financial
  {
    type: 'credit_card',
    pattern: CREDIT_CARD_PATTERN,
    confidence: 0.95,
    description: 'Credit card number',
    validator: luhnCheck,
  },
  {
    type: 'credit_card',
    pattern: CREDIT_CARD_SEPARATED_PATTERN,
    confidence: 0.85,
    description: 'Credit card number with separators',
    validator: (match: string) => luhnCheck(match.replace(/\D/g, '')),
  },

  // Government IDs
  {
    type: 'ssn',
    pattern: SSN_PATTERN,
    confidence: 0.90,
    description: 'US Social Security Number',
    validator: validateSSN,
  },
  {
    type: 'rrn',
    pattern: RRN_PATTERN,
    confidence: 0.92,
    description: 'Korean Resident Registration Number',
    validator: validateRRN,
  },

  // IP Addresses
  {
    type: 'ip_address',
    pattern: IP_ADDRESS_PATTERN,
    confidence: 0.90,
    description: 'IPv4 address',
  },
  {
    type: 'ipv6_address',
    pattern: IPV6_ADDRESS_PATTERN,
    confidence: 0.90,
    description: 'IPv6 address',
  },

  // API Keys
  {
    type: 'api_key_openai',
    pattern: API_KEY_OPENAI_PATTERN,
    confidence: 0.98,
    description: 'OpenAI API key (sk-...)',
  },
  {
    type: 'api_key_seizn',
    pattern: API_KEY_SEIZN_PATTERN,
    confidence: 0.98,
    description: 'Seizn API key (szn_...)',
  },
  {
    type: 'api_key_stripe',
    pattern: API_KEY_STRIPE_PATTERN,
    confidence: 0.98,
    description: 'Stripe API key',
  },
  {
    type: 'api_key_generic',
    pattern: API_KEY_GENERIC_PATTERN,
    confidence: 0.75,
    description: 'Generic API key pattern',
  },

  // Cloud Services
  {
    type: 'aws_access_key',
    pattern: AWS_ACCESS_KEY_PATTERN,
    confidence: 0.98,
    description: 'AWS Access Key ID',
  },
  {
    type: 'github_token',
    pattern: GITHUB_TOKEN_CLASSIC_PATTERN,
    confidence: 0.98,
    description: 'GitHub Personal Access Token',
  },
  {
    type: 'github_token',
    pattern: GITHUB_TOKEN_FINEGRAINED_PATTERN,
    confidence: 0.98,
    description: 'GitHub Fine-grained Token',
  },
  {
    type: 'github_token',
    pattern: GITHUB_OAUTH_PATTERN,
    confidence: 0.98,
    description: 'GitHub OAuth Token',
  },

  // JWT
  {
    type: 'jwt',
    pattern: JWT_PATTERN,
    confidence: 0.95,
    description: 'JWT Token',
  },
];

// =============================================================================
// Validators
// =============================================================================

/**
 * Luhn algorithm for credit card validation
 */
export function luhnCheck(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

/**
 * Validate US Social Security Number format
 */
export function validateSSN(match: string): boolean {
  const digits = match.replace(/\D/g, '');
  if (digits.length !== 9) return false;

  // Invalid patterns
  if (/^(\d)\1{8}$/.test(digits)) return false; // All same digit
  if (digits.startsWith('000')) return false;
  if (digits.startsWith('666')) return false;
  if (digits.startsWith('9')) return false; // 9xx are not issued

  return true;
}

/**
 * Validate Korean Resident Registration Number
 * Uses checksum algorithm for validation
 */
export function validateRRN(match: string): boolean {
  const digits = match.replace(/\D/g, '');
  if (digits.length !== 13) return false;

  // Checksum calculation
  const weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
  let sum = 0;

  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits[i], 10) * weights[i];
  }

  const checkDigit = (11 - (sum % 11)) % 10;
  return checkDigit === parseInt(digits[12], 10);
}

/**
 * Get pattern by PII type
 */
export function getPatternsByType(type: PIIType): PatternDefinition[] {
  return PII_PATTERNS.filter((p) => p.type === type);
}

/**
 * Get all unique PII types
 */
export function getAllPIITypes(): PIIType[] {
  return Array.from(new Set(PII_PATTERNS.map((p) => p.type)));
}
