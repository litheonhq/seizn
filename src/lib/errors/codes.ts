/**
 * Seizn Standardized Error Codes
 *
 * Error Code Format: SEIZN_XXX
 * - SEIZN_1xx: Authentication/Authorization errors
 * - SEIZN_2xx: Request validation errors
 * - SEIZN_3xx: Resource errors (not found, conflict)
 * - SEIZN_4xx: External service errors
 * - SEIZN_5xx: Internal server errors
 *
 * @module errors/codes
 */

// ============================================
// Authentication/Authorization (SEIZN_1xx)
// ============================================

export const AUTH_CODES = {
  /** API key not provided in request */
  MISSING_API_KEY: 'SEIZN_100',
  /** API key is invalid or inactive */
  INVALID_API_KEY: 'SEIZN_101',
  /** API key has expired */
  EXPIRED_API_KEY: 'SEIZN_102',
  /** API key lacks required scope/permission */
  INSUFFICIENT_SCOPE: 'SEIZN_103',
  /** User session expired or invalid */
  SESSION_EXPIRED: 'SEIZN_104',
  /** Access denied to requested resource */
  ACCESS_DENIED: 'SEIZN_105',
  /** Organization membership required */
  ORG_MEMBERSHIP_REQUIRED: 'SEIZN_106',
  /** Rate limit exceeded (per-minute) */
  RATE_LIMIT_EXCEEDED: 'SEIZN_110',
  /** Daily quota exceeded */
  DAILY_QUOTA_EXCEEDED: 'SEIZN_111',
  /** Monthly quota exceeded */
  MONTHLY_QUOTA_EXCEEDED: 'SEIZN_112',
  /** Token budget exhausted */
  TOKEN_BUDGET_EXCEEDED: 'SEIZN_113',
} as const;

// ============================================
// Request Validation (SEIZN_2xx)
// ============================================

export const VALIDATION_CODES = {
  /** Required field missing from request */
  MISSING_REQUIRED_FIELD: 'SEIZN_200',
  /** Field value has invalid type */
  INVALID_FIELD_TYPE: 'SEIZN_201',
  /** Field value out of allowed range */
  FIELD_OUT_OF_RANGE: 'SEIZN_202',
  /** String field exceeds max length */
  FIELD_TOO_LONG: 'SEIZN_203',
  /** String field below min length */
  FIELD_TOO_SHORT: 'SEIZN_204',
  /** Field value doesn't match pattern */
  INVALID_FORMAT: 'SEIZN_205',
  /** Request body is not valid JSON */
  INVALID_JSON: 'SEIZN_206',
  /** Content-Type header incorrect */
  INVALID_CONTENT_TYPE: 'SEIZN_207',
  /** Request payload too large */
  PAYLOAD_TOO_LARGE: 'SEIZN_208',
  /** Invalid enum/allowed value */
  INVALID_ENUM_VALUE: 'SEIZN_209',
  /** Array field exceeds max items */
  ARRAY_TOO_LARGE: 'SEIZN_210',
  /** Array field below min items */
  ARRAY_TOO_SMALL: 'SEIZN_211',
  /** Invalid UUID format */
  INVALID_UUID: 'SEIZN_212',
  /** Invalid URL format */
  INVALID_URL: 'SEIZN_213',
  /** Invalid email format */
  INVALID_EMAIL: 'SEIZN_214',
  /** Invalid date/time format */
  INVALID_DATETIME: 'SEIZN_215',
} as const;

// ============================================
// Resource Errors (SEIZN_3xx)
// ============================================

export const RESOURCE_CODES = {
  /** Generic resource not found */
  NOT_FOUND: 'SEIZN_300',
  /** Memory record not found */
  MEMORY_NOT_FOUND: 'SEIZN_301',
  /** Collection not found */
  COLLECTION_NOT_FOUND: 'SEIZN_302',
  /** Document not found */
  DOCUMENT_NOT_FOUND: 'SEIZN_303',
  /** User not found */
  USER_NOT_FOUND: 'SEIZN_304',
  /** Organization not found */
  ORG_NOT_FOUND: 'SEIZN_305',
  /** API key not found */
  API_KEY_NOT_FOUND: 'SEIZN_306',
  /** Trace/log not found */
  TRACE_NOT_FOUND: 'SEIZN_307',
  /** Webhook not found */
  WEBHOOK_NOT_FOUND: 'SEIZN_308',
  /** Experiment not found */
  EXPERIMENT_NOT_FOUND: 'SEIZN_309',
  /** Resource already exists (conflict) */
  ALREADY_EXISTS: 'SEIZN_350',
  /** Duplicate entry detected */
  DUPLICATE_ENTRY: 'SEIZN_351',
  /** Resource state conflict */
  STATE_CONFLICT: 'SEIZN_352',
  /** Concurrent modification conflict */
  CONCURRENT_MODIFICATION: 'SEIZN_353',
  /** Resource is locked */
  RESOURCE_LOCKED: 'SEIZN_354',
  /** Resource has been deleted */
  RESOURCE_DELETED: 'SEIZN_355',
} as const;

