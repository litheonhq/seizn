/**
 * Security Utilities
 *
 * Centralized exports for PII detection, masking, and audit logging.
 * Use these utilities to protect sensitive data in your application.
 *
 * @example
 * ```ts
 * import { detectPII, maskPII, hasPII, logPIIDetection } from '@/lib/security';
 *
 * // Check for PII
 * if (hasPII(userInput)) {
 *   console.warn('Input contains personal information');
 * }
 *
 * // Detect and analyze
 * const result = detectPII(text);
 * console.log(`Found ${result.count} PII matches of types: ${result.types.join(', ')}`);
 *
 * // Mask sensitive data
 * const masked = maskPII(text);
 * console.log(masked.masked); // "Email: j***@e***.com"
 *
 * // Audit logging
 * await logPIIDetection({
 *   userId: 'user-123',
 *   piiTypes: result.types,
 *   action: 'masked',
 * });
 * ```
 */

// =============================================================================
// PII Patterns
// =============================================================================

export {
  // Types
  type PIIType,
  type PatternDefinition,

  // Individual patterns (for direct use)
  EMAIL_PATTERN,
  PHONE_PATTERN,
  PHONE_KR_PATTERN,
  CREDIT_CARD_PATTERN,
  CREDIT_CARD_SEPARATED_PATTERN,
  SSN_PATTERN,
  RRN_PATTERN,
  IP_ADDRESS_PATTERN,
  IPV6_ADDRESS_PATTERN,
  API_KEY_OPENAI_PATTERN,
  API_KEY_SEIZN_PATTERN,
  API_KEY_STRIPE_PATTERN,
  API_KEY_GENERIC_PATTERN,
  AWS_ACCESS_KEY_PATTERN,
  GITHUB_TOKEN_CLASSIC_PATTERN,
  GITHUB_TOKEN_FINEGRAINED_PATTERN,
  GITHUB_OAUTH_PATTERN,
  JWT_PATTERN,

  // Pattern registry
  PII_PATTERNS,

  // Validators
  luhnCheck,
  validateSSN,
  validateRRN,

  // Utilities
  getPatternsByType,
  getAllPIITypes,
} from './pii-patterns';

// =============================================================================
// PII Detector
// =============================================================================

export {
  // Types
  type PIIMatch,
  type PIIDetectionResult,
  type DetectionOptions,

  // Detection functions
  detectPII,
  hasPII,
  detectPIIByType,
  countPIIByType,
  summarizePII,
} from './pii-detector';

// =============================================================================
// PII Masker
// =============================================================================

export {
  // Types
  type MaskOptions,
  type MaskStrategy,
  type MaskResult,

  // Masking functions
  maskPII,
  maskPIIWithMatches,
  maskValue,
  getDefaultStrategy,
  createMaskStrategy,
} from './pii-masker';

// =============================================================================
// PII Audit
// =============================================================================

export {
  // Types
  type AuditContext,
  type PIIAuditAction,
  type PIIAuditParams,
  type PIIAuditLogEntry,
  type PIIAuditSummary,

  // Actions
  PIIAuditActions,

  // Logging functions
  logPIIDetection,
  logPIIDetectionResult,
  logPIIBlocked,
  logPIIMasked,
  logPIIBatch,

  // Statistics
  createEmptyPIISummary,
  aggregatePIIAuditEntries,
} from './pii-audit';

// =============================================================================
// Secret Patterns
// =============================================================================

export {
  // Types
  type SecretType,
  type SecretPatternDefinition,

  // Pattern registry
  SECRET_PATTERNS,

  // Utilities
  getPatternsBySeverity,
  getPatternsByType as getSecretPatternsByType,
  getAllSecretTypes,
  getCriticalPatterns,
  getHighConfidencePatterns,
} from './secret-patterns';

// =============================================================================
// PII Pipeline (Unified Detection)
// =============================================================================

export {
  // Types
  type PipelineMode,
  type PIIAction,
  type PipelineConfig,
  type PIIEntity,
  type PipelineResult,
  type PIIAuditEntry as PipelineAuditEntry,

  // Class
  PIIPipeline,

  // Functions
  getPIIPipeline,
  configurePIIPipeline,
  processPII,
  scanPII,
} from './pii-pipeline';

