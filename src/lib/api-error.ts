/**
 * Seizn API Error Handling
 *
 * Standardized error response format for all API endpoints.
 * Error codes are machine-readable, messages are human-readable.
 */

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

// ============================================
// Error Codes
// ============================================

export const ErrorCodes = {
  // Authentication (1xxx)
  AUTH_MISSING_KEY: 'AUTH_MISSING_KEY',
  AUTH_INVALID_KEY: 'AUTH_INVALID_KEY',
  AUTH_EXPIRED_KEY: 'AUTH_EXPIRED_KEY',
  AUTH_UNAUTHORIZED: 'AUTH_UNAUTHORIZED',

  // Rate Limiting (2xxx)
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  DAILY_LIMIT_EXCEEDED: 'DAILY_LIMIT_EXCEEDED',
  MONTHLY_LIMIT_EXCEEDED: 'MONTHLY_LIMIT_EXCEEDED',

  // Validation (3xxx)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_FIELD_VALUE: 'INVALID_FIELD_VALUE',
  INVALID_REQUEST_BODY: 'INVALID_REQUEST_BODY',

  // Resource (4xxx)
  NOT_FOUND: 'NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  MEMORY_NOT_FOUND: 'MEMORY_NOT_FOUND',
  COLLECTION_NOT_FOUND: 'COLLECTION_NOT_FOUND',
  DOCUMENT_NOT_FOUND: 'DOCUMENT_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',

  // Conflict (5xxx)
  RESOURCE_ALREADY_EXISTS: 'RESOURCE_ALREADY_EXISTS',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',

  // Memory v4 specific (6xxx)
  CANDIDATE_NOT_FOUND: 'CANDIDATE_NOT_FOUND',
  CANDIDATE_ALREADY_PROCESSED: 'CANDIDATE_ALREADY_PROCESSED',
  EDGE_NOT_FOUND: 'EDGE_NOT_FOUND',
  EDGE_ALREADY_EXISTS: 'EDGE_ALREADY_EXISTS',
  MEMORY_OWNERSHIP_REQUIRED: 'MEMORY_OWNERSHIP_REQUIRED',
  CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
  INVALID_EDGE_TYPE: 'INVALID_EDGE_TYPE',
  INVALID_MEMORY_SCOPE: 'INVALID_MEMORY_SCOPE',

  // Server (9xxx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EMBEDDING_ERROR: 'EMBEDDING_ERROR',
  AI_MODEL_ERROR: 'AI_MODEL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ============================================
// Error Response Structure
// ============================================

export interface ApiErrorResponse {
  error: {
    error_code: ErrorCode;
    message: string;
    trace_id: string;
    hint: string;
    details?: Record<string, unknown>;
    docs_url?: string;
  };
}

// ============================================
// Hints Map (Human-readable resolution guidance)
// ============================================

const Hints: Record<ErrorCode, string> = {
  // Auth
  [ErrorCodes.AUTH_MISSING_KEY]: 'Add Authorization: Bearer <api-key> header to your request',
  [ErrorCodes.AUTH_INVALID_KEY]: 'Check API key in Dashboard → API Keys',
  [ErrorCodes.AUTH_EXPIRED_KEY]: 'Generate new API key in Dashboard',
  [ErrorCodes.AUTH_UNAUTHORIZED]: 'Verify resource ownership or permissions',

  // Rate limits
  [ErrorCodes.RATE_LIMIT_EXCEEDED]: 'Implement exponential backoff (1s→2s→4s)',
  [ErrorCodes.QUOTA_EXCEEDED]: 'Upgrade plan or wait for quota reset',
  [ErrorCodes.DAILY_LIMIT_EXCEEDED]: 'Wait until tomorrow or upgrade plan',
  [ErrorCodes.MONTHLY_LIMIT_EXCEEDED]: 'Upgrade plan for higher limits',

  // Validation
  [ErrorCodes.VALIDATION_ERROR]: 'Check request body against API docs',
  [ErrorCodes.VALIDATION_FAILED]: 'Check request parameters and constraints',
  [ErrorCodes.MISSING_REQUIRED_FIELD]: 'Add missing field to request body',
  [ErrorCodes.INVALID_FIELD_VALUE]: 'Check field type and constraints in docs',
  [ErrorCodes.INVALID_REQUEST_BODY]: 'Ensure JSON is valid and properly formatted',

  // Resource
  [ErrorCodes.NOT_FOUND]: 'Verify resource ID exists and is accessible',
  [ErrorCodes.RESOURCE_NOT_FOUND]: 'Verify resource ID exists and is accessible',
  [ErrorCodes.MEMORY_NOT_FOUND]: 'Check memory ID or use GET /api/memories to search',
  [ErrorCodes.COLLECTION_NOT_FOUND]: 'Verify collection exists in your namespace',
  [ErrorCodes.DOCUMENT_NOT_FOUND]: 'Check document ID in the collection',
  [ErrorCodes.USER_NOT_FOUND]: 'Verify user credentials or registration',

  // Conflict
  [ErrorCodes.RESOURCE_ALREADY_EXISTS]: 'Use different identifier or update existing',
  [ErrorCodes.DUPLICATE_ENTRY]: 'Check for existing entry before creating',

  // Memory v4 specific
  [ErrorCodes.CANDIDATE_NOT_FOUND]: 'Check candidate ID or list pending candidates',
  [ErrorCodes.CANDIDATE_ALREADY_PROCESSED]: 'Candidate has already been accepted or rejected',
  [ErrorCodes.EDGE_NOT_FOUND]: 'Check edge ID or list edges for a memory',
  [ErrorCodes.EDGE_ALREADY_EXISTS]: 'Edge between these memories already exists',
  [ErrorCodes.MEMORY_OWNERSHIP_REQUIRED]: 'You can only create edges between your own memories',
  [ErrorCodes.CONFIRMATION_REQUIRED]: 'Set confirm: true to execute this operation',
  [ErrorCodes.INVALID_EDGE_TYPE]: 'Use valid edge type: relates_to, supports, contradicts, etc.',
  [ErrorCodes.INVALID_MEMORY_SCOPE]: 'Use valid scope: user, workspace, org, session, agent',

  // Server
  [ErrorCodes.INTERNAL_ERROR]: 'Retry request; contact support if persists',
  [ErrorCodes.SERVICE_UNAVAILABLE]: 'Check status.seizn.com; retry in 1 minute',
  [ErrorCodes.DATABASE_ERROR]: 'Retry request; check input data format',
  [ErrorCodes.EMBEDDING_ERROR]: 'Retry request; check content length (<8K chars)',
  [ErrorCodes.AI_MODEL_ERROR]: 'Retry request; try simpler model if available',
};

// ============================================
// Error Factory
// ============================================

interface CreateErrorOptions {
  code: ErrorCode;
  message: string;
  status: number;
  details?: Record<string, unknown>;
  headers?: Record<string, string>;
}

function generateTraceId(): string {
  return `trc_${randomUUID().replace(/-/g, '').substring(0, 24)}`;
}

function getDocsUrl(code: ErrorCode): string {
  const baseUrl = 'https://www.seizn.com/docs';

  // Map error codes to relevant documentation sections
  if (code.startsWith('AUTH_')) return `${baseUrl}#authentication`;
  if (code.startsWith('RATE_') || code.startsWith('QUOTA_') || code.includes('LIMIT'))
    return `${baseUrl}#rate-limits`;
  if (code.startsWith('VALIDATION_') || code.startsWith('MISSING_') || code.startsWith('INVALID_'))
    return `${baseUrl}#errors`;
  if (code.includes('NOT_FOUND')) return `${baseUrl}#endpoints`;

  return `${baseUrl}#errors`;
}

export function createApiError(options: CreateErrorOptions): NextResponse<ApiErrorResponse> {
  const traceId = generateTraceId();
  const docsUrl = getDocsUrl(options.code);
  const hint = Hints[options.code] || 'Contact support with trace_id';

  const errorResponse: ApiErrorResponse = {
    error: {
      error_code: options.code,
      message: options.message,
      trace_id: traceId,
      hint: hint,
      ...(options.details && { details: options.details }),
      docs_url: docsUrl,
    },
  };

  const response = NextResponse.json(errorResponse, { status: options.status });

  // Add trace ID header for observability
  response.headers.set('X-Trace-ID', traceId);

  // Add custom headers if provided
  if (options.headers) {
    Object.entries(options.headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }

  return response;
}

// ============================================
// Pre-built Error Helpers
// ============================================

// Authentication errors (401)
export const AuthErrors = {
  missingApiKey: () =>
    createApiError({
      code: ErrorCodes.AUTH_MISSING_KEY,
      message: 'API key required. Pass your API key in the Authorization: Bearer header.',
      status: 401,
    }),

  invalidApiKey: () =>
    createApiError({
      code: ErrorCodes.AUTH_INVALID_KEY,
      message: 'Invalid or inactive API key.',
      status: 401,
    }),

  // Alias for invalidApiKey (backwards compatibility)
  invalidKey: () =>
    createApiError({
      code: ErrorCodes.AUTH_INVALID_KEY,
      message: 'Invalid or inactive API key.',
      status: 401,
    }),

  expiredApiKey: () =>
    createApiError({
      code: ErrorCodes.AUTH_EXPIRED_KEY,
      message: 'API key has expired. Please generate a new key from the dashboard.',
      status: 401,
    }),

  unauthorized: (resource?: string) =>
    createApiError({
      code: ErrorCodes.AUTH_UNAUTHORIZED,
      message: resource
        ? `You do not have permission to access this ${resource}.`
        : 'You do not have permission to perform this action.',
      status: 403,
    }),
};

// Rate limit errors (429)
export const RateLimitErrors = {
  rateLimitExceeded: (headers?: Record<string, string>) =>
    createApiError({
      code: ErrorCodes.RATE_LIMIT_EXCEEDED,
      message: 'Rate limit exceeded. Please slow down your requests.',
      status: 429,
      headers,
    }),

  quotaExceeded: (quotaType: 'daily' | 'monthly', plan: string) =>
    createApiError({
      code: quotaType === 'daily' ? ErrorCodes.DAILY_LIMIT_EXCEEDED : ErrorCodes.MONTHLY_LIMIT_EXCEEDED,
      message: `${quotaType === 'daily' ? 'Daily' : 'Monthly'} API call limit exceeded for your ${plan} plan. Upgrade your plan for higher limits.`,
      status: 429,
      details: { plan, quota_type: quotaType },
    }),
};

// Validation errors (400)
export const ValidationErrors = {
  missingField: (field: string) =>
    createApiError({
      code: ErrorCodes.MISSING_REQUIRED_FIELD,
      message: `Missing required field: ${field}`,
      status: 400,
      details: { field },
    }),

  invalidField: (field: string, reason?: string) =>
    createApiError({
      code: ErrorCodes.INVALID_FIELD_VALUE,
      message: reason ? `Invalid value for ${field}: ${reason}` : `Invalid value for ${field}`,
      status: 400,
      details: { field, reason },
    }),

  invalidFormat: (field: string, expected?: string) =>
    createApiError({
      code: ErrorCodes.INVALID_FIELD_VALUE,
      message: expected ? `Invalid format for ${field}: expected ${expected}` : `Invalid format for ${field}`,
      status: 400,
      details: { field, expected },
    }),

  invalidValue: (field: string, value: unknown, expected?: string) =>
    createApiError({
      code: ErrorCodes.INVALID_FIELD_VALUE,
      message: expected
        ? `Invalid value '${value}' for ${field}: expected ${expected}`
        : `Invalid value '${value}' for ${field}`,
      status: 400,
      details: { field, value, expected },
    }),

  invalidBody: (reason?: string) =>
    createApiError({
      code: ErrorCodes.INVALID_REQUEST_BODY,
      message: reason || 'Invalid request body',
      status: 400,
    }),
};

// Resource errors (404)
export const NotFoundErrors = {
  memory: (id?: string) =>
    createApiError({
      code: ErrorCodes.MEMORY_NOT_FOUND,
      message: id ? `Memory not found: ${id}` : 'Memory not found',
      status: 404,
      details: id ? { memory_id: id } : undefined,
    }),

  collection: (id?: string) =>
    createApiError({
      code: ErrorCodes.COLLECTION_NOT_FOUND,
      message: id ? `Collection not found: ${id}` : 'Collection not found',
      status: 404,
      details: id ? { collection_id: id } : undefined,
    }),

  document: (id?: string) =>
    createApiError({
      code: ErrorCodes.DOCUMENT_NOT_FOUND,
      message: id ? `Document not found: ${id}` : 'Document not found',
      status: 404,
      details: id ? { document_id: id } : undefined,
    }),

  resource: (type: string, id?: string) =>
    createApiError({
      code: ErrorCodes.RESOURCE_NOT_FOUND,
      message: id ? `${type} not found: ${id}` : `${type} not found`,
      status: 404,
      details: { type, id },
    }),
};

// Server errors (500)
export const ServerErrors = {
  internal: (context?: string) =>
    createApiError({
      code: ErrorCodes.INTERNAL_ERROR,
      message: 'An unexpected error occurred. Please try again later.',
      status: 500,
      details: context ? { context } : undefined,
    }),

  database: (operation?: string) =>
    createApiError({
      code: ErrorCodes.DATABASE_ERROR,
      message: 'Database operation failed. Please try again.',
      status: 500,
      details: operation ? { operation } : undefined,
    }),

  embedding: () =>
    createApiError({
      code: ErrorCodes.EMBEDDING_ERROR,
      message: 'Failed to generate embedding. Please try again.',
      status: 500,
    }),

  aiModel: (model?: string) =>
    createApiError({
      code: ErrorCodes.AI_MODEL_ERROR,
      message: 'AI model request failed. Please try again.',
      status: 500,
      details: model ? { model } : undefined,
    }),

  serviceUnavailable: () =>
    createApiError({
      code: ErrorCodes.SERVICE_UNAVAILABLE,
      message: 'Service temporarily unavailable. Please try again later.',
      status: 503,
    }),
};

// Memory v4 specific errors
export const MemoryV4Errors = {
  candidateNotFound: (id?: string) =>
    createApiError({
      code: ErrorCodes.CANDIDATE_NOT_FOUND,
      message: id ? `Candidate not found: ${id}` : 'Candidate not found',
      status: 404,
      details: id ? { candidate_id: id } : undefined,
    }),

  candidateAlreadyProcessed: (id: string, action: string) =>
    createApiError({
      code: ErrorCodes.CANDIDATE_ALREADY_PROCESSED,
      message: `Candidate ${id} has already been ${action}`,
      status: 400,
      details: { candidate_id: id, action },
    }),

  edgeNotFound: (id?: string) =>
    createApiError({
      code: ErrorCodes.EDGE_NOT_FOUND,
      message: id ? `Edge not found: ${id}` : 'Edge not found',
      status: 404,
      details: id ? { edge_id: id } : undefined,
    }),

  edgeAlreadyExists: (srcId: string, dstId: string, edgeType: string) =>
    createApiError({
      code: ErrorCodes.EDGE_ALREADY_EXISTS,
      message: `Edge of type '${edgeType}' already exists between memories`,
      status: 409,
      details: { src_memory_id: srcId, dst_memory_id: dstId, edge_type: edgeType },
    }),

  memoryOwnershipRequired: (memoryId: string) =>
    createApiError({
      code: ErrorCodes.MEMORY_OWNERSHIP_REQUIRED,
      message: `Memory ${memoryId} does not belong to you`,
      status: 403,
      details: { memory_id: memoryId },
    }),

  confirmationRequired: (operation: string, count?: number) =>
    createApiError({
      code: ErrorCodes.CONFIRMATION_REQUIRED,
      message: count
        ? `This will affect ${count} items. Set confirm: true to proceed with ${operation}.`
        : `Set confirm: true to proceed with ${operation}.`,
      status: 400,
      details: { operation, affected_count: count },
    }),

  invalidEdgeType: (edgeType: string, validTypes: string[]) =>
    createApiError({
      code: ErrorCodes.INVALID_EDGE_TYPE,
      message: `Invalid edge type '${edgeType}'. Valid types: ${validTypes.join(', ')}`,
      status: 400,
      details: { edge_type: edgeType, valid_types: validTypes },
    }),

  invalidMemoryScope: (scope: string, validScopes: string[]) =>
    createApiError({
      code: ErrorCodes.INVALID_MEMORY_SCOPE,
      message: `Invalid scope '${scope}'. Valid scopes: ${validScopes.join(', ')}`,
      status: 400,
      details: { scope, valid_scopes: validScopes },
    }),
};

// ============================================
// Utility
// ============================================

/**
 * Check if a response is an API error
 */
export function isApiError(response: unknown): response is ApiErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'error' in response &&
    typeof (response as ApiErrorResponse).error?.error_code === 'string'
  );
}

/**
 * Generate a trace ID for request tracking
 * Exported for use in routes that need to include trace_id in custom responses
 */
export { generateTraceId };
