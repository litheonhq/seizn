# Seizn Error System Usage Guide

## Error Response Format

All API errors follow this standardized format:

```json
{
  "success": false,
  "error": {
    "error_code": "SEIZN_200",
    "trace_id": "szn_trc_abc123def456",
    "hint": "Add the missing required field to your request body.",
    "message": "Missing required field: content",
    "details": {
      "field": "content"
    },
    "docs_url": "https://seizn.com/docs/api/errors#validation",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "status": 400
  }
}
```

## Error Code Categories

| Range | Category | Description |
|-------|----------|-------------|
| SEIZN_1xx | Authentication | API key, session, permissions |
| SEIZN_2xx | Validation | Request body, parameters |
| SEIZN_3xx | Resource | Not found, conflict |
| SEIZN_4xx | External | AI providers, database, cache |
| SEIZN_5xx | Internal | Server errors |

## Quick Start

### 1. Import the error system

```typescript
import {
  // Error helpers
  AuthErrors,
  ValidationErrors,
  ResourceErrors,
  ExternalErrors,
  InternalErrors,

  // Utilities
  generateTraceId,
  withErrorHandler,
  createSuccessResponse,

  // Types
  SEIZN_ERROR_CODES,
} from '@/lib/errors';
```

### 2. Use pre-built error helpers

```typescript
// Authentication errors
return AuthErrors.missingApiKey(traceId);
return AuthErrors.invalidApiKey(traceId);
return AuthErrors.accessDenied('memories', traceId);

// Validation errors
return ValidationErrors.missingField('content', traceId);
return ValidationErrors.invalidFieldType('limit', 'number', 'string', traceId);
return ValidationErrors.fieldOutOfRange('limit', 150, 1, 100, traceId);

// Resource errors
return ResourceErrors.memoryNotFound(memoryId, traceId);
return ResourceErrors.alreadyExists('Collection', collectionName, traceId);

// External errors
return ExternalErrors.embeddingFailed('timeout', traceId);
return ExternalErrors.databaseError('insert_memory', traceId);

// Internal errors
return InternalErrors.internal('unknown_context', traceId);
return InternalErrors.serviceUnavailable('embedding_service', traceId);
```

### 3. Wrap routes with error handler

```typescript
export const GET = withErrorHandler(async (request: NextRequest) => {
  const traceId = generateTraceId();

  // Your handler logic...
  // Any uncaught errors are automatically converted to SEIZN_501

  return createSuccessResponse(data, { count: 10 }, traceId);
});
```

### 4. Parse and validate request bodies

```typescript
import { parseJsonBody, validateRequiredFields } from '@/lib/errors';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const traceId = generateTraceId();

  // Parse JSON body with automatic error handling
  const parsed = await parseJsonBody<CreateMemoryRequest>(request, traceId);
  if ('error' in parsed) {
    return parsed.error; // Returns SEIZN_206 or SEIZN_207
  }

  const body = parsed.data;

  // Validate required fields
  const validation = validateRequiredFields(body, ['content', 'namespace'], traceId);
  if (!validation.valid) {
    return validation.error; // Returns SEIZN_200
  }

  // Continue with valid data...
});
```

## Error Codes Reference

### Authentication (SEIZN_1xx)

| Code | Name | HTTP Status |
|------|------|-------------|
| SEIZN_100 | MISSING_API_KEY | 401 |
| SEIZN_101 | INVALID_API_KEY | 401 |
| SEIZN_102 | EXPIRED_API_KEY | 401 |
| SEIZN_103 | INSUFFICIENT_SCOPE | 401 |
| SEIZN_104 | SESSION_EXPIRED | 401 |
| SEIZN_105 | ACCESS_DENIED | 401 |
| SEIZN_110 | RATE_LIMIT_EXCEEDED | 429 |
| SEIZN_111 | DAILY_QUOTA_EXCEEDED | 429 |
| SEIZN_112 | MONTHLY_QUOTA_EXCEEDED | 429 |
| SEIZN_113 | TOKEN_BUDGET_EXCEEDED | 429 |

### Validation (SEIZN_2xx)

| Code | Name | HTTP Status |
|------|------|-------------|
| SEIZN_200 | MISSING_REQUIRED_FIELD | 400 |
| SEIZN_201 | INVALID_FIELD_TYPE | 400 |
| SEIZN_202 | FIELD_OUT_OF_RANGE | 400 |
| SEIZN_203 | FIELD_TOO_LONG | 400 |
| SEIZN_204 | FIELD_TOO_SHORT | 400 |
| SEIZN_205 | INVALID_FORMAT | 400 |
| SEIZN_206 | INVALID_JSON | 400 |
| SEIZN_207 | INVALID_CONTENT_TYPE | 400 |
| SEIZN_208 | PAYLOAD_TOO_LARGE | 400 |
| SEIZN_209 | INVALID_ENUM_VALUE | 400 |

### Resource (SEIZN_3xx)

| Code | Name | HTTP Status |
|------|------|-------------|
| SEIZN_300 | NOT_FOUND | 404 |
| SEIZN_301 | MEMORY_NOT_FOUND | 404 |
| SEIZN_302 | COLLECTION_NOT_FOUND | 404 |
| SEIZN_303 | DOCUMENT_NOT_FOUND | 404 |
| SEIZN_350 | ALREADY_EXISTS | 409 |
| SEIZN_351 | DUPLICATE_ENTRY | 409 |
| SEIZN_352 | STATE_CONFLICT | 409 |

### External Service (SEIZN_4xx)

| Code | Name | HTTP Status |
|------|------|-------------|
| SEIZN_400 | EXTERNAL_SERVICE_ERROR | 502 |
| SEIZN_401 | AI_PROVIDER_ERROR | 502 |
| SEIZN_402 | EMBEDDING_FAILED | 502 |
| SEIZN_403 | LLM_COMPLETION_FAILED | 502 |
| SEIZN_404 | VECTOR_DB_ERROR | 502 |
| SEIZN_405 | DATABASE_ERROR | 502 |
| SEIZN_409 | EXTERNAL_TIMEOUT | 502 |

### Internal (SEIZN_5xx)

| Code | Name | HTTP Status |
|------|------|-------------|
| SEIZN_500 | INTERNAL_ERROR | 500 |
| SEIZN_501 | UNEXPECTED_ERROR | 500 |
| SEIZN_503 | SERVICE_UNAVAILABLE | 503 |
| SEIZN_504 | NOT_IMPLEMENTED | 501 |

## Migration from Old System

### Before (old api-error.ts)

```typescript
import { ValidationErrors, ServerErrors } from '@/lib/api-error';

if (!body.content) {
  return ValidationErrors.missingField('content');
}

return ServerErrors.database('insert_memory');
```

### After (new errors system)

```typescript
import {
  ValidationErrors,
  ExternalErrors,
  generateTraceId
} from '@/lib/errors';

const traceId = generateTraceId();

if (!body.content) {
  return ValidationErrors.missingField('content', traceId);
}

return ExternalErrors.databaseError('insert_memory', traceId);
```

## Response Headers

All error responses include these headers:

| Header | Description |
|--------|-------------|
| X-Trace-ID | Unique trace ID for debugging |
| X-Error-Code | SEIZN_XXX error code |
| X-RateLimit-* | Rate limit info (for 429 errors) |
| Retry-After | Seconds to wait (for 429 errors) |
