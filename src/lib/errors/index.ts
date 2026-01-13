/**
 * Seizn Error Handling System
 *
 * Standardized error handling for all Seizn API endpoints.
 *
 * Error Code Format: SEIZN_XXX
 * - SEIZN_1xx: Authentication/Authorization errors
 * - SEIZN_2xx: Request validation errors
 * - SEIZN_3xx: Resource errors (not found, conflict)
 * - SEIZN_4xx: External service errors
 * - SEIZN_5xx: Internal server errors
 *
 * All error responses include:
 * - error_code: Machine-readable SEIZN_XXX code
 * - trace_id: Unique request trace ID for debugging
 * - hint: Developer-friendly resolution suggestion
 * - message: User-friendly error description
 *
 * @module errors
 *
 * @example
 * ```ts
 * import {
 *   AuthErrors,
 *   ValidationErrors,
 *   ResourceErrors,
 *   withErrorHandler,
 *   generateTraceId,
 * } from '@/lib/errors';
 *
 * // Using pre-built error helpers
 * if (!apiKey) {
 *   return AuthErrors.missingApiKey(traceId);
 * }
 *
 * if (!body.content) {
 *   return ValidationErrors.missingField('content', traceId);
 * }
 *
 * // Wrapping API route with error handler
 * export const GET = withErrorHandler(async (request) => {
 *   const data = await fetchData();
 *   return createSuccessResponse(data, undefined, traceId);
 * });
 * ```
 */

// Error codes
export {
  SEIZN_ERROR_CODES,
  AUTH_CODES,
  VALIDATION_CODES,
  RESOURCE_CODES,
  EXTERNAL_CODES,
  INTERNAL_CODES,
  type SeizErrorCode,
  isAuthError,
  isValidationError,
  isResourceError,
  isExternalError,
  isInternalError,
  getHttpStatus,
  getErrorCategory,
} from './codes';

// Error hints and documentation
export {
  ERROR_HINTS,
  DOCS_URLS,
  getErrorHint,
  getDocsUrl,
} from './hints';

// Error types
export {
  type SeizApiErrorResponse,
  type SeizApiSuccessResponse,
  type SeizApiResponse,
  type CreateErrorOptions,
  type ValidationFieldError,
  type RateLimitDetails,
  type QuotaDetails,
  SeizApiError,
} from './types';

// Error factory functions
export {
  generateTraceId,
  getOrCreateTraceId,
  createApiError,
  createApiErrorFromException,
  AuthErrors,
  RateLimitErrors,
  ValidationErrors,
  ResourceErrors,
  ExternalErrors,
  InternalErrors,
} from './factory';

// Middleware utilities
export {
  withErrorHandler,
  parseJsonBody,
  validateRequiredFields,
  validateFieldType,
  createSuccessResponse,
  errorBoundary,
  type ApiRouteHandler,
} from './middleware';
