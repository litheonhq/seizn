/**
 * Seizn Error Types
 *
 * Type definitions for standardized API error responses.
 *
 * @module errors/types
 */

import type { SeizErrorCode } from './codes';

/**
 * Standardized API error response format
 *
 * All API errors follow this structure:
 * - error_code: Machine-readable SEIZN_XXX code
 * - trace_id: Unique request trace ID for debugging
 * - hint: Developer-friendly resolution suggestion
 * - message: User-friendly error description
 */
export interface SeizApiErrorResponse {
  success: false;
  error: {
    /** Machine-readable error code (SEIZN_XXX format) */
    error_code: SeizErrorCode | string;

    /** Unique trace ID for request tracking and debugging */
    trace_id: string;

    /** Developer hint for resolving the error */
    hint: string;

    /** User-friendly error message */
    message: string;

    /** Additional error details (optional) */
    details?: Record<string, unknown>;

    /** Link to relevant documentation (optional) */
    docs_url?: string;

    /** Timestamp of the error (ISO 8601) */
    timestamp: string;

    /** HTTP status code */
    status: number;
  };
}

/**
 * Options for creating an API error
 */
export interface CreateErrorOptions {
  /** Error code (SEIZN_XXX) */
  code: SeizErrorCode | string;

  /** User-friendly message */
  message: string;

  /** HTTP status code (auto-derived if not provided) */
  status?: number;

  /** Additional error details */
  details?: Record<string, unknown>;

  /** Custom hint (uses default if not provided) */
  hint?: string;

  /** Additional response headers */
  headers?: Record<string, string>;

  /** Existing trace ID (generates new one if not provided) */
  traceId?: string;
}

/**
 * Successful API response format
 */
export interface SeizApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: {
    trace_id: string;
    timestamp: string;
    latency_ms?: number;
  };
}

/**
 * Union type for all API responses
 */
export type SeizApiResponse<T = unknown> =
  | SeizApiSuccessResponse<T>
  | SeizApiErrorResponse;

/**
 * Custom error class for Seizn API errors
 */
export class SeizApiError extends Error {
  public readonly code: SeizErrorCode | string;
  public readonly status: number;
  public readonly hint: string;
  public readonly details?: Record<string, unknown>;
  public readonly traceId: string;
  public readonly timestamp: string;

  constructor(options: CreateErrorOptions & { traceId: string }) {
    super(options.message);
    this.name = 'SeizApiError';
    this.code = options.code;
    this.status = options.status || 500;
    this.hint = options.hint || '';
    this.details = options.details;
    this.traceId = options.traceId;
    this.timestamp = new Date().toISOString();

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SeizApiError);
    }
  }

  /**
   * Convert to JSON response format
   */
  toJSON(): SeizApiErrorResponse {
    return {
      success: false,
      error: {
        error_code: this.code,
        trace_id: this.traceId,
        hint: this.hint,
        message: this.message,
        details: this.details,
        timestamp: this.timestamp,
        status: this.status,
      },
    };
  }
}

/**
 * Validation error field detail
 */
export interface ValidationFieldError {
  field: string;
  message: string;
  code: string;
  value?: unknown;
}

/**
 * Rate limit error details
 */
export interface RateLimitDetails {
  limit: number;
  remaining: number;
  reset_at: string;
  retry_after_seconds: number;
}

/**
 * Quota exceeded error details
 */
export interface QuotaDetails {
  plan: string;
  quota_type: 'daily' | 'monthly' | 'token';
  current_usage: number;
  limit: number;
  reset_at: string;
}
