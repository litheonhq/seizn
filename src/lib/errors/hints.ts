/**
 * Seizn Error Hints
 *
 * Developer-friendly hints for resolving each error type.
 * These are displayed in API error responses to help developers
 * quickly identify and fix issues.
 *
 * @module errors/hints
 */

import { SEIZN_ERROR_CODES, type SeizErrorCode } from './codes';

/**
 * Hint messages mapped to error codes
 */
export const ERROR_HINTS: Record<SeizErrorCode, string> = {
  // ============================================
  // Authentication/Authorization (SEIZN_1xx)
  // ============================================

  // Auth errors (100-109)
  [SEIZN_ERROR_CODES.MISSING_API_KEY]:
    'Add the x-api-key header to your request. Get your API key from Dashboard > API Keys.',
  [SEIZN_ERROR_CODES.INVALID_API_KEY]:
    'Verify your API key is correct and active in Dashboard > API Keys. Regenerate if necessary.',
  [SEIZN_ERROR_CODES.EXPIRED_API_KEY]:
    'Your API key has expired. Generate a new key from Dashboard > API Keys.',
  [SEIZN_ERROR_CODES.INSUFFICIENT_SCOPE]:
    'This API key lacks the required permission. Check scopes in Dashboard > API Keys.',
  [SEIZN_ERROR_CODES.SESSION_EXPIRED]:
    'Your session has expired. Please log in again to continue.',
  [SEIZN_ERROR_CODES.ACCESS_DENIED]:
    'You do not have permission to access this resource. Contact your organization admin.',
  [SEIZN_ERROR_CODES.ORG_MEMBERSHIP_REQUIRED]:
    'This action requires organization membership. Join or create an organization first.',

  // Rate limit errors (110-119)
  [SEIZN_ERROR_CODES.RATE_LIMIT_EXCEEDED]:
    'Too many requests. Implement exponential backoff (1s -> 2s -> 4s) and retry.',
  [SEIZN_ERROR_CODES.DAILY_QUOTA_EXCEEDED]:
    'Daily API call limit reached. Upgrade your plan or wait until tomorrow (UTC midnight).',
  [SEIZN_ERROR_CODES.MONTHLY_QUOTA_EXCEEDED]:
    'Monthly API call limit reached. Upgrade your plan for higher limits.',
  [SEIZN_ERROR_CODES.TOKEN_BUDGET_EXCEEDED]:
    'Token budget exhausted. Reduce input size or upgrade your plan.',

  // ============================================
  // Request Validation (SEIZN_2xx)
  // ============================================

  [SEIZN_ERROR_CODES.MISSING_REQUIRED_FIELD]:
    'Add the missing required field to your request body. Check API docs for required fields.',
  [SEIZN_ERROR_CODES.INVALID_FIELD_TYPE]:
    'Field type mismatch. Check the expected type in API documentation.',
  [SEIZN_ERROR_CODES.FIELD_OUT_OF_RANGE]:
    'Field value exceeds allowed range. Check min/max constraints in API docs.',
  [SEIZN_ERROR_CODES.FIELD_TOO_LONG]:
    'String exceeds maximum length. Truncate or split the content.',
  [SEIZN_ERROR_CODES.FIELD_TOO_SHORT]:
    'String below minimum length. Provide more content.',
  [SEIZN_ERROR_CODES.INVALID_FORMAT]:
    'Field format invalid. Check the expected pattern in API docs.',
  [SEIZN_ERROR_CODES.INVALID_JSON]:
    'Request body is not valid JSON. Validate JSON syntax before sending.',
  [SEIZN_ERROR_CODES.INVALID_CONTENT_TYPE]:
    'Set Content-Type header to application/json for JSON requests.',
  [SEIZN_ERROR_CODES.PAYLOAD_TOO_LARGE]:
    'Request payload exceeds size limit. Reduce content or use chunked uploads.',
  [SEIZN_ERROR_CODES.INVALID_ENUM_VALUE]:
    'Value not in allowed list. Check valid options in API documentation.',
  [SEIZN_ERROR_CODES.ARRAY_TOO_LARGE]:
    'Array exceeds maximum item count. Reduce items or paginate requests.',
  [SEIZN_ERROR_CODES.ARRAY_TOO_SMALL]:
    'Array requires minimum number of items. Add more items.',
  [SEIZN_ERROR_CODES.INVALID_UUID]:
    'Invalid UUID format. Use standard UUID v4 format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).',
  [SEIZN_ERROR_CODES.INVALID_URL]:
    'Invalid URL format. Ensure URL includes protocol (https://).',
  [SEIZN_ERROR_CODES.INVALID_EMAIL]:
    'Invalid email format. Use a valid email address.',
  [SEIZN_ERROR_CODES.INVALID_DATETIME]:
    'Invalid date/time format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ).',

  // ============================================
  // Resource Errors (SEIZN_3xx)
  // ============================================

  // Not found (300-309)
  [SEIZN_ERROR_CODES.NOT_FOUND]:
    'Resource not found. Verify the ID and ensure you have access.',
  [SEIZN_ERROR_CODES.MEMORY_NOT_FOUND]:
    'Memory record not found. Use GET /api/memories?query=... to search existing memories.',
  [SEIZN_ERROR_CODES.COLLECTION_NOT_FOUND]:
    'Collection not found. Create a new collection or check the collection name.',
  [SEIZN_ERROR_CODES.DOCUMENT_NOT_FOUND]:
    'Document not found in collection. Verify document ID or re-index the document.',
  [SEIZN_ERROR_CODES.USER_NOT_FOUND]:
    'User not found. Verify user ID or check user registration.',
  [SEIZN_ERROR_CODES.ORG_NOT_FOUND]:
    'Organization not found. Verify organization ID or create a new organization.',
  [SEIZN_ERROR_CODES.API_KEY_NOT_FOUND]:
    'API key not found. It may have been deleted. Generate a new key.',
  [SEIZN_ERROR_CODES.TRACE_NOT_FOUND]:
    'Trace/log not found. It may have expired or been deleted.',
  [SEIZN_ERROR_CODES.WEBHOOK_NOT_FOUND]:
    'Webhook not found. Create a new webhook in Dashboard > Webhooks.',
  [SEIZN_ERROR_CODES.EXPERIMENT_NOT_FOUND]:
    'Experiment not found. Verify experiment ID or create a new experiment.',

  // Conflict (350-359)
  [SEIZN_ERROR_CODES.ALREADY_EXISTS]:
    'Resource already exists. Use a different identifier or update the existing resource.',
  [SEIZN_ERROR_CODES.DUPLICATE_ENTRY]:
    'Duplicate entry detected. Check for existing entries before creating.',
  [SEIZN_ERROR_CODES.STATE_CONFLICT]:
    'Resource state conflict. Refresh the resource and retry.',
  [SEIZN_ERROR_CODES.CONCURRENT_MODIFICATION]:
    'Concurrent modification detected. Fetch latest version and retry.',
  [SEIZN_ERROR_CODES.RESOURCE_LOCKED]:
    'Resource is locked by another process. Wait and retry.',
  [SEIZN_ERROR_CODES.RESOURCE_DELETED]:
    'Resource has been deleted. Restore from backup or create new.',

  // ============================================
  // External Service Errors (SEIZN_4xx)
  // ============================================

  [SEIZN_ERROR_CODES.EXTERNAL_SERVICE_ERROR]:
    'External service failed. Retry with exponential backoff. Check status.seizn.com.',
  [SEIZN_ERROR_CODES.AI_PROVIDER_ERROR]:
    'AI provider error. Retry request or try a different model.',
  [SEIZN_ERROR_CODES.EMBEDDING_FAILED]:
    'Embedding generation failed. Check content length (<8K chars) and retry.',
  [SEIZN_ERROR_CODES.LLM_COMPLETION_FAILED]:
    'LLM completion failed. Reduce input size or try a simpler model (haiku).',
  [SEIZN_ERROR_CODES.VECTOR_DB_ERROR]:
    'Vector database error. Retry request. Contact support if persistent.',
  [SEIZN_ERROR_CODES.DATABASE_ERROR]:
    'Database operation failed. Retry request. Check input data validity.',
  [SEIZN_ERROR_CODES.CACHE_ERROR]:
    'Cache service error. Request will proceed but may be slower.',
  [SEIZN_ERROR_CODES.EMAIL_SERVICE_ERROR]:
    'Email delivery failed. Verify email address and retry.',
  [SEIZN_ERROR_CODES.WEBHOOK_DELIVERY_FAILED]:
    'Webhook delivery failed. Check webhook URL accessibility and SSL certificate.',
  [SEIZN_ERROR_CODES.EXTERNAL_TIMEOUT]:
    'External service timeout. Retry with smaller payload or later.',
  [SEIZN_ERROR_CODES.EXTERNAL_RATE_LIMIT]:
    'External service rate limited. Wait 1 minute and retry.',
  [SEIZN_ERROR_CODES.PAYMENT_ERROR]:
    'Payment processing failed. Verify payment method in Dashboard > Billing.',
  [SEIZN_ERROR_CODES.STORAGE_ERROR]:
    'Storage service error. Retry upload/download.',
  [SEIZN_ERROR_CODES.FEDERATED_SOURCE_ERROR]:
    'Federated source unreachable. Check source configuration and connectivity.',

  // ============================================
  // Internal Server Errors (SEIZN_5xx)
  // ============================================

  [SEIZN_ERROR_CODES.INTERNAL_ERROR]:
    'Internal server error. Retry request. Include trace_id when contacting support.',
  [SEIZN_ERROR_CODES.UNEXPECTED_ERROR]:
    'Unexpected error occurred. Retry request. Report with trace_id if persistent.',
  [SEIZN_ERROR_CODES.CONFIG_ERROR]:
    'Server configuration error. Contact support with trace_id.',
  [SEIZN_ERROR_CODES.SERVICE_UNAVAILABLE]:
    'Service temporarily unavailable. Check status.seizn.com and retry in 1 minute.',
  [SEIZN_ERROR_CODES.NOT_IMPLEMENTED]:
    'Feature not yet implemented. Check roadmap or contact support.',
  [SEIZN_ERROR_CODES.INIT_FAILED]:
    'Service initialization failed. Contact support with trace_id.',
  [SEIZN_ERROR_CODES.JOB_FAILED]:
    'Background job failed. Check job status endpoint or retry.',
  [SEIZN_ERROR_CODES.DATA_INTEGRITY_ERROR]:
    'Data integrity error. Contact support with trace_id.',
  [SEIZN_ERROR_CODES.CIRCUIT_BREAKER_OPEN]:
    'Service temporarily disabled for protection. Retry in 1 minute.',
};

