/**
 * Seizn Error Middleware V2
 *
 * Enhanced error handling utilities with request_id support.
 * All responses include trace_id and request_id at the top level.
 *
 * @module errors/middleware-v2
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { SEIZN_ERROR_CODES, getHttpStatus, type SeizErrorCode } from './codes';
import { getErrorHint, getDocsUrl } from './hints';

// ============================================
// Request ID Generation
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
// Request Context
// ============================================

/**
 * Request context with trace_id and request_id for tracking
 */
export interface RequestContext {
  traceId: string;
  requestId: string;
  startTime: number;
}

/**
 * Create request context with trace_id and request_id
 *
 * @example
 * ```ts
 * export async function GET(request: NextRequest) {
 *   const ctx = createRequestContext(request);
 *   // ctx.traceId, ctx.requestId, ctx.startTime available
 *   return successResponse(data, ctx);
 * }
 * ```
 */
export function createRequestContext(request?: Request | { headers?: Headers }): RequestContext {
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

// ============================================
// Types
// ============================================

/**
 * Type for API route handlers
 */
export type ApiRouteHandler = (
  request: NextRequest,
  context?: { params?: Record<string, string> }
) => Promise<NextResponse | Response>;

/**
 * Type for API route handlers with request context
 */
export type ApiRouteHandlerWithContext = (
  request: NextRequest,
  ctx: RequestContext,
  routeContext?: { params?: Record<string, string> }
) => Promise<NextResponse | Response>;

/**
 * Standardized success response format with trace_id and request_id at top level
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
 * Standardized error response format with trace_id and request_id at top level
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
  code: string;
  message: string;
  hint?: string;
  status?: number;
  details?: Record<string, unknown>;
  headers?: Record<string, string>;
}

// ============================================
// Handler Wrapper
// ============================================

/**
 * Wrap an API route handler with request context and error handling
 *
 * This wrapper provides trace_id and request_id in every response.
 *
 * @example
 * ```ts
 * export const GET = withRequestContext(async (request, ctx) => {
 *   const data = await fetchData();
 *   return successResponse(data, ctx);
 * });
 * ```
 */
export function withRequestContext(handler: ApiRouteHandlerWithContext): ApiRouteHandler {
  return async (request: NextRequest, routeContext?: { params?: Record<string, string> }) => {
    const ctx = createRequestContext(request);

    try {
      // Execute the handler with context
      const response = await handler(request, ctx, routeContext);

      // Add trace headers to successful responses
      if (response instanceof NextResponse) {
        response.headers.set('X-Trace-ID', ctx.traceId);
        response.headers.set('X-Request-ID', ctx.requestId);
      }

      return response;
    } catch (error) {
      // Log error with trace and request ID
      console.error(`[${ctx.traceId}][${ctx.requestId}] API Error:`, error);

      // Handle JSON parse errors
      if (error instanceof SyntaxError && error.message.includes('JSON')) {
        return errorResponse(
          {
            code: SEIZN_ERROR_CODES.INVALID_JSON,
            message: 'Request body is not valid JSON',
            details: { parse_error: error.message },
          },
          ctx
        );
      }

      // Handle custom SeizApiError
      if (error && typeof error === 'object' && 'code' in error) {
        const seizError = error as { code: string; message: string; status?: number; details?: Record<string, unknown> };
        return errorResponse(
          {
            code: seizError.code,
            message: seizError.message,
            status: seizError.status,
            details: seizError.details,
          },
          ctx
        );
      }

      // Handle generic errors
      if (error instanceof Error) {
        return errorResponse(
          {
            code: SEIZN_ERROR_CODES.UNEXPECTED_ERROR,
            message: 'An unexpected error occurred',
            status: 500,
            details: { error_message: error.message },
          },
          ctx
        );
      }

      // Fallback for unknown error types
      return errorResponse(
        {
          code: SEIZN_ERROR_CODES.INTERNAL_ERROR,
          message: 'An internal server error occurred',
          status: 500,
        },
        ctx
      );
    }
  };
}

// ============================================
// Response Helpers
// ============================================

/**
 * Create a standardized success response with trace_id and request_id at top level
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
 */
export function successResponse<T>(
  data: T,
  ctx: RequestContext,
  metaOrStatus?: Record<string, unknown> | number
): NextResponse<ApiSuccessResponse<T>> {
  const latencyMs = calculateLatency(ctx.startTime);

  // Handle status code as third argument for backward compatibility
  const status = typeof metaOrStatus === 'number' ? metaOrStatus : 200;
  const meta = typeof metaOrStatus === 'object' ? metaOrStatus : undefined;

  const response = NextResponse.json<ApiSuccessResponse<T>>(
    {
      success: true,
      data,
      trace_id: ctx.traceId,
      request_id: ctx.requestId,
      meta: {
        timestamp: new Date().toISOString(),
        latency_ms: latencyMs,
        ...meta,
      },
    },
    { status }
  );

  // Set trace headers
  response.headers.set('X-Trace-ID', ctx.traceId);
  response.headers.set('X-Request-ID', ctx.requestId);

  return response;
}

/**
 * Create a standardized error response with trace_id and request_id at top level
 *
 * Response format:
 * ```json
 * {
 *   "success": false,
 *   "error": {
 *     "code": "SEIZN_100",
 *     "message": "API key required",
 *     "hint": "Add Authorization: Bearer <api-key> header",
 *     "docs_url": "https://www.seizn.com/docs/api/authentication"
 *   },
 *   "trace_id": "szn_trc_xxxxxxxxxx",
 *   "request_id": "req_xxxxxxxxxx"
 * }
 * ```
 */
export function errorResponse(
  options: ErrorOptions,
  ctx: RequestContext
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
      trace_id: ctx.traceId,
      request_id: ctx.requestId,
    },
    { status }
  );

  // Set trace headers
  response.headers.set('X-Trace-ID', ctx.traceId);
  response.headers.set('X-Request-ID', ctx.requestId);
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
// Middleware Utilities
// ============================================

