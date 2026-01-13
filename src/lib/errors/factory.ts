/**
 * Seizn Error Factory
 *
 * Factory functions for creating standardized API error responses.
 * All errors include trace_id, error_code, hint, and message.
 *
 * @module errors/factory
 */

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import {
  type SeizErrorCode,
  getHttpStatus,
  SEIZN_ERROR_CODES,
} from './codes';
import { getErrorHint, getDocsUrl } from './hints';
import type {
  CreateErrorOptions,
  SeizApiErrorResponse,
  SeizApiError,
} from './types';

// ============================================
// Trace ID Generation
// ============================================

/**
 * Generate a unique trace ID for request tracking
 * Format: szn_trc_xxxxxxxxxx (24 chars)
 */
export function generateTraceId(): string {
  const uuid = randomUUID().replace(/-/g, '');
  return `szn_trc_${uuid.substring(0, 16)}`;
}

/**
 * Extract trace ID from request headers or generate new one
 */
export function getOrCreateTraceId(
  request?: Request | { headers?: Headers }
): string {
  if (request?.headers) {
    const existingTraceId =
      request.headers.get('x-trace-id') ||
      request.headers.get('x-request-id');
    if (existingTraceId) {
      return existingTraceId;
    }
  }
  return generateTraceId();
}

// ============================================
// Error Response Factory
// ============================================

/**
 * Create a standardized API error response
 *
 * @example
 * ```ts
 * return createApiError({
 *   code: SEIZN_ERROR_CODES.MISSING_REQUIRED_FIELD,
 *   message: 'Missing required field: content',
 *   details: { field: 'content' },
 * });
 * ```
 */
export function createApiError(
  options: CreateErrorOptions
): NextResponse<SeizApiErrorResponse> {
  const traceId = options.traceId || generateTraceId();
  const status = options.status || getHttpStatus(options.code as SeizErrorCode);
  const hint = options.hint || getErrorHint(options.code);
  const docsUrl = getDocsUrl(options.code);
  const timestamp = new Date().toISOString();

  const errorResponse: SeizApiErrorResponse = {
    success: false,
    error: {
      error_code: options.code,
      trace_id: traceId,
      hint,
      message: options.message,
      timestamp,
      status,
      ...(options.details && { details: options.details }),
      docs_url: docsUrl,
    },
  };

  const response = NextResponse.json(errorResponse, { status });

  // Set standard headers
  response.headers.set('X-Trace-ID', traceId);
  response.headers.set('X-Error-Code', options.code);

  // Set custom headers if provided
  if (options.headers) {
    Object.entries(options.headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }

  return response;
}

/**
 * Create error response from a SeizApiError instance
 */
export function createApiErrorFromException(
  error: SeizApiError | Error,
  traceId?: string
): NextResponse<SeizApiErrorResponse> {
  if ('code' in error && 'toJSON' in error) {
    // It's a SeizApiError
    const seizError = error as SeizApiError;
    const errorJson = seizError.toJSON();

    return createApiError({
      code: seizError.code,
      message: seizError.message,
      status: seizError.status,
      hint: seizError.hint,
      details: seizError.details,
      traceId: traceId || seizError.traceId,
    });
  }

  // Generic Error - convert to internal error
  return createApiError({
    code: SEIZN_ERROR_CODES.UNEXPECTED_ERROR,
    message: 'An unexpected error occurred',
    status: 500,
    details: {
      error_name: error.name,
      error_message: error.message,
    },
    traceId,
  });
}

// ============================================
// Pre-built Error Helpers
// ============================================

/**
 * Authentication error helpers
 */
export const AuthErrors = {
  missingApiKey: (traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.MISSING_API_KEY,
      message: 'API key required. Include x-api-key header in your request.',
      traceId,
    }),

  invalidApiKey: (traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.INVALID_API_KEY,
      message: 'Invalid or inactive API key.',
      traceId,
    }),

  expiredApiKey: (traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.EXPIRED_API_KEY,
      message: 'API key has expired. Generate a new key from your dashboard.',
      traceId,
    }),

  insufficientScope: (requiredScope: string, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.INSUFFICIENT_SCOPE,
      message: `API key lacks required scope: ${requiredScope}`,
      details: { required_scope: requiredScope },
      traceId,
    }),

  accessDenied: (resource?: string, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.ACCESS_DENIED,
      message: resource
        ? `Access denied to ${resource}.`
        : 'Access denied to this resource.',
      details: resource ? { resource } : undefined,
      traceId,
    }),
};

