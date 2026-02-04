/**
 * Seizn Standardized API Response Helpers
 *
 * Provides consistent response formatting for all API endpoints.
 * All responses include trace_id and request_id for debugging and tracking.
 *
 * @module lib/api-response
 *
 * @example
 * ```ts
 * import { successResponse, errorResponse, generateRequestId } from '@/lib/api-response';
 *
 * // Success response
 * return successResponse(data, traceId, requestId);
 *
 * // Error response
 * return errorResponse(
 *   { code: 'AUTH_001', message: 'Unauthorized', hint: 'Check API key' },
 *   traceId,
 *   requestId
 * );
 * ```
 */

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import type { SeizErrorCode } from './errors/codes';
import { getHttpStatus } from './errors/codes';
import { getErrorHint, getDocsUrl } from './errors/hints';

// ============================================
// Types
// ============================================

/**
 * Standardized success response format
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  trace_id: string;
  request_id: string;
  meta?: {
    timestamp: string;
    latency_ms?: number;
    [key: string]: unknown;
  };
}

/**
 * Standardized error response format
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    hint: string;
    docs_url: string;
    details?: Record<string, unknown>;
  };
  trace_id: string;
  request_id: string;
}

/**
 * Error options for creating error responses
 */
export interface ErrorOptions {
  code: SeizErrorCode | string;
  message: string;
  hint?: string;
  status?: number;
  details?: Record<string, unknown>;
  headers?: Record<string, string>;
}

// ============================================
// ID Generation
// ============================================

/**
 * Generate a unique request ID for request tracking
 * Format: req_xxxxxxxxxxxxxxxx (20 chars)
 */
export function generateRequestId(): string {
  const uuid = randomUUID().replace(/-/g, '');
  return `req_${uuid.substring(0, 16)}`;
}

/**
 * Generate a unique trace ID for distributed tracing
 * Format: szn_trc_xxxxxxxxxxxxxxxx (24 chars)
 */
export function generateTraceId(): string {
  const uuid = randomUUID().replace(/-/g, '');
  return `szn_trc_${uuid.substring(0, 16)}`;
}

/**
 * Extract or generate request ID from request headers
 */
export function getOrCreateRequestId(request?: Request | { headers?: Headers }): string {
  if (request?.headers) {
    const existingRequestId = request.headers.get('x-request-id');
    if (existingRequestId) {
      return existingRequestId;
    }
  }
  return generateRequestId();
}

/**
 * Extract or generate trace ID from request headers
 */
export function getOrCreateTraceId(request?: Request | { headers?: Headers }): string {
  if (request?.headers) {
    const existingTraceId =
      request.headers.get('x-trace-id') ||
      request.headers.get('traceparent')?.split('-')[1];
    if (existingTraceId) {
      return existingTraceId;
    }
  }
  return generateTraceId();
}

// ============================================
// Response Helpers
// ============================================

/**
 * Create a standardized success response
 *
 * Response format:
 * ```json
 * {
 *   "success": true,
 *   "data": { ... },
 *   "trace_id": "szn_trc_xxxxxxxxxx",
 *   "request_id": "req_xxxxxxxxxx",
 *   "meta": {
 *     "timestamp": "2024-01-01T00:00:00.000Z",
 *     "latency_ms": 123
 *   }
 * }
 * ```
 *
 * @example
 * ```ts
 * return successResponse(
 *   { memories: [...] },
 *   traceId,
 *   requestId,
 *   { latency_ms: Date.now() - startTime, count: 10 }
 * );
 * ```
 */
export function successResponse<T>(
  data: T,
  traceId: string,
  requestId: string,
  meta?: Record<string, unknown>
): NextResponse<ApiSuccessResponse<T>> {
  const response = NextResponse.json<ApiSuccessResponse<T>>({
    success: true,
    data,
    trace_id: traceId,
    request_id: requestId,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  });

  // Set trace headers
  response.headers.set('X-Trace-ID', traceId);
  response.headers.set('X-Request-ID', requestId);

  return response;
}

/**
 * Create a standardized error response
 *
 * Response format:
 * ```json
 * {
 *   "success": false,
 *   "error": {
 *     "code": "AUTH_001",
 *     "message": "API key required",
 *     "hint": "Add Authorization: Bearer <api-key> header",
 *     "docs_url": "https://www.seizn.com/docs/api/authentication"
 *   },
 *   "trace_id": "szn_trc_xxxxxxxxxx",
 *   "request_id": "req_xxxxxxxxxx"
 * }
 * ```
 *
 * @example
 * ```ts
 * return errorResponse(
 *   {
 *     code: AUTH_CODES.MISSING_API_KEY,
 *     message: 'API key required',
 *   },
 *   traceId,
 *   requestId
 * );
 * ```
 */
