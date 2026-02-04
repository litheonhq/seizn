/**
 * Seizn API Error Handling V2
 *
 * Standardized error response format with trace_id, request_id, and actionable suggested_fix.
 * This module provides the new error handling interface as per requirements.
 */

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

// ============================================
// Error Codes Enum
// ============================================

/**
 * Standardized error codes for Seizn API v2
 * These codes are machine-readable and should be used for error handling
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

// ============================================
// API Error Interface
// ============================================

/**
 * Standardized API error response format
 */
export interface ApiError {
  error: {
    code: ErrorCodeV2 | string;
    message: string;
    trace_id?: string;
    request_id?: string;
    suggested_fix?: string;
    docs_url?: string;
    details?: Record<string, unknown>;
  };
}

// ============================================
// Internal Utilities
// ============================================

/**
 * Generate a unique trace ID for request tracking
 */
function generateTraceId(): string {
  return `trc_${randomUUID().replace(/-/g, '').substring(0, 24)}`;
}

/**
 * Extract request ID from common headers
 */
function getRequestId(request?: Request): string | undefined {
  if (!request) return undefined;

  // Check common request ID headers
  const headers = [
    'x-request-id',
    'x-correlation-id',
    'cf-ray', // Cloudflare
    'x-amzn-requestid', // AWS
  ];

  for (const header of headers) {
    const value = request.headers.get(header);
    if (value) return value;
  }

  return undefined;
}

/**
 * Map ErrorCodeV2 to suggested fixes
 */
const SuggestedFixes: Record<ErrorCodeV2, string> = {
  [ErrorCodeV2.AUTH_MISSING_KEY]: 'Add Authorization: Bearer <api-key> header with your API key',
  [ErrorCodeV2.AUTH_INVALID_KEY]: 'Check your API key in Dashboard → API Keys',
  [ErrorCodeV2.AUTH_EXPIRED_KEY]: 'Generate a new API key from the dashboard',
  [ErrorCodeV2.RATE_LIMITED]: 'Implement exponential backoff (1s → 2s → 4s)',
  [ErrorCodeV2.QUOTA_EXCEEDED]: 'Upgrade your plan or wait for quota reset',
  [ErrorCodeV2.INVALID_INPUT]: 'Check request body against API documentation',
  [ErrorCodeV2.NOT_FOUND]: 'Verify the resource ID exists and is accessible',
  [ErrorCodeV2.INTERNAL_ERROR]: 'Retry the request; contact support if it persists',
};

/**
 * Map ErrorCodeV2 to docs URLs
 */
function getDocsUrl(code: ErrorCodeV2): string {
  const baseUrl = 'https://www.seizn.com/docs';

  switch (code) {
    case ErrorCodeV2.AUTH_MISSING_KEY:
    case ErrorCodeV2.AUTH_INVALID_KEY:
    case ErrorCodeV2.AUTH_EXPIRED_KEY:
      return `${baseUrl}/api/authentication`;
    case ErrorCodeV2.RATE_LIMITED:
    case ErrorCodeV2.QUOTA_EXCEEDED:
      return `${baseUrl}/api/rate-limits`;
    case ErrorCodeV2.INVALID_INPUT:
      return `${baseUrl}/api/errors`;
    case ErrorCodeV2.NOT_FOUND:
      return `${baseUrl}/api/endpoints`;
    case ErrorCodeV2.INTERNAL_ERROR:
    default:
      return `${baseUrl}/api/errors`;
  }
}

/**
 * Map ErrorCodeV2 to HTTP status codes
 */
function getHttpStatus(code: ErrorCodeV2): number {
  switch (code) {
    case ErrorCodeV2.AUTH_MISSING_KEY:
    case ErrorCodeV2.AUTH_INVALID_KEY:
    case ErrorCodeV2.AUTH_EXPIRED_KEY:
      return 401;
    case ErrorCodeV2.RATE_LIMITED:
    case ErrorCodeV2.QUOTA_EXCEEDED:
      return 429;
    case ErrorCodeV2.INVALID_INPUT:
      return 400;
    case ErrorCodeV2.NOT_FOUND:
      return 404;
    case ErrorCodeV2.INTERNAL_ERROR:
    default:
      return 500;
  }
}

// ============================================
// Main Factory Function
// ============================================

interface CreateApiErrorOptions {
  code: ErrorCodeV2;
  message: string;
  request?: Request;
  details?: Record<string, unknown>;
  headers?: Record<string, string>;
}

/**
 * Create a standardized API error response
 *
 * @example
 * return createApiError({
 *   code: ErrorCodeV2.AUTH_INVALID_KEY,
 *   message: 'Invalid API key provided',
 *   request: req,
 * });
 */