/**
 * Parse request body with error handling
 *
 * @example
 * ```ts
 * const body = await parseJsonBody<CreateMemoryRequest>(request, ctx);
 * if ('error' in body) return body.error;
 * // body.data is now typed as CreateMemoryRequest
 * ```
 */
export async function parseJsonBody<T>(
  request: NextRequest,
  ctx: RequestContext
): Promise<{ data: T } | { error: NextResponse<ApiErrorResponse> }> {
  try {
    const contentType = request.headers.get('content-type');

    if (!contentType?.includes('application/json')) {
      return {
        error: errorResponse(
          {
            code: SEIZN_ERROR_CODES.INVALID_CONTENT_TYPE,
            message: 'Content-Type must be application/json',
            details: { received_content_type: contentType },
          },
          ctx
        ),
      };
    }

    const text = await request.text();

    if (!text || text.trim() === '') {
      return {
        error: errorResponse(
          {
            code: SEIZN_ERROR_CODES.INVALID_JSON,
            message: 'Request body is empty',
          },
          ctx
        ),
      };
    }

    const data = JSON.parse(text) as T;
    return { data };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        error: errorResponse(
          {
            code: SEIZN_ERROR_CODES.INVALID_JSON,
            message: 'Request body is not valid JSON',
            details: { parse_error: error.message },
          },
          ctx
        ),
      };
    }

    return {
      error: errorResponse(
        {
          code: SEIZN_ERROR_CODES.UNEXPECTED_ERROR,
          message: 'Failed to parse request body',
          status: 500,
        },
        ctx
      ),
    };
  }
}

/**
 * Validate required fields in request body
 *
 * @example
 * ```ts
 * const validation = validateRequiredFields(body, ['content', 'memory_type'], ctx);
 * if (validation.error) return validation.error;
 * ```
 */
