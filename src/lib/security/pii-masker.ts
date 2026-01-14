/**
 * PII (Personally Identifiable Information) Masker
 *
 * Masks detected PII with configurable strategies per data type.
 * Preserves readability while hiding sensitive information.
 */

import { detectPII, type PIIMatch, type DetectionOptions } from './pii-detector';
import { type PIIType } from './pii-patterns';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for PII masking
 */
export interface MaskOptions {
  /** Character to use for masking (default: '*') */
  maskChar?: string;
  /** Preserve original length when masking (default: false for most types) */
  preserveLength?: boolean;
  /** Number of characters to show at start (default: 0) */
  showFirstN?: number;
  /** Number of characters to show at end (default: varies by type) */
  showLastN?: number;
  /** Custom masking strategy per type */
  typeStrategies?: Partial<Record<PIIType, MaskStrategy>>;
}

/**
 * Strategy for masking a specific PII type
 */
export interface MaskStrategy {
  /** Number of characters to show at start */
  showFirstN: number;
  /** Number of characters to show at end */
  showLastN: number;
  /** Whether to preserve original length */
  preserveLength: boolean;
  /** Minimum mask length (default: 3) */
  minMaskLength?: number;
  /** Custom mask function (overrides other options) */
  customMask?: (value: string) => string;
}

/**
 * Result of masking operation
 */
export interface MaskResult {
  /** The masked text */
  masked: string;
  /** Original text */
  original: string;
  /** Whether any masking was applied */
  modified: boolean;
  /** Number of items masked */
  maskedCount: number;
  /** Types that were masked */
  maskedTypes: PIIType[];
}

// =============================================================================
// Default Masking Strategies
// =============================================================================

/**
 * Default masking strategies per PII type
 * Each type has a tailored strategy for optimal readability vs. security
 */
const DEFAULT_STRATEGIES: Record<PIIType, MaskStrategy> = {
  // Email: j***@e***.com
  email: {
    showFirstN: 1,
    showLastN: 4,
    preserveLength: false,
    customMask: maskEmail,
  },

  // Phone: ***-****-1234
  phone: {
    showFirstN: 0,
    showLastN: 4,
    preserveLength: true,
    customMask: maskPhone,
  },

  // Korean phone: ***-****-5678
  phone_kr: {
    showFirstN: 0,
    showLastN: 4,
    preserveLength: true,
    customMask: maskPhoneKR,
  },

  // Credit card: ****-****-****-1234
  credit_card: {
    showFirstN: 0,
    showLastN: 4,
    preserveLength: true,
    customMask: maskCreditCard,
  },

  // SSN: ***-**-1234
  ssn: {
    showFirstN: 0,
    showLastN: 4,
    preserveLength: true,
    customMask: maskSSN,
  },

  // Korean RRN: ******-*******
  rrn: {
    showFirstN: 0,
    showLastN: 0,
    preserveLength: true,
    customMask: maskRRN,
  },

  // IP Address: ***.***.***.123
  ip_address: {
    showFirstN: 0,
    showLastN: 3,
    preserveLength: false,
    customMask: maskIPAddress,
  },

  // IPv6: ****:****:****:****:****:****:****:abcd
  ipv6_address: {
    showFirstN: 0,
    showLastN: 4,
    preserveLength: false,
    customMask: (value) => `****:****:****:****:****:****:****:${value.slice(-4)}`,
  },

  // API Keys: szn_****...****
  api_key_openai: {
    showFirstN: 3,
    showLastN: 4,
    preserveLength: false,
    customMask: maskAPIKey,
  },

  api_key_seizn: {
    showFirstN: 4,
    showLastN: 4,
    preserveLength: false,
    customMask: maskAPIKey,
  },

  api_key_stripe: {
    showFirstN: 7,
    showLastN: 4,
    preserveLength: false,
    customMask: maskAPIKey,
  },

  api_key_generic: {
    showFirstN: 4,
    showLastN: 4,
    preserveLength: false,
    customMask: maskAPIKey,
  },

  // AWS: AKIA****...****
  aws_access_key: {
    showFirstN: 4,
    showLastN: 4,
    preserveLength: false,
    customMask: maskAPIKey,
  },

  // GitHub: ghp_****...****
  github_token: {
    showFirstN: 4,
    showLastN: 4,
    preserveLength: false,
    customMask: maskAPIKey,
  },

  // JWT: eyJ****...****
  jwt: {
    showFirstN: 3,
    showLastN: 4,
    preserveLength: false,
    customMask: maskJWT,
  },
};