/**
 * Rate limit error helpers
 */
export const RateLimitErrors = {
  exceeded: (
    options: {
      limit: number;
      remaining: number;
      resetAt: Date;
      retryAfterSeconds: number;
    },
    traceId?: string
  ) =>
    createApiError({
      code: SEIZN_ERROR_CODES.RATE_LIMIT_EXCEEDED,
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
      traceId,
    }),

  dailyQuotaExceeded: (plan: string, usage: number, limit: number, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.DAILY_QUOTA_EXCEEDED,
      message: `Daily API call limit exceeded for ${plan} plan.`,
      details: {
        plan,
        quota_type: 'daily',
        current_usage: usage,
        limit,
        reset_at: getNextMidnightUTC().toISOString(),
      },
      traceId,
    }),

  monthlyQuotaExceeded: (plan: string, usage: number, limit: number, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.MONTHLY_QUOTA_EXCEEDED,
      message: `Monthly API call limit exceeded for ${plan} plan.`,
      details: {
        plan,
        quota_type: 'monthly',
        current_usage: usage,
        limit,
        reset_at: getFirstOfNextMonth().toISOString(),
      },
      traceId,
    }),

  tokenBudgetExceeded: (used: number, limit: number, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.TOKEN_BUDGET_EXCEEDED,
      message: 'Token budget exhausted.',
      details: {
        tokens_used: used,
        token_limit: limit,
      },
      traceId,
    }),
};

/**
 * Validation error helpers
 */
export const ValidationErrors = {
  missingField: (field: string, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.MISSING_REQUIRED_FIELD,
      message: `Missing required field: ${field}`,
      details: { field },
      traceId,
    }),

  invalidFieldType: (field: string, expected: string, received: string, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.INVALID_FIELD_TYPE,
      message: `Invalid type for field "${field}": expected ${expected}, got ${received}`,
      details: { field, expected, received },
      traceId,
    }),

  fieldOutOfRange: (
    field: string,
    value: number,
    min?: number,
    max?: number,
    traceId?: string
  ) =>
    createApiError({
      code: SEIZN_ERROR_CODES.FIELD_OUT_OF_RANGE,
      message: `Field "${field}" value ${value} is out of range${min !== undefined ? ` (min: ${min}` : ''}${max !== undefined ? `, max: ${max})` : ')'}`,
      details: { field, value, min, max },
      traceId,
    }),

  fieldTooLong: (field: string, maxLength: number, actualLength: number, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.FIELD_TOO_LONG,
      message: `Field "${field}" exceeds maximum length of ${maxLength} characters`,
      details: { field, max_length: maxLength, actual_length: actualLength },
      traceId,
    }),

  invalidFormat: (field: string, expectedFormat: string, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.INVALID_FORMAT,
      message: `Invalid format for field "${field}": expected ${expectedFormat}`,
      details: { field, expected_format: expectedFormat },
      traceId,
    }),

  invalidJson: (parseError?: string, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.INVALID_JSON,
      message: 'Request body is not valid JSON',
      details: parseError ? { parse_error: parseError } : undefined,
      traceId,
    }),

  invalidEnumValue: (field: string, value: string, allowedValues: string[], traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.INVALID_ENUM_VALUE,
      message: `Invalid value "${value}" for field "${field}"`,
      details: { field, value, allowed_values: allowedValues },
      traceId,
    }),

  payloadTooLarge: (maxSizeBytes: number, actualSizeBytes: number, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.PAYLOAD_TOO_LARGE,
      message: `Request payload exceeds maximum size of ${formatBytes(maxSizeBytes)}`,
      details: {
        max_size_bytes: maxSizeBytes,
        actual_size_bytes: actualSizeBytes,
      },
      traceId,
    }),
};

/**
 * Resource error helpers
 */