export function validateRequiredFields(
  body: Record<string, unknown>,
  requiredFields: string[],
  ctx: RequestContext
): { valid: true } | { valid: false; error: NextResponse<ApiErrorResponse> } {
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    const value = body[field];

    if (value === undefined || value === null) {
      missingFields.push(field);
    } else if (typeof value === 'string' && value.trim() === '') {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    return {
      valid: false,
      error: errorResponse(
        {
          code: SEIZN_ERROR_CODES.MISSING_REQUIRED_FIELD,
          message:
            missingFields.length === 1
              ? `Missing required field: ${missingFields[0]}`
              : `Missing required fields: ${missingFields.join(', ')}`,
          details: { missing_fields: missingFields },
        },
        ctx
      ),
    };
  }

  return { valid: true };
}

/**
 * Validate field type
 */
export function validateFieldType(
  value: unknown,
  field: string,
  expectedType: 'string' | 'number' | 'boolean' | 'array' | 'object',
  ctx: RequestContext
): { valid: true } | { valid: false; error: NextResponse<ApiErrorResponse> } {
  let isValid = false;

  switch (expectedType) {
    case 'string':
      isValid = typeof value === 'string';
      break;
    case 'number':
      isValid = typeof value === 'number' && !isNaN(value);
      break;
    case 'boolean':
      isValid = typeof value === 'boolean';
      break;
    case 'array':
      isValid = Array.isArray(value);
      break;
    case 'object':
      isValid = typeof value === 'object' && value !== null && !Array.isArray(value);
      break;
  }

  if (!isValid) {
    return {
      valid: false,
      error: errorResponse(
        {
          code: SEIZN_ERROR_CODES.INVALID_FIELD_TYPE,
          message: `Invalid type for field "${field}": expected ${expectedType}, got ${Array.isArray(value) ? 'array' : typeof value}`,
          details: { field, expected: expectedType, received: Array.isArray(value) ? 'array' : typeof value },
        },
        ctx
      ),
    };
  }

  return { valid: true };
}

/**
 * Error boundary for catching and formatting errors
 *
 * @example
 * ```ts
 * const result = await errorBoundary(
 *   async () => {
 *     const data = await riskyOperation();
 *     return successResponse(data, ctx);
 *   },
 *   ctx
 * );
 * ```
 */
export async function errorBoundary<T>(
  operation: () => Promise<T>,
  ctx: RequestContext
): Promise<T | NextResponse<ApiErrorResponse>> {
  try {
    return await operation();
  } catch (error) {
    console.error(`[${ctx.traceId}][${ctx.requestId}] Error in errorBoundary:`, error);

    if (error instanceof Error) {
      return errorResponse(
        {
          code: SEIZN_ERROR_CODES.UNEXPECTED_ERROR,
          message: 'An unexpected error occurred',
          status: 500,
          details: { error_message: error.message },
        },
        ctx
      );
    }

    return errorResponse(
      {
        code: SEIZN_ERROR_CODES.INTERNAL_ERROR,
        message: 'An internal server error occurred',
        status: 500,
      },
      ctx
    );
  }
}

// ============================================
// Pre-built Error Response Helpers
// ============================================

/**
 * Authentication error responses
 */
export const AuthErrors = {
  missingApiKey: (ctx: RequestContext) =>
    errorResponse(
      {
        code: 'SEIZN_100',
        message: 'API key required. Include Authorization: Bearer header in your request.',
      },
      ctx
    ),

  invalidApiKey: (ctx: RequestContext) =>
    errorResponse(
      {
        code: 'SEIZN_101',
        message: 'Invalid or inactive API key.',
      },
      ctx
    ),

  expiredApiKey: (ctx: RequestContext) =>
    errorResponse(
      {
        code: 'SEIZN_102',
        message: 'API key has expired. Generate a new key from your dashboard.',
      },
      ctx
    ),

  insufficientScope: (requiredScope: string, ctx: RequestContext) =>
    errorResponse(
      {
        code: 'SEIZN_103',
        message: `API key lacks required scope: ${requiredScope}`,
        details: { required_scope: requiredScope },
      },
      ctx
    ),

  accessDenied: (resource: string | undefined, ctx: RequestContext) =>
    errorResponse(
      {
        code: 'SEIZN_105',
        message: resource
          ? `Access denied to ${resource}.`
          : 'Access denied to this resource.',
        details: resource ? { resource } : undefined,
      },
      ctx
    ),
};