/**
 * Get hint for an error code
 * Returns a default hint if code is not found
 */
export function getErrorHint(code: string): string {
  const hint = ERROR_HINTS[code as SeizErrorCode];
  if (hint) return hint;

  // Default hints based on code prefix
  if (code.startsWith('SEIZN_1')) {
    return 'Authentication error. Check your API key and permissions.';
  }
  if (code.startsWith('SEIZN_2')) {
    return 'Validation error. Check your request against API documentation.';
  }
  if (code.startsWith('SEIZN_3')) {
    return 'Resource error. Verify the resource exists and you have access.';
  }
  if (code.startsWith('SEIZN_4')) {
    return 'External service error. Retry with exponential backoff.';
  }
  if (code.startsWith('SEIZN_5')) {
    return 'Internal error. Retry request or contact support with trace_id.';
  }

  return 'An error occurred. Contact support with trace_id if the issue persists.';
}

/**
 * Documentation URL for each error category
 */
export const DOCS_URLS: Record<string, string> = {
  auth: 'https://seizn.com/docs/api/authentication',
  rate_limit: 'https://seizn.com/docs/api/rate-limits',
  validation: 'https://seizn.com/docs/api/errors#validation',
  resource: 'https://seizn.com/docs/api/errors#resources',
  external: 'https://seizn.com/docs/api/errors#external',
  internal: 'https://seizn.com/docs/api/errors#internal',
  default: 'https://seizn.com/docs/api/errors',
};

/**
 * Get documentation URL for an error code
 */
export function getDocsUrl(code: string): string {
  if (code.startsWith('SEIZN_10')) return DOCS_URLS.auth;
  if (code.startsWith('SEIZN_11')) return DOCS_URLS.rate_limit;
  if (code.startsWith('SEIZN_2')) return DOCS_URLS.validation;
  if (code.startsWith('SEIZN_3')) return DOCS_URLS.resource;
  if (code.startsWith('SEIZN_4')) return DOCS_URLS.external;
  if (code.startsWith('SEIZN_5')) return DOCS_URLS.internal;
  return DOCS_URLS.default;
}