// =============================================================================
// Custom Mask Functions
// =============================================================================

/**
 * Mask email address: j***@e***.com
 */
function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex === -1) return email;

  const [localPart, domain] = [email.slice(0, atIndex), email.slice(atIndex + 1)];
  const dotIndex = domain.lastIndexOf('.');

  if (dotIndex === -1) {
    return `${localPart[0]}***@***`;
  }

  const domainName = domain.slice(0, dotIndex);
  const tld = domain.slice(dotIndex);

  const maskedLocal = localPart.length > 0 ? `${localPart[0]}***` : '***';
  const maskedDomain = domainName.length > 0 ? `${domainName[0]}***` : '***';

  return `${maskedLocal}@${maskedDomain}${tld}`;
}

/**
 * Mask phone number: ***-****-1234
 */
function maskPhone(phone: string): string {
  // Remove non-digit characters to get pure number
  const digits = phone.replace(/\D/g, '');

  if (digits.length < 4) {
    return '*'.repeat(phone.length);
  }

  // Keep last 4 digits
  const lastFour = digits.slice(-4);
  const maskedPart = '*'.repeat(digits.length - 4);

  // Try to preserve formatting
  if (phone.includes('-')) {
    return `***-****-${lastFour}`;
  } else if (phone.includes(' ')) {
    return `*** **** ${lastFour}`;
  } else if (phone.includes('.')) {
    return `***.****. ${lastFour}`;
  }

  return `${maskedPart}${lastFour}`;
}

/**
 * Mask Korean phone number: ***-****-5678
 */
function maskPhoneKR(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  if (digits.length < 4) {
    return '*'.repeat(phone.length);
  }

  const lastFour = digits.slice(-4);

  // Korean format: 0XX-XXXX-XXXX
  if (phone.includes('-')) {
    return `***-****-${lastFour}`;
  }

  return `********${lastFour}`;
}

/**
 * Mask credit card: ****-****-****-1234
 */
function maskCreditCard(card: string): string {
  const digits = card.replace(/\D/g, '');

  if (digits.length < 4) {
    return '*'.repeat(card.length);
  }

  const lastFour = digits.slice(-4);

  // With dashes
  if (card.includes('-')) {
    return `****-****-****-${lastFour}`;
  }
  // With spaces
  if (card.includes(' ')) {
    return `**** **** **** ${lastFour}`;
  }

  return `${'*'.repeat(digits.length - 4)}${lastFour}`;
}

/**
 * Mask SSN: ***-**-1234
 */
function maskSSN(ssn: string): string {
  const digits = ssn.replace(/\D/g, '');

  if (digits.length !== 9) {
    return '*'.repeat(ssn.length);
  }

  const lastFour = digits.slice(-4);

  // With dashes
  if (ssn.includes('-')) {
    return `***-**-${lastFour}`;
  }

  return `*****${lastFour}`;
}

/**
 * Mask Korean RRN: ******-*******
 */
function maskRRN(rrn: string): string {
  // RRN should be completely masked for privacy
  if (rrn.includes('-')) {
    return '******-*******';
  }
  return '*'.repeat(13);
}

/**
 * Mask IP address: ***.***.***.123
 */
function maskIPAddress(ip: string): string {
  const parts = ip.split('.');

  if (parts.length !== 4) {
    return '*'.repeat(ip.length);
  }

  // Show only last octet
  return `***.***.***.${parts[3]}`;
}

/**
 * Mask API key: prefix****...****
 */
function maskAPIKey(key: string): string {
  if (key.length <= 8) {
    return '*'.repeat(key.length);
  }

  // Find prefix (up to underscore or first 4 chars)
  const underscoreIndex = key.indexOf('_');
  let prefix: string;
  let suffix: string;

  if (underscoreIndex > 0 && underscoreIndex <= 10) {
    prefix = key.slice(0, underscoreIndex + 1);
    suffix = key.slice(-4);
  } else {
    prefix = key.slice(0, 4);
    suffix = key.slice(-4);
  }

  return `${prefix}****...${suffix}`;
}

/**
 * Mask JWT token: eyJ****...****
 */
function maskJWT(jwt: string): string {
  if (jwt.length <= 20) {
    return 'eyJ****...****';
  }

  return `${jwt.slice(0, 3)}****...${jwt.slice(-4)}`;
}

// =============================================================================
// Main Masking Functions
// =============================================================================