// =============================================================================
// Presidio Integration (NER-based Detection)
// =============================================================================

export {
  // Types
  type PresidioEntityType,
  type PresidioRecognizerResult,
  type PresidioAnalyzeRequest,
  type PresidioAnonymizeRequest,
  type PresidioAnonymizeResponse,
  type PresidioClientConfig,
  type AdHocRecognizer,
  type AnonymizeOperator,

  // Class
  PresidioClient,

  // Functions
  getPresidioClient,
  configurePresidioClient,
  analyzeText,
  anonymizeText,

  // Recognizers
  KOREAN_RECOGNIZERS,
} from './presidio-client';

// =============================================================================
// Convenience Functions
// =============================================================================

import { detectPII as detect, hasPII as has } from './pii-detector';
import { maskPII as mask } from './pii-masker';
import { logPIIDetection as log } from './pii-audit';
import type { PIIType } from './pii-patterns';

/**
 * Quick scan and mask PII in text with automatic audit logging
 *
 * @param text - Text to process
 * @param userId - User ID for audit logging
 * @param options - Additional options
 * @returns Object with masked text and detection info
 */
export async function processAndLogPII(
  text: string,
  userId: string,
  options: {
    source?: string;
    namespace?: string;
    organizationId?: string;
  } = {}
): Promise<{
  text: string;
  hasPII: boolean;
  maskedCount: number;
  types: PIIType[];
}> {
  const maskResult = mask(text);

  if (maskResult.modified) {
    await log({
      userId,
      organizationId: options.organizationId,
      piiTypes: maskResult.maskedTypes,
      action: 'masked',
      source: options.source,
      namespace: options.namespace,
    });
  }

  return {
    text: maskResult.masked,
    hasPII: maskResult.modified,
    maskedCount: maskResult.maskedCount,
    types: maskResult.maskedTypes,
  };
}

/**
 * Validate text for PII and return validation result
 *
 * @param text - Text to validate
 * @param allowedTypes - Types of PII that are allowed (empty = none allowed)
 * @returns Validation result
 */
export function validatePII(
  text: string,
  allowedTypes: PIIType[] = []
): {
  valid: boolean;
  blockedTypes: PIIType[];
  message: string;
} {
  const result = detect(text);

  if (!result.found) {
    return { valid: true, blockedTypes: [], message: 'No PII detected' };
  }

  const blockedTypes = result.types.filter((type) => !allowedTypes.includes(type));

  if (blockedTypes.length === 0) {
    return {
      valid: true,
      blockedTypes: [],
      message: `PII detected but allowed: ${result.types.join(', ')}`,
    };
  }

  return {
    valid: false,
    blockedTypes,
    message: `Blocked PII types found: ${blockedTypes.join(', ')}`,
  };
}

/**
 * Check if text is safe (contains no PII)
 */
export function isSafe(text: string): boolean {
  return !has(text);
}

/**
 * Get a redacted version of text (all PII replaced with [REDACTED])
 */
export function redact(text: string): string {
  const result = detect(text);
  if (!result.found) return text;

  // Sort by position descending
  const sortedMatches = [...result.matches].sort((a, b) => b.startIndex - a.startIndex);

  let redacted = text;
  for (const match of sortedMatches) {
    redacted = redacted.slice(0, match.startIndex) + '[REDACTED]' + redacted.slice(match.endIndex);
  }

  return redacted;
}

// =============================================================================
// Red Team Harness
// =============================================================================

export {
  // Types
  type AttackCategory,
  type AttackSeverity,
  type AttackVector,
  type RedTeamResult,
  type RedTeamRun,
  type RedTeamConfig,
  type VulnerabilityReport,

  // Classes
  AttackGenerator,
  RedTeamRunner,

  // Factory functions
  createAttackGenerator,
  createRedTeamRunner,

  // Attack vectors
  ATTACK_VECTORS,
  attackVectors,
} from './red-team';