/**
 * Rate limit error responses
 */
export const RateLimitErrors = {
  exceeded: (
    options: {
      limit: number;
      remaining: number;
      resetAt: Date;
      retryAfterSeconds: number;
    },
    ctx: RequestContext
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
      ctx
    ),

  dailyQuotaExceeded: (
    plan: string,
    usage: number,
    limit: number,
    ctx: RequestContext
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
      ctx
    ),

  monthlyQuotaExceeded: (
    plan: string,
    usage: number,
    limit: number,
    ctx: RequestContext
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
      ctx
    ),

  tokenBudgetExceeded: (used: number, limit: number, ctx: RequestContext) =>
    errorResponse(
      {
        code: 'SEIZN_113',
        message: 'Token budget exhausted.',
        details: {
          tokens_used: used,
          token_limit: limit,
        },
      },
      ctx
    ),
};

/**
 * Validation error responses
 */
export const ValidationErrors = {
  missingField: (field: string, ctx: RequestContext) =>
    errorResponse(
      {
        code: 'SEIZN_200',
        message: `Missing required field: ${field}`,
        details: { field },
      },
      ctx
    ),

  invalidFieldType: (
    field: string,
    expected: string,
    received: string,
    ctx: RequestContext
  ) =>
    errorResponse(
      {
        code: 'SEIZN_201',
        message: `Invalid type for field "${field}": expected ${expected}, got ${received}`,
        details: { field, expected, received },
      },
      ctx
    ),

  invalidJson: (parseError: string | undefined, ctx: RequestContext) =>
    errorResponse(
      {
        code: 'SEIZN_206',
        message: 'Request body is not valid JSON',
        details: parseError ? { parse_error: parseError } : undefined,
      },
      ctx
    ),

  invalidEnumValue: (
    field: string,
    value: string,
    allowedValues: string[],
    ctx: RequestContext
  ) =>
    errorResponse(
      {
        code: 'SEIZN_209',
        message: `Invalid value "${value}" for field "${field}"`,
        details: { field, value, allowed_values: allowedValues },
      },
      ctx
    ),
};

/**
 * Resource error responses
 */
export const ResourceErrors = {
  notFound: (
    resourceType: string,
    resourceId: string | undefined,
    ctx: RequestContext
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
      ctx
    ),

  alreadyExists: (
    resourceType: string,
    identifier: string | undefined,
    ctx: RequestContext
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
      ctx
    ),
};

/**
 * Internal error responses
 */
export const InternalErrors = {
  internal: (context: string | undefined, ctx: RequestContext) =>
    errorResponse(
      {
        code: 'SEIZN_500',
        message: 'An internal server error occurred',
        status: 500,
        details: context ? { context } : undefined,
      },
      ctx
    ),

  unexpected: (errorMessage: string | undefined, ctx: RequestContext) =>
    errorResponse(
      {
        code: 'SEIZN_501',
        message: 'An unexpected error occurred',
        status: 500,
        details: errorMessage ? { error_message: errorMessage } : undefined,
      },
      ctx
    ),

  serviceUnavailable: (service: string | undefined, ctx: RequestContext) =>
    errorResponse(
      {
        code: 'SEIZN_503',
        message: service
          ? `Service temporarily unavailable: ${service}`
          : 'Service temporarily unavailable',
        status: 503,
        details: service ? { service } : undefined,
      },
      ctx
    ),
};