/**
 * Mask PII in text using detected matches
 *
 * @param text - Text containing PII to mask
 * @param matches - Array of PII matches from detector
 * @param options - Masking options
 * @returns Masked text
 */
export function maskPIIWithMatches(
  text: string,
  matches: PIIMatch[],
  options: MaskOptions = {}
): string {
  if (matches.length === 0) {
    return text;
  }

  const { typeStrategies = {} } = options;

  // Sort by position descending to preserve indices during replacement
  const sortedMatches = [...matches].sort((a, b) => b.startIndex - a.startIndex);

  let masked = text;

  for (const match of sortedMatches) {
    // Get strategy for this type
    const strategy = typeStrategies[match.type] || DEFAULT_STRATEGIES[match.type];

    if (!strategy) {
      // Fallback: simple mask
      const maskedValue = '*'.repeat(match.value.length);
      masked = masked.slice(0, match.startIndex) + maskedValue + masked.slice(match.endIndex);
      continue;
    }

    // Apply custom mask function if provided
    let maskedValue: string;
    if (strategy.customMask) {
      maskedValue = strategy.customMask(match.value);
    } else {
      maskedValue = applyMaskStrategy(match.value, strategy, options);
    }

    masked = masked.slice(0, match.startIndex) + maskedValue + masked.slice(match.endIndex);
  }

  return masked;
}

/**
 * Apply mask strategy to a value
 */
function applyMaskStrategy(
  value: string,
  strategy: MaskStrategy,
  options: MaskOptions
): string {
  const maskChar = options.maskChar || '*';
  const minMaskLength = strategy.minMaskLength ?? 3;

  const showFirst = Math.min(strategy.showFirstN, value.length);
  const showLast = Math.min(strategy.showLastN, value.length - showFirst);
  const maskLength = value.length - showFirst - showLast;

  if (maskLength < minMaskLength) {
    // If mask would be too short, mask everything
    return maskChar.repeat(value.length);
  }

  const first = value.slice(0, showFirst);
  const last = value.slice(-showLast || value.length);
  const maskPart = strategy.preserveLength
    ? maskChar.repeat(maskLength)
    : maskChar.repeat(Math.min(maskLength, 4)) + '...';

  return first + maskPart + last;
}

/**
 * Detect and mask PII in a single operation
 *
 * @param text - Text to scan and mask
 * @param options - Combined detection and masking options
 * @returns Mask result with original and masked text
 *
 * @example
 * ```ts
 * const result = maskPII('Email: john@example.com, Card: 4111-1111-1111-1111');
 * // result.masked = 'Email: j***@e***.com, Card: ****-****-****-1111'
 * ```
 */
export function maskPII(
  text: string,
  options: MaskOptions & DetectionOptions = {}
): MaskResult {
  // Detect PII
  const detection = detectPII(text, {
    minConfidence: options.minConfidence,
    includeTypes: options.includeTypes,
    excludeTypes: options.excludeTypes,
    includeValues: true,
  });

  if (!detection.found) {
    return {
      masked: text,
      original: text,
      modified: false,
      maskedCount: 0,
      maskedTypes: [],
    };
  }

  // Mask detected PII
  const masked = maskPIIWithMatches(text, detection.matches, options);

  return {
    masked,
    original: text,
    modified: true,
    maskedCount: detection.count,
    maskedTypes: detection.types,
  };
}

/**
 * Mask a single value by type
 *
 * @param value - Value to mask
 * @param type - PII type
 * @param options - Masking options
 * @returns Masked value
 */
export function maskValue(
  value: string,
  type: PIIType,
  options: MaskOptions = {}
): string {
  const strategy = options.typeStrategies?.[type] || DEFAULT_STRATEGIES[type];

  if (!strategy) {
    return '*'.repeat(value.length);
  }

  if (strategy.customMask) {
    return strategy.customMask(value);
  }

  return applyMaskStrategy(value, strategy, options);
}

/**
 * Get the default masking strategy for a type
 */
export function getDefaultStrategy(type: PIIType): MaskStrategy | undefined {
  return DEFAULT_STRATEGIES[type];
}

/**
 * Create a custom mask strategy
 */
export function createMaskStrategy(options: Partial<MaskStrategy>): MaskStrategy {
  return {
    showFirstN: options.showFirstN ?? 0,
    showLastN: options.showLastN ?? 4,
    preserveLength: options.preserveLength ?? false,
    minMaskLength: options.minMaskLength ?? 3,
    customMask: options.customMask,
  };
}