export function errorResponse(
  options: ErrorOptions,
  traceId: string,
  requestId: string
): NextResponse<ApiErrorResponse> {
  const status = options.status || getHttpStatus(options.code as SeizErrorCode);
  const hint = options.hint || getErrorHint(options.code);
  const docsUrl = getDocsUrl(options.code);

  const response = NextResponse.json<ApiErrorResponse>(
    {
      success: false,
      error: {
        code: options.code,
        message: options.message,
        hint,
        docs_url: docsUrl,
        ...(options.details && { details: options.details }),
      },
      trace_id: traceId,
      request_id: requestId,
    },
    { status }
  );

  // Set trace headers
  response.headers.set('X-Trace-ID', traceId);
  response.headers.set('X-Request-ID', requestId);
  response.headers.set('X-Error-Code', options.code);

  // Set custom headers if provided
  if (options.headers) {
    Object.entries(options.headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }

  return response;
}

// ============================================
// Pre-built Error Response Helpers
// ============================================

/**
 * Authentication error responses
 */
export const AuthErrorResponses = {
  missingApiKey: (traceId: string, requestId: string) =>
    errorResponse(
      {
        code: 'SEIZN_100',
        message: 'API key required. Include Authorization: Bearer header in your request.',
      },
      traceId,
      requestId
    ),

  invalidApiKey: (traceId: string, requestId: string) =>
    errorResponse(
      {
        code: 'SEIZN_101',
        message: 'Invalid or inactive API key.',
      },
      traceId,
      requestId
    ),

  expiredApiKey: (traceId: string, requestId: string) =>
    errorResponse(
      {
        code: 'SEIZN_102',
        message: 'API key has expired. Generate a new key from your dashboard.',
      },
      traceId,
      requestId
    ),

  insufficientScope: (requiredScope: string, traceId: string, requestId: string) =>
    errorResponse(
      {
        code: 'SEIZN_103',
        message: `API key lacks required scope: ${requiredScope}`,
        details: { required_scope: requiredScope },
      },
      traceId,
      requestId
    ),

  accessDenied: (resource: string | undefined, traceId: string, requestId: string) =>
    errorResponse(
      {
        code: 'SEIZN_105',
        message: resource
          ? `Access denied to ${resource}.`
          : 'Access denied to this resource.',
        details: resource ? { resource } : undefined,
      },
      traceId,
      requestId
    ),
};

/**
 * Rate limit error responses
 */
export const RateLimitErrorResponses = {
  exceeded: (
    options: {
      limit: number;
      remaining: number;
      resetAt: Date;
      retryAfterSeconds: number;
    },
    traceId: string,
    requestId: string
  ) =>
    errorResponse(
      {
        code: 'SEIZN_110',
        message: 'Rate limit exceeded. Please slow down your requests.',
        details: {
          limit: options.limit,
          remaining: options.remaining,
          reset_at: options.resetAt.toISOString(),
          retry_after_seconds: options.retryAfterSeconds,
        },
        headers: {
          'X-RateLimit-Limit': String(options.limit),
          'X-RateLimit-Remaining': String(options.remaining),
          'X-RateLimit-Reset': options.resetAt.toISOString(),
          'Retry-After': String(options.retryAfterSeconds),
        },
      },
      traceId,
      requestId
    ),

  dailyQuotaExceeded: (
    plan: string,
    usage: number,
    limit: number,
    traceId: string,
    requestId: string
  ) =>
    errorResponse(
      {
        code: 'SEIZN_111',
        message: `Daily API call limit exceeded for ${plan} plan.`,
        details: {
          plan,
          quota_type: 'daily',
          current_usage: usage,
          limit,
        },
      },
      traceId,
      requestId
    ),

  monthlyQuotaExceeded: (
    plan: string,
    usage: number,
    limit: number,
    traceId: string,
    requestId: string
  ) =>
    errorResponse(
      {
        code: 'SEIZN_112',
        message: `Monthly API call limit exceeded for ${plan} plan.`,
        details: {
          plan,
          quota_type: 'monthly',
          current_usage: usage,
          limit,
        },
      },
      traceId,
      requestId
    ),

  tokenBudgetExceeded: (used: number, limit: number, traceId: string, requestId: string) =>
    errorResponse(
      {
        code: 'SEIZN_113',
        message: 'Token budget exhausted.',
        details: {
          tokens_used: used,
          token_limit: limit,
        },
      },
      traceId,
      requestId
    ),
};

/**
 * Validation error responses
 */
export const ValidationErrorResponses = {
  missingField: (field: string, traceId: string, requestId: string) =>
    errorResponse(
      {
        code: 'SEIZN_200',
        message: `Missing required field: ${field}`,
        details: { field },
      },
      traceId,
      requestId
    ),

  invalidFieldType: (
    field: string,
    expected: string,
    received: string,
    traceId: string,
    requestId: string
  ) =>
    errorResponse(
      {
        code: 'SEIZN_201',
        message: `Invalid type for field "${field}": expected ${expected}, got ${received}`,
        details: { field, expected, received },
      },
      traceId,
      requestId
    ),

  invalidJson: (parseError: string | undefined, traceId: string, requestId: string) =>
    errorResponse(
      {
        code: 'SEIZN_206',
        message: 'Request body is not valid JSON',
        details: parseError ? { parse_error: parseError } : undefined,
      },
      traceId,
      requestId
    ),

  invalidEnumValue: (
    field: string,
    value: string,
    allowedValues: string[],
    traceId: string,
    requestId: string
  ) =>
    errorResponse(
      {
        code: 'SEIZN_209',
        message: `Invalid value "${value}" for field "${field}"`,
        details: { field, value, allowed_values: allowedValues },
      },
      traceId,
      requestId
    ),
};

/**
 * Resource error responses
 */
export const ResourceErrorResponses = {
  notFound: (
    resourceType: string,
    resourceId: string | undefined,
    traceId: string,
    requestId: string
  ) =>
    errorResponse(
      {
        code: 'SEIZN_300',
        message: resourceId
          ? `${resourceType} not found: ${resourceId}`
          : `${resourceType} not found`,
        status: 404,
        details: { resource_type: resourceType, resource_id: resourceId },
      },
      traceId,
      requestId
    ),

  alreadyExists: (
    resourceType: string,
    identifier: string | undefined,
    traceId: string,
    requestId: string
  ) =>
    errorResponse(
      {
        code: 'SEIZN_350',
        message: identifier
          ? `${resourceType} already exists: ${identifier}`
          : `${resourceType} already exists`,
        status: 409,
        details: { resource_type: resourceType, identifier },
      },
      traceId,
      requestId
    ),
};

/**
 * Internal error responses
 */
export const InternalErrorResponses = {
  internal: (context: string | undefined, traceId: string, requestId: string) =>
    errorResponse(
      {
        code: 'SEIZN_500',
        message: 'An internal server error occurred',
        status: 500,
        details: context ? { context } : undefined,
      },
      traceId,
      requestId
    ),

  unexpected: (errorMessage: string | undefined, traceId: string, requestId: string) =>
    errorResponse(
      {
        code: 'SEIZN_501',
        message: 'An unexpected error occurred',
        status: 500,
        details: errorMessage ? { error_message: errorMessage } : undefined,
      },
      traceId,
      requestId
    ),

  serviceUnavailable: (service: string | undefined, traceId: string, requestId: string) =>
    errorResponse(
      {
        code: 'SEIZN_503',
        message: service
          ? `Service temporarily unavailable: ${service}`
          : 'Service temporarily unavailable',
        status: 503,
        details: service ? { service } : undefined,
      },
      traceId,
      requestId
    ),
};

// ============================================
// Request Context Helper
// ============================================

/**
 * Create request context with trace_id and request_id
 *
 * @example
 * ```ts
 * export async function GET(request: NextRequest) {
 *   const ctx = createRequestContext(request);
 *   // ctx.traceId, ctx.requestId available
 *   return successResponse(data, ctx.traceId, ctx.requestId);
 * }
 * ```
 */
export function createRequestContext(request?: Request | { headers?: Headers }): {
  traceId: string;
  requestId: string;
  startTime: number;
} {
  return {
    traceId: getOrCreateTraceId(request),
    requestId: getOrCreateRequestId(request),
    startTime: Date.now(),
  };
}

/**
 * Calculate latency from start time
 */
export function calculateLatency(startTime: number): number {
  return Date.now() - startTime;
}