// ============================================
// External Service Errors (SEIZN_4xx)
// ============================================

export const EXTERNAL_CODES = {
  /** Generic external service error */
  EXTERNAL_SERVICE_ERROR: 'SEIZN_400',
  /** OpenAI/Anthropic API error */
  AI_PROVIDER_ERROR: 'SEIZN_401',
  /** Embedding generation failed */
  EMBEDDING_FAILED: 'SEIZN_402',
  /** LLM completion failed */
  LLM_COMPLETION_FAILED: 'SEIZN_403',
  /** Vector database error */
  VECTOR_DB_ERROR: 'SEIZN_404',
  /** Supabase database error */
  DATABASE_ERROR: 'SEIZN_405',
  /** Redis cache error */
  CACHE_ERROR: 'SEIZN_406',
  /** Email service error */
  EMAIL_SERVICE_ERROR: 'SEIZN_407',
  /** Webhook delivery failed */
  WEBHOOK_DELIVERY_FAILED: 'SEIZN_408',
  /** Third-party API timeout */
  EXTERNAL_TIMEOUT: 'SEIZN_409',
  /** Third-party rate limit */
  EXTERNAL_RATE_LIMIT: 'SEIZN_410',
  /** Payment provider error */
  PAYMENT_ERROR: 'SEIZN_411',
  /** Storage service error */
  STORAGE_ERROR: 'SEIZN_412',
  /** Federated source error */
  FEDERATED_SOURCE_ERROR: 'SEIZN_413',
} as const;

// ============================================
// Internal Server Errors (SEIZN_5xx)
// ============================================

export const INTERNAL_CODES = {
  /** Generic internal server error */
  INTERNAL_ERROR: 'SEIZN_500',
  /** Unexpected exception caught */
  UNEXPECTED_ERROR: 'SEIZN_501',
  /** Configuration error */
  CONFIG_ERROR: 'SEIZN_502',
  /** Service temporarily unavailable */
  SERVICE_UNAVAILABLE: 'SEIZN_503',
  /** Feature not implemented */
  NOT_IMPLEMENTED: 'SEIZN_504',
  /** Dependency initialization failed */
  INIT_FAILED: 'SEIZN_505',
  /** Background job failed */
  JOB_FAILED: 'SEIZN_506',
  /** Data integrity error */
  DATA_INTEGRITY_ERROR: 'SEIZN_507',
  /** Circuit breaker open */
  CIRCUIT_BREAKER_OPEN: 'SEIZN_508',
} as const;

// ============================================
// Combined Error Code Types
// ============================================

export const SEIZN_ERROR_CODES = {
  ...AUTH_CODES,
  ...VALIDATION_CODES,
  ...RESOURCE_CODES,
  ...EXTERNAL_CODES,
  ...INTERNAL_CODES,
} as const;

export type SeizErrorCode = typeof SEIZN_ERROR_CODES[keyof typeof SEIZN_ERROR_CODES];

// ============================================
// Error Category Helpers
// ============================================

/**
 * Check if error code is authentication/authorization related
 */
export function isAuthError(code: string): boolean {
  return code.startsWith('SEIZN_1');
}

/**
 * Check if error code is validation related
 */
export function isValidationError(code: string): boolean {
  return code.startsWith('SEIZN_2');
}

/**
 * Check if error code is resource related
 */
export function isResourceError(code: string): boolean {
  return code.startsWith('SEIZN_3');
}

/**
 * Check if error code is external service related
 */
export function isExternalError(code: string): boolean {
  return code.startsWith('SEIZN_4');
}

/**
 * Check if error code is internal server related
 */
export function isInternalError(code: string): boolean {
  return code.startsWith('SEIZN_5');
}

/**
 * Get HTTP status code from SEIZN error code
 */
export function getHttpStatus(code: SeizErrorCode): number {
  const prefix = code.slice(0, 8); // "SEIZN_1" etc.

  switch (prefix) {
    case 'SEIZN_10': // Auth errors (100-109)
      return 401;
    case 'SEIZN_11': // Rate limit errors (110-119)
      return 429;
    case 'SEIZN_2': // Validation errors
      return 400;
    case 'SEIZN_30': // Not found errors (300-309)
      return 404;
    case 'SEIZN_35': // Conflict errors (350-359)
      return 409;
    case 'SEIZN_4': // External service errors
      return 502;
    case 'SEIZN_50': // Internal errors (500-504)
      return 500;
    case 'SEIZN_503': // Service unavailable
      return 503;
    default:
      return 500;
  }
}

/**
 * Get error category name from code
 */
export function getErrorCategory(code: SeizErrorCode): string {
  if (isAuthError(code)) return 'authentication';
  if (isValidationError(code)) return 'validation';
  if (isResourceError(code)) return 'resource';
  if (isExternalError(code)) return 'external_service';
  if (isInternalError(code)) return 'internal';
  return 'unknown';
}