export const ResourceErrors = {
  notFound: (resourceType: string, resourceId?: string, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.NOT_FOUND,
      message: resourceId
        ? `${resourceType} not found: ${resourceId}`
        : `${resourceType} not found`,
      details: { resource_type: resourceType, resource_id: resourceId },
      traceId,
    }),

  memoryNotFound: (memoryId?: string, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.MEMORY_NOT_FOUND,
      message: memoryId ? `Memory not found: ${memoryId}` : 'Memory not found',
      details: memoryId ? { memory_id: memoryId } : undefined,
      traceId,
    }),

  collectionNotFound: (collectionId?: string, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.COLLECTION_NOT_FOUND,
      message: collectionId
        ? `Collection not found: ${collectionId}`
        : 'Collection not found',
      details: collectionId ? { collection_id: collectionId } : undefined,
      traceId,
    }),

  documentNotFound: (documentId?: string, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.DOCUMENT_NOT_FOUND,
      message: documentId
        ? `Document not found: ${documentId}`
        : 'Document not found',
      details: documentId ? { document_id: documentId } : undefined,
      traceId,
    }),

  alreadyExists: (resourceType: string, identifier?: string, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.ALREADY_EXISTS,
      message: identifier
        ? `${resourceType} already exists: ${identifier}`
        : `${resourceType} already exists`,
      details: { resource_type: resourceType, identifier },
      traceId,
    }),

  stateConflict: (message: string, currentState?: string, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.STATE_CONFLICT,
      message,
      details: currentState ? { current_state: currentState } : undefined,
      traceId,
    }),
};

/**
 * External service error helpers
 */
export const ExternalErrors = {
  aiProviderError: (provider: string, originalError?: string, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.AI_PROVIDER_ERROR,
      message: `AI provider error: ${provider}`,
      details: {
        provider,
        ...(originalError && { original_error: originalError }),
      },
      traceId,
    }),

  embeddingFailed: (reason?: string, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.EMBEDDING_FAILED,
      message: 'Failed to generate embedding',
      details: reason ? { reason } : undefined,
      traceId,
    }),

  llmCompletionFailed: (model: string, reason?: string, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.LLM_COMPLETION_FAILED,
      message: `LLM completion failed for model: ${model}`,
      details: { model, ...(reason && { reason }) },
      traceId,
    }),

  databaseError: (operation: string, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.DATABASE_ERROR,
      message: `Database operation failed: ${operation}`,
      details: { operation },
      traceId,
    }),

  externalTimeout: (service: string, timeoutMs: number, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.EXTERNAL_TIMEOUT,
      message: `External service timeout: ${service}`,
      details: { service, timeout_ms: timeoutMs },
      traceId,
    }),

  federatedSourceError: (sourceId: string, error?: string, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.FEDERATED_SOURCE_ERROR,
      message: `Federated source error: ${sourceId}`,
      details: { source_id: sourceId, ...(error && { error }) },
      traceId,
    }),
};

/**
 * Internal server error helpers
 */
export const InternalErrors = {
  internal: (context?: string, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.INTERNAL_ERROR,
      message: 'An internal server error occurred',
      details: context ? { context } : undefined,
      traceId,
    }),

  unexpected: (errorMessage?: string, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.UNEXPECTED_ERROR,
      message: 'An unexpected error occurred',
      details: errorMessage ? { error_message: errorMessage } : undefined,
      traceId,
    }),

  serviceUnavailable: (service?: string, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.SERVICE_UNAVAILABLE,
      message: service
        ? `Service temporarily unavailable: ${service}`
        : 'Service temporarily unavailable',
      status: 503,
      details: service ? { service } : undefined,
      traceId,
    }),

  notImplemented: (feature: string, traceId?: string) =>
    createApiError({
      code: SEIZN_ERROR_CODES.NOT_IMPLEMENTED,
      message: `Feature not implemented: ${feature}`,
      status: 501,
      details: { feature },
      traceId,
    }),
};

// ============================================
// Utility Functions
// ============================================

function getNextMidnightUTC(): Date {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow;
}

function getFirstOfNextMonth(): Date {
  const nextMonth = new Date();
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  nextMonth.setUTCDate(1);
  nextMonth.setUTCHours(0, 0, 0, 0);
  return nextMonth;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
