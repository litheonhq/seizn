/**
 * Seizn Core SDK - Error Types
 *
 * Comprehensive error handling for the Seizn SDK.
 * All errors extend the base SeiznError class.
 */

import type { SeiznErrorCode, SeiznErrorInfo } from './types';

/**
 * Base error class for all Seizn SDK errors
 */
export class SeiznError extends Error {
  /** Error code for programmatic handling */
  readonly code: SeiznErrorCode;
  /** HTTP status code if applicable */
  readonly statusCode?: number;
  /** Request ID for debugging and support */
  readonly requestId?: string;
  /** Additional error details */
  readonly details?: Record<string, unknown>;
  /** Retry-after seconds (for rate limiting) */
  readonly retryAfter?: number;

  constructor(info: SeiznErrorInfo) {
    super(info.message);
    this.name = 'SeiznError';
    this.code = info.code;
    this.statusCode = info.statusCode;
    this.requestId = info.requestId;
    this.details = info.details;
    this.retryAfter = info.retryAfter;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON for logging/serialization
   */
  toJSON(): SeiznErrorInfo {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      requestId: this.requestId,
      details: this.details,
      retryAfter: this.retryAfter,
    };
  }

  /**
   * Check if this error is retryable
   */
  isRetryable(): boolean {
    return (
      this.code === 'RATE_LIMIT_ERROR' ||
      this.code === 'TIMEOUT_ERROR' ||
      this.code === 'NETWORK_ERROR' ||
      this.code === 'SERVER_ERROR'
    );
  }
}

/**
 * Error thrown when API key is missing or invalid
 */
export class AuthenticationError extends SeiznError {
  constructor(message = 'Invalid or missing API key') {
    super({
      code: 'AUTHENTICATION_ERROR',
      message,
      statusCode: 401,
    });
    this.name = 'AuthenticationError';
  }
}

/**
 * Error thrown when API key lacks required permissions
 */
export class AuthorizationError extends SeiznError {
  constructor(message = 'Insufficient permissions for this operation') {
    super({
      code: 'AUTHORIZATION_ERROR',
      message,
      statusCode: 403,
    });
    this.name = 'AuthorizationError';
  }
}

/**
 * Error thrown when rate limit is exceeded
 */
export class RateLimitError extends SeiznError {
  constructor(
    message = 'Rate limit exceeded',
    retryAfter?: number,
    requestId?: string
  ) {
    super({
      code: 'RATE_LIMIT_ERROR',
      message,
      statusCode: 429,
      retryAfter,
      requestId,
    });
    this.name = 'RateLimitError';
  }
}

/**
 * Error thrown when request validation fails
 */
export class ValidationError extends SeiznError {
  constructor(
    message: string,
    details?: Record<string, unknown>,
    requestId?: string
  ) {
    super({
      code: 'VALIDATION_ERROR',
      message,
      statusCode: 400,
      details,
      requestId,
    });
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when requested resource is not found
 */
export class NotFoundError extends SeiznError {
  constructor(
    resource: string,
    id?: string,
    requestId?: string
  ) {
    const message = id
      ? `${resource} with ID '${id}' not found`
      : `${resource} not found`;
    super({
      code: 'NOT_FOUND_ERROR',
      message,
      statusCode: 404,
      details: { resource, id },
      requestId,
    });
    this.name = 'NotFoundError';
  }
}

/**
 * Error thrown when request times out
 */
export class TimeoutError extends SeiznError {
  constructor(
    timeoutMs: number,
    requestId?: string
  ) {
    super({
      code: 'TIMEOUT_ERROR',
      message: `Request timed out after ${timeoutMs}ms`,
      details: { timeoutMs },
      requestId,
    });
    this.name = 'TimeoutError';
  }
}

/**
 * Error thrown when network connection fails
 */
export class NetworkError extends SeiznError {
  constructor(
    message = 'Network connection failed',
    details?: Record<string, unknown>
  ) {
    super({
      code: 'NETWORK_ERROR',
      message,
      details,
    });
    this.name = 'NetworkError';
  }
}

/**
 * Error thrown for server-side errors (5xx)
 */
export class ServerError extends SeiznError {
  constructor(
    message = 'Internal server error',
    statusCode = 500,
    requestId?: string
  ) {
    super({
      code: 'SERVER_ERROR',
      message,
      statusCode,
      requestId,
    });
    this.name = 'ServerError';
  }
}

/**
 * Create appropriate error from HTTP response
 */
export function createErrorFromResponse(
  statusCode: number,
  body: {
    error?: string;
    message?: string;
    code?: string;
    details?: Record<string, unknown>;
    request_id?: string;
    retry_after?: number;
  }
): SeiznError {
  const message = body.error || body.message || 'Unknown error';
  const requestId = body.request_id;

  switch (statusCode) {
    case 400:
      return new ValidationError(message, body.details, requestId);
    case 401:
      return new AuthenticationError(message);
    case 403:
      return new AuthorizationError(message);
    case 404:
      return new NotFoundError('Resource', undefined, requestId);
    case 429:
      return new RateLimitError(message, body.retry_after, requestId);
    default:
      if (statusCode >= 500) {
        return new ServerError(message, statusCode, requestId);
      }
      return new SeiznError({
        code: 'UNKNOWN_ERROR',
        message,
        statusCode,
        requestId,
        details: body.details,
      });
  }
}

/**
 * Type guard to check if an error is a SeiznError
 */
export function isSeiznError(error: unknown): error is SeiznError {
  return error instanceof SeiznError;
}
