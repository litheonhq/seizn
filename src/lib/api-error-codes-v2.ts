/**
 * Seizn API Error Codes (V2)
 *
 * Browser-safe constants shared by server + client (no Node-only imports).
 */

/**
 * Standardized error codes for Seizn API v2
 * These codes are machine-readable and should be used for error handling.
 */
export enum ErrorCodeV2 {
  AUTH_MISSING_KEY = 'AUTH_MISSING_KEY',
  AUTH_INVALID_KEY = 'AUTH_INVALID_KEY',
  AUTH_EXPIRED_KEY = 'AUTH_EXPIRED_KEY',
  RATE_LIMITED = 'RATE_LIMITED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  INVALID_INPUT = 'INVALID_INPUT',
  NOT_FOUND = 'NOT_FOUND',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// Alias for backwards compatibility
export const ErrorCode = ErrorCodeV2;