export function createApiError(options: CreateApiErrorOptions): NextResponse<ApiError> {
  const traceId = generateTraceId();
  const requestId = getRequestId(options.request);
  const suggestedFix = SuggestedFixes[options.code];
  const docsUrl = getDocsUrl(options.code);
  const status = getHttpStatus(options.code);

  const errorResponse: ApiError = {
    error: {
      code: options.code,
      message: options.message,
      trace_id: traceId,
      ...(requestId && { request_id: requestId }),
      suggested_fix: suggestedFix,
      docs_url: docsUrl,
      ...(options.details && { details: options.details }),
    },
  };

  const response = NextResponse.json(errorResponse, { status });

  // Add trace ID header for observability
  response.headers.set('X-Trace-ID', traceId);
  if (requestId) {
    response.headers.set('X-Request-ID', requestId);
  }

  // Add custom headers if provided
  if (options.headers) {
    Object.entries(options.headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }

  return response;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Add trace_id to an existing error object
 *
 * @example
 * const error = { error: { code: 'INVALID_INPUT', message: 'Bad request' } };
 * return withTraceId(error);
 */
export function withTraceId<T extends { error: Record<string, unknown> }>(
  error: T,
  traceId?: string
): T & { error: { trace_id: string } } {
  const id = traceId || generateTraceId();
  return {
    ...error,
    error: {
      ...error.error,
      trace_id: id,
    },
  };
}

/**
 * Add request_id to an existing error object from request headers
 *
 * @example
 * const error = { error: { code: 'INVALID_INPUT', message: 'Bad request' } };
 * return withRequestId(error, request);
 */
export function withRequestId<T extends { error: Record<string, unknown> }>(
  error: T,
  request: Request
): T & { error: { request_id?: string } } {
  const requestId = getRequestId(request);
  if (!requestId) return error as T & { error: { request_id?: string } };

  return {
    ...error,
    error: {
      ...error.error,
      request_id: requestId,
    },
  };
}

/**
 * Create a NextResponse from an ApiError object with custom status
 *
 * @example
 * const error: ApiError = {
 *   error: { code: 'INVALID_INPUT', message: 'Query required', trace_id: 'trc_xxx' }
 * };
 * return errorResponse(error, 400);
 */
export function errorResponse(error: ApiError, status: number): NextResponse<ApiError> {
  const response = NextResponse.json(error, { status });

  if (error.error.trace_id) {
    response.headers.set('X-Trace-ID', error.error.trace_id);
  }
  if (error.error.request_id) {
    response.headers.set('X-Request-ID', error.error.request_id);
  }

  return response;
}

/**
 * Quick helper to create error response with minimal options
 *
 * @example
 * return createErrorResponse(ErrorCodeV2.INVALID_INPUT, 'Query is required');
 * return createErrorResponse(ErrorCodeV2.NOT_FOUND, 'Memory not found', { request, details: { id } });
 */
export function createErrorResponse(
  code: ErrorCodeV2,
  message: string,
  options?: { request?: Request; details?: Record<string, unknown> }
): NextResponse<ApiError> {
  return createApiError({
    code,
    message,
    request: options?.request,
    details: options?.details,
  });
}

// ============================================
// Pre-built Error Helpers
// ============================================

/**
 * Pre-built authentication errors
 */
export const AuthErrors = {
  missingKey: (request?: Request) =>
    createApiError({
      code: ErrorCodeV2.AUTH_MISSING_KEY,
      message: 'API key required. Pass your API key in the Authorization: Bearer header.',
      request,
    }),

  invalidKey: (request?: Request) =>
    createApiError({
      code: ErrorCodeV2.AUTH_INVALID_KEY,
      message: 'Invalid or inactive API key.',
      request,
    }),

  expiredKey: (request?: Request) =>
    createApiError({
      code: ErrorCodeV2.AUTH_EXPIRED_KEY,
      message: 'API key has expired. Please generate a new key from the dashboard.',
      request,
    }),
};

/**
 * Pre-built rate limit errors
 */
export const RateLimitErrors = {
  rateLimited: (request?: Request, retryAfter?: number) =>
    createApiError({
      code: ErrorCodeV2.RATE_LIMITED,
      message: 'Rate limit exceeded. Please slow down your requests.',
      request,
      headers: retryAfter ? { 'Retry-After': String(retryAfter) } : undefined,
    }),

  quotaExceeded: (request?: Request, plan?: string) =>
    createApiError({
      code: ErrorCodeV2.QUOTA_EXCEEDED,
      message: plan
        ? `API quota exceeded for your ${plan} plan. Upgrade for higher limits.`
        : 'API quota exceeded. Upgrade your plan for higher limits.',
      request,
      details: plan ? { plan } : undefined,
    }),
};

/**
 * Pre-built validation errors
 */
export const ValidationErrors = {
  invalidInput: (message: string, request?: Request, details?: Record<string, unknown>) =>
    createApiError({
      code: ErrorCodeV2.INVALID_INPUT,
      message,
      request,
      details,
    }),

  missingField: (field: string, request?: Request) =>
    createApiError({
      code: ErrorCodeV2.INVALID_INPUT,
      message: `Missing required field: ${field}`,
      request,
      details: { field },
    }),
};

/**
 * Pre-built resource errors
 */
export const NotFoundErrors = {
  resource: (type: string, id?: string, request?: Request) =>
    createApiError({
      code: ErrorCodeV2.NOT_FOUND,
      message: id ? `${type} not found: ${id}` : `${type} not found`,
      request,
      details: { type, ...(id && { id }) },
    }),

  memory: (id?: string, request?: Request) =>
    NotFoundErrors.resource('Memory', id, request),

  collection: (id?: string, request?: Request) =>
    NotFoundErrors.resource('Collection', id, request),
};

/**
 * Pre-built server errors
 */
export const ServerErrors = {
  internal: (context?: string, request?: Request) =>
    createApiError({
      code: ErrorCodeV2.INTERNAL_ERROR,
      message: 'An unexpected error occurred. Please try again later.',
      request,
      details: context ? { context } : undefined,
    }),
};

// Export generateTraceId for external use
export { generateTraceId };
