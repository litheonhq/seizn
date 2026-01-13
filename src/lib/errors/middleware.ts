/**
 * Seizn Error Middleware
 *
 * Error handling utilities for API routes and middleware.
 * Provides consistent error wrapping and logging.
 *
 * @module errors/middleware
 */

import { NextRequest, NextResponse } from 'next/server';
import type { SeizApiErrorResponse } from './types';
import {
  createApiError,
  createApiErrorFromException,
  generateTraceId,
  getOrCreateTraceId,
  InternalErrors,
  ValidationErrors,
} from './factory';
import { SEIZN_ERROR_CODES } from './codes';

/**
 * Type for API route handlers
 */
export type ApiRouteHandler = (
  request: NextRequest,
  context?: { params?: Record<string, string> }
) => Promise<NextResponse | Response>;

/**
 * Wrap an API route handler with error handling
 *
 * @example
 * ```ts
 * export const GET = withErrorHandler(async (request) => {
 *   // Your handler logic here
 *   return NextResponse.json({ success: true, data: result });
 * });
 * ```
 */
export function withErrorHandler(handler: ApiRouteHandler): ApiRouteHandler {
  return async (request: NextRequest, context?: { params?: Record<string, string> }) => {
    const traceId = getOrCreateTraceId(request);

    try {
      // Execute the handler
      const response = await handler(request, context);

      // Add trace ID to successful responses
      if (response instanceof NextResponse) {
        response.headers.set('X-Trace-ID', traceId);
      }

      return response;
    } catch (error) {
      // Log error with trace ID
      console.error(`[${traceId}] API Error:`, error);

      // Handle JSON parse errors
      if (error instanceof SyntaxError && error.message.includes('JSON')) {
        return ValidationErrors.invalidJson(error.message, traceId);
      }

      // Handle custom SeizApiError
      if (error && typeof error === 'object' && 'code' in error) {
        return createApiErrorFromException(error as Error, traceId);
      }

      // Handle generic errors
      if (error instanceof Error) {
        return InternalErrors.unexpected(error.message, traceId);
      }

      // Fallback for unknown error types
      return InternalErrors.internal('unknown_error', traceId);
    }
  };
}

/**
 * Parse request body with error handling
 *
 * @example
 * ```ts
 * const body = await parseJsonBody<CreateMemoryRequest>(request, traceId);
 * if ('error' in body) return body.error;
 * // body.data is now typed as CreateMemoryRequest
 * ```
 */
export async function parseJsonBody<T>(
  request: NextRequest,
  traceId?: string
): Promise<{ data: T } | { error: NextResponse<SeizApiErrorResponse> }> {
  const tid = traceId || generateTraceId();

  try {
    const contentType = request.headers.get('content-type');

    if (!contentType?.includes('application/json')) {
      return {
        error: createApiError({
          code: SEIZN_ERROR_CODES.INVALID_CONTENT_TYPE,
          message: 'Content-Type must be application/json',
          details: { received_content_type: contentType },
          traceId: tid,
        }),
      };
    }

    const text = await request.text();

    if (!text || text.trim() === '') {
      return {
        error: createApiError({
          code: SEIZN_ERROR_CODES.INVALID_JSON,
          message: 'Request body is empty',
          traceId: tid,
        }),
      };
    }

    const data = JSON.parse(text) as T;
    return { data };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        error: ValidationErrors.invalidJson(error.message, tid),
      };
    }

    return {
      error: InternalErrors.unexpected('Failed to parse request body', tid),
    };
  }
}

/**
 * Validate required fields in request body
 *
 * @example
 * ```ts
 * const validation = validateRequiredFields(body, ['content', 'memory_type'], traceId);
 * if (validation.error) return validation.error;
 * ```
 */
export function validateRequiredFields(
  body: Record<string, unknown>,
  requiredFields: string[],
  traceId?: string
): { valid: true } | { valid: false; error: NextResponse<SeizApiErrorResponse> } {
  const tid = traceId || generateTraceId();
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
      error: createApiError({
        code: SEIZN_ERROR_CODES.MISSING_REQUIRED_FIELD,
        message:
          missingFields.length === 1
            ? `Missing required field: ${missingFields[0]}`
            : `Missing required fields: ${missingFields.join(', ')}`,
        details: { missing_fields: missingFields },
        traceId: tid,
      }),
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
  traceId?: string
): { valid: true } | { valid: false; error: NextResponse<SeizApiErrorResponse> } {
  const tid = traceId || generateTraceId();
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
      error: ValidationErrors.invalidFieldType(
        field,
        expectedType,
        Array.isArray(value) ? 'array' : typeof value,
        tid
      ),
    };
  }

  return { valid: true };
}

/**
 * Create a success response with standard format
 *
 * @example
 * ```ts
 * return createSuccessResponse({ memories: results }, { count: results.length }, traceId);
 * ```
 */
export function createSuccessResponse<T>(
  data: T,
  meta?: Record<string, unknown>,
  traceId?: string,
  latencyMs?: number
): NextResponse {
  const tid = traceId || generateTraceId();

  const response = NextResponse.json({
    success: true,
    data,
    meta: {
      trace_id: tid,
      timestamp: new Date().toISOString(),
      ...(latencyMs !== undefined && { latency_ms: latencyMs }),
      ...meta,
    },
  });

  response.headers.set('X-Trace-ID', tid);

  return response;
}

/**
 * Error boundary for catching and formatting errors
 *
 * @example
 * ```ts
 * const result = await errorBoundary(
 *   async () => {
 *     const data = await riskyOperation();
 *     return NextResponse.json({ success: true, data });
 *   },
 *   traceId
 * );
 * ```
 */
export async function errorBoundary<T>(
  operation: () => Promise<T>,
  traceId?: string
): Promise<T | NextResponse<SeizApiErrorResponse>> {
  const tid = traceId || generateTraceId();

  try {
    return await operation();
  } catch (error) {
    console.error(`[${tid}] Error in errorBoundary:`, error);

    if (error instanceof Error) {
      return InternalErrors.unexpected(error.message, tid);
    }

    return InternalErrors.internal('error_boundary', tid);
  }
}
