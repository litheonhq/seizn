/**
 * PII/Sensitive Data Scanner for Seizn Write Pipeline
 *
 * Detects and optionally masks personally identifiable information (PII)
 * and sensitive data (API keys, passwords, etc.) in memory content.
 */

// =============================================================================
// Types
// =============================================================================

export type PIIType =
  | 'email'
  | 'phone'
  | 'ssn'
  | 'credit_card'
  | 'ip_address'
  | 'api_key'
  | 'password'
  | 'name'
  | 'address'
  | 'jwt'
  | 'private_key'
  | 'aws_key'
  | 'github_token'
  | 'base64_secret';

export interface PIIMatch {
  type: PIIType;
  start: number;
  end: number;
  confidence: number;
  value?: string; // Only included if includeValues is true
}

export interface PIIScanResult {
  hasPII: boolean;
  detectedTypes: PIIType[];
  maskedContent?: string;
  confidence: number;
  details: PIIMatch[];
}

export interface ScanOptions {
  /** Include the actual matched values in results (default: false for security) */
  includeValues?: boolean;
  /** Minimum confidence threshold to report a match (0-1, default: 0.7) */
  confidenceThreshold?: number;
  /** Types to scan for (default: all) */
  typesToScan?: PIIType[];
  /** Types to exclude from scanning */
  excludeTypes?: PIIType[];
}

// =============================================================================
// Patterns
// =============================================================================

interface PatternDefinition {
  type: PIIType;
  pattern: RegExp;
  confidence: number;
  validator?: (match: string) => boolean;
}

/**
 * Regular expression patterns for detecting PII
 * Each pattern includes a base confidence score that may be adjusted by validators
 */
const PII_PATTERNS: PatternDefinition[] = [
  // Email addresses
  {
    type: 'email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    confidence: 0.95,
  },

  // Phone numbers - international formats
  {
    type: 'phone',
    // Matches: +1-xxx-xxx-xxxx, (xxx) xxx-xxxx, xxx.xxx.xxxx, etc.
    pattern: /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
    confidence: 0.85,
  },
  {
    type: 'phone',
    // Korean phone numbers: 010-xxxx-xxxx, 02-xxx-xxxx
    pattern: /\b0[1-9][0-9]?[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{4}\b/g,
    confidence: 0.85,
  },

  // Social Security Numbers (US)
  {
    type: 'ssn',
    pattern: /\b[0-9]{3}[-.\s]?[0-9]{2}[-.\s]?[0-9]{4}\b/g,
    confidence: 0.9,
    validator: (match: string) => {
      // Basic SSN validation: not all same digits, not sequential
      const digits = match.replace(/\D/g, '');
      if (digits.length !== 9) return false;
      // Check for invalid patterns
      if (/^(\d)\1{8}$/.test(digits)) return false; // All same digit
      if (digits.startsWith('000') || digits.startsWith('666')) return false;
      if (digits.substring(0, 3) === '900') return false;
      return true;
    },
  },

  // Credit card numbers (with Luhn validation)
  {
    type: 'credit_card',
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})\b/g,
    confidence: 0.95,
    validator: luhnCheck,
  },
  {
    type: 'credit_card',
    // With spaces or dashes: xxxx-xxxx-xxxx-xxxx
    pattern: /\b[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}\b/g,
    confidence: 0.85,
    validator: (match: string) => luhnCheck(match.replace(/\D/g, '')),
  },

  // IP addresses
  {
    type: 'ip_address',
    // IPv4
    pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    confidence: 0.9,
  },
  {
    type: 'ip_address',
    // IPv6 (simplified)
    pattern: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,
    confidence: 0.9,
  },

  // API Keys - common patterns
  {
    type: 'api_key',
    // OpenAI: sk-...
    pattern: /\bsk-[A-Za-z0-9]{20,}\b/g,
    confidence: 0.98,
  },
  {
    type: 'api_key',
    // Seizn: szn_...
    pattern: /\bszn_[A-Za-z0-9_-]{20,}\b/g,
    confidence: 0.98,
  },
  {
    type: 'api_key',
    // Generic API key pattern: xxx_xxx or xxx-xxx (32+ chars)
    pattern: /\b[A-Za-z0-9]{16,}_[A-Za-z0-9]{16,}\b/g,
    confidence: 0.75,
  },
  {
    type: 'api_key',
    // Stripe: sk_live_, sk_test_, pk_live_, pk_test_
    pattern: /\b[sp]k_(?:live|test)_[A-Za-z0-9]{20,}\b/g,
    confidence: 0.98,
  },

  // AWS Keys
  {
    type: 'aws_key',
    // AWS Access Key ID
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    confidence: 0.98,
  },
  {
    type: 'aws_key',
    // AWS Secret Access Key (40 char base64-ish)
    pattern: /\b[A-Za-z0-9/+=]{40}\b/g,
    confidence: 0.6,
    validator: (match: string) => {
      // Must contain mixed case and special chars typical of AWS secrets
      return /[a-z]/.test(match) && /[A-Z]/.test(match) && /[/+=]/.test(match);
    },
  },

  // GitHub tokens
  {
    type: 'github_token',
    // Personal access tokens (classic): ghp_
    pattern: /\bghp_[A-Za-z0-9]{36}\b/g,
    confidence: 0.98,
  },
  {
    type: 'github_token',
    // Fine-grained tokens: github_pat_
    pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g,
    confidence: 0.98,
  },
  {
    type: 'github_token',
    // OAuth tokens: gho_, ghu_, ghs_, ghr_
    pattern: /\bgh[osur]_[A-Za-z0-9]{36}\b/g,
    confidence: 0.98,
  },

  // JWT Tokens
  {
    type: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\b/g,
    confidence: 0.95,
  },

  // Private Keys
  {
    type: 'private_key',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    confidence: 0.99,
  },

  // Password patterns (contextual)
  {
    type: 'password',
    // password: xxx, pwd: xxx, etc.
    pattern: /\b(?:password|passwd|pwd|pass|secret|token)[\s]*[:=][\s]*["']?([^\s"']{4,})["']?/gi,
    confidence: 0.85,
  },

  // Base64-encoded secrets (likely secrets based on length and entropy)
  {
    type: 'base64_secret',
    // Long base64 strings that might be secrets
    pattern: /\b[A-Za-z0-9+/]{40,}={0,2}\b/g,
    confidence: 0.5,
    validator: (match: string) => {
      // Check for high entropy (likely a secret, not regular text)
      return calculateEntropy(match) > 4.5;
    },
  },
];

// =============================================================================
// Validators
// =============================================================================

/**
 * Luhn algorithm for credit card validation
 */
function luhnCheck(cardNumber: string): boolean {
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
 * Calculate Shannon entropy of a string
 * Higher entropy suggests random/secret data
 */
function calculateEntropy(str: string): number {
  const len = str.length;
  if (len === 0) return 0;

  const freq: Record<string, number> = {};
  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }

  let entropy = 0;
  for (const char in freq) {
    const p = freq[char] / len;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

// =============================================================================
// Scanner Functions
// =============================================================================

/**
 * Scan content for PII and sensitive data
 */
export function scanForPII(content: string, options: ScanOptions = {}): PIIScanResult {
  const {
    includeValues = false,
    confidenceThreshold = 0.7,
    typesToScan,
    excludeTypes = [],
  } = options;

  const matches: PIIMatch[] = [];
  const seenRanges = new Set<string>(); // Avoid duplicate detections

  for (const patternDef of PII_PATTERNS) {
    // Filter by types if specified
    if (typesToScan && !typesToScan.includes(patternDef.type)) continue;
    if (excludeTypes.includes(patternDef.type)) continue;

    // Reset regex lastIndex for global patterns
    patternDef.pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = patternDef.pattern.exec(content)) !== null) {
      const matchedValue = match[1] || match[0]; // Use capture group if exists
      const start = match.index;
      const end = start + match[0].length;
      const rangeKey = `${start}-${end}`;

      // Skip if we've already detected something in this range
      if (seenRanges.has(rangeKey)) continue;

      // Run validator if exists
      let confidence = patternDef.confidence;
      if (patternDef.validator) {
        if (!patternDef.validator(matchedValue)) {
          continue; // Validator failed, skip this match
        }
        // Boost confidence if validator passes
        confidence = Math.min(confidence + 0.05, 1.0);
      }

      // Skip if below confidence threshold
      if (confidence < confidenceThreshold) continue;

      seenRanges.add(rangeKey);

      const piiMatch: PIIMatch = {
        type: patternDef.type,
        start,
        end,
        confidence,
      };

      if (includeValues) {
        piiMatch.value = matchedValue;
      }

      matches.push(piiMatch);
    }
  }

  // Sort matches by position
  matches.sort((a, b) => a.start - b.start);

  // Calculate overall confidence (highest individual confidence)
  const overallConfidence = matches.length > 0
    ? Math.max(...matches.map(m => m.confidence))
    : 0;

  // Get unique detected types
  const detectedTypes = Array.from(new Set(matches.map(m => m.type)));

  return {
    hasPII: matches.length > 0,
    detectedTypes,
    confidence: overallConfidence,
    details: matches,
  };
}

/**
 * Mask detected PII in content
 * Replaces detected PII with [MASKED_TYPE] placeholders
 */
export function maskPII(content: string, matches: PIIMatch[]): string {
  if (matches.length === 0) return content;

  // Sort by position descending to replace from end to start
  // This preserves positions during replacement
  const sortedMatches = [...matches].sort((a, b) => b.start - a.start);

  let masked = content;
  for (const match of sortedMatches) {
    const placeholder = `[MASKED_${match.type.toUpperCase()}]`;
    masked = masked.slice(0, match.start) + placeholder + masked.slice(match.end);
  }

  return masked;
}

/**
 * Scan and optionally mask content in a single operation
 */
export function scanAndMask(
  content: string,
  options: ScanOptions = {}
): PIIScanResult {
  const result = scanForPII(content, options);

  if (result.hasPII) {
    result.maskedContent = maskPII(content, result.details);
  }

  return result;
}

/**
 * Quick check if content likely contains PII
 * Faster but less accurate than full scan
 */
export function quickPIICheck(content: string): boolean {
  // Check for common PII indicators
  const quickPatterns = [
    /@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // Email-like
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/, // Phone-like
    /\bsk-[A-Za-z0-9]{10,}/, // API key-like
    /\bszn_[A-Za-z0-9_-]{10,}/, // Seizn key
    /password\s*[:=]/i, // Password mention
    /-----BEGIN.*PRIVATE KEY-----/, // Private key
  ];

  return quickPatterns.some(pattern => pattern.test(content));
}

// =============================================================================
// Exports
// =============================================================================

export {
  luhnCheck,
  calculateEntropy,
};
