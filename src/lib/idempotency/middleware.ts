/**
 * Idempotency Middleware
 *
 * Middleware for handling idempotent API requests.
 * Wraps API handlers to automatically handle idempotency key validation,
 * caching, and response replay.
 *
 * @module idempotency/middleware
 */

import { NextRequest, NextResponse } from 'next/server';
import { createApiError } from '@/lib/errors/factory';
import { SEIZN_ERROR_CODES } from '@/lib/errors/codes';
import { getIdempotencyStore, IdempotencyStore } from './store';
import type { IdempotencyOptions, StoredResponse } from './types';
import { DEFAULT_IDEMPOTENCY_OPTIONS } from './types';

/**
 * Type for API route handlers
 */
export type IdempotentHandler = (
  request: NextRequest,
  context?: { params?: Record<string, string> }
) => Promise<NextResponse | Response>;

/**
 * Context passed to handlers when using idempotency
 */
export interface IdempotencyContext {
  /** The idempotency key provided */
  idempotencyKey: string | null;
  /** The user ID */
  userId: string;
  /** Mark the request as failed (allows retry) */
  fail: () => Promise<void>;
}

/**
 * Extended handler type with idempotency context
 */
export type IdempotentHandlerWithContext = (
  request: NextRequest,
  context?: { params?: Record<string, string> },
  idempotency?: IdempotencyContext
) => Promise<NextResponse | Response>;

/**
 * Validate idempotency key format
 */
function validateIdempotencyKey(
  key: string,
  options: Required<IdempotencyOptions>
): { valid: true } | { valid: false; error: NextResponse } {
  if (key.length < options.minKeyLength) {
    return {
      valid: false,
      error: createApiError({
        code: SEIZN_ERROR_CODES.INVALID_IDEMPOTENCY_KEY,
        message: `Idempotency key must be at least ${options.minKeyLength} characters`,
        details: {
          min_length: options.minKeyLength,
          actual_length: key.length,
        },
      }),
    };
  }

  if (key.length > options.maxKeyLength) {
    return {
      valid: false,
      error: createApiError({
        code: SEIZN_ERROR_CODES.INVALID_IDEMPOTENCY_KEY,
        message: `Idempotency key must be at most ${options.maxKeyLength} characters`,
        details: {
          max_length: options.maxKeyLength,
          actual_length: key.length,
        },
      }),
    };
  }

  // Key should be printable ASCII characters
  if (!/^[\x20-\x7E]+$/.test(key)) {
    return {
      valid: false,
      error: createApiError({
        code: SEIZN_ERROR_CODES.INVALID_IDEMPOTENCY_KEY,
        message: 'Idempotency key must contain only printable ASCII characters',
      }),
    };
  }

  return { valid: true };
}

/**
 * Recreate a response from stored data
 */
function recreateResponse(stored: StoredResponse): NextResponse {
  const response = new NextResponse(stored.body, {
    status: stored.status,
    headers: stored.headers,
  });

  // Add header indicating this is a cached response
  response.headers.set('Idempotency-Replayed', 'true');

  return response;
}

/**
 * Extract user ID from request (must be authenticated)
 */
async function extractUserId(request: NextRequest): Promise<string | null> {
  // Check for user ID in request headers (set by auth middleware)
  const userId =
    request.headers.get('x-user-id') || request.headers.get('x-auth-user-id');

  if (userId) return userId;

  // Check for API key header and try to extract user from it
  const apiKey = request.headers.get('x-api-key');
  if (apiKey) {
    // API key format typically includes user info
    // This is a fallback - ideally auth middleware sets x-user-id
    return `api:${apiKey.substring(0, 8)}`;
  }

  return null;
}

/**
 * Parse request body safely
 */
async function parseRequestBody(request: NextRequest): Promise<unknown> {
  try {
    const contentType = request.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      const text = await request.clone().text();
      if (text) {
        return JSON.parse(text);
      }
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Wrap an API handler with idempotency support
 *
 * @example
 * ```ts
 * // Basic usage - idempotency optional
 * export const POST = withIdempotency(async (request) => {
 *   const result = await processPayment();
 *   return NextResponse.json({ success: true, data: result });
 * });
 *
 * // Required idempotency key
 * export const POST = withIdempotency(
 *   async (request) => {
 *     const result = await processPayment();
 *     return NextResponse.json({ success: true, data: result });
 *   },
 *   { required: true }
 * );
 *
 * // With idempotency context
 * export const POST = withIdempotency(
 *   async (request, context, idempotency) => {
 *     try {
 *       const result = await processPayment();
 *       return NextResponse.json({ success: true, data: result });
 *     } catch (error) {
 *       // Mark as failed to allow retry with same key
 *       await idempotency?.fail();
 *       throw error;
 *     }
 *   }
 * );
 * ```
 */
export function withIdempotency(
  handler: IdempotentHandlerWithContext,
  options: IdempotencyOptions = {}
): IdempotentHandler {
  const opts: Required<IdempotencyOptions> = {
    ...DEFAULT_IDEMPOTENCY_OPTIONS,
    ...options,
  };

  const store = getIdempotencyStore();

  return async (
    request: NextRequest,
    context?: { params?: Record<string, string> }
  ): Promise<NextResponse | Response> => {
    // Only apply to mutating methods
    const method = request.method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH'].includes(method)) {
      return handler(request, context, undefined);
    }

    // Extract idempotency key from header
    const idempotencyKey = request.headers.get(opts.headerName);

    // Check if key is required
    if (!idempotencyKey) {
      if (opts.required) {
        return createApiError({
          code: SEIZN_ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED,
          message: `${opts.headerName} header is required for this endpoint`,
          details: {
            header_name: opts.headerName,
            method: method,
          },
        });
      }
      // Key not provided but not required - proceed without idempotency
      return handler(request, context, undefined);
    }

    // Validate key format
    const validation = validateIdempotencyKey(idempotencyKey, opts);
    if ('error' in validation) {
      return validation.error;
    }

    // Extract user ID
    const userId = await extractUserId(request);
    if (!userId) {
      // Can't do idempotency without user context
      // Proceed without idempotency rather than failing
      console.warn('No user ID for idempotency - proceeding without');
      return handler(request, context, undefined);
    }

    // Parse request body for hashing
    const requestBody = await parseRequestBody(request);

    // Check idempotency store
    const endpoint = new URL(request.url).pathname;
    const checkResult = await store.check(
      idempotencyKey,
      userId,
      endpoint,
      method,
      requestBody
    );

    switch (checkResult.type) {
      case 'cached':
        // Return cached response
        return recreateResponse(checkResult.response);

      case 'in_progress':
        // Request still processing
        return createApiError({
          code: SEIZN_ERROR_CODES.IDEMPOTENCY_REQUEST_IN_PROGRESS,
          message:
            'A request with this idempotency key is already being processed',
          details: {
            idempotency_key: idempotencyKey,
            retry_after_seconds: opts.lockTimeoutSeconds,
          },
          headers: {
            'Retry-After': String(opts.lockTimeoutSeconds),
          },
        });

      case 'conflict':
        // Different request body with same key
        return createApiError({
          code: SEIZN_ERROR_CODES.IDEMPOTENCY_KEY_CONFLICT,
          message:
            'Idempotency key already used with a different request body',
          details: {
            idempotency_key: idempotencyKey,
          },
        });

      case 'error':
        // Store error - proceed without idempotency
        console.warn('Idempotency store error:', checkResult.message);
        return handler(request, context, undefined);

      case 'new':
        // New request - proceed and capture response
        break;
    }

    // Create idempotency context for handler
    const idempotencyContext: IdempotencyContext = {
      idempotencyKey,
      userId,
      fail: async () => {
        await store.fail(idempotencyKey, userId);
      },
    };

    try {
      // Execute the handler
      const response = await handler(request, context, idempotencyContext);

      // Store the response
      if (response instanceof NextResponse || response instanceof Response) {
        // Only cache successful responses (2xx)
        if (response.status >= 200 && response.status < 300) {
          // Clone and extract body for storage
          const cloned = response.clone();
          const body = await cloned.text();

          await store.complete(idempotencyKey, userId, {
            status: response.status,
            headers: response.headers,
            body,
          });
        } else {
          // Non-success response - mark as failed to allow retry
          await store.fail(idempotencyKey, userId);
        }
      }

      return response;
    } catch (error) {
      // Handler threw an error - mark as failed
      await store.fail(idempotencyKey, userId);
      throw error;
    }
  };
}

/**
 * Create a custom idempotency middleware with specific options
 */
export function createIdempotencyMiddleware(
  options: IdempotencyOptions
): (handler: IdempotentHandlerWithContext) => IdempotentHandler {
  return (handler: IdempotentHandlerWithContext) =>
    withIdempotency(handler, options);
}

/**
 * Pre-configured middleware that requires idempotency key
 */
export const withRequiredIdempotency = createIdempotencyMiddleware({
  required: true,
});

/**
 * Pre-configured middleware with short TTL (1 hour)
 */
export const withShortIdempotency = createIdempotencyMiddleware({
  ttlSeconds: 3600,
});

/**
 * Pre-configured middleware with long TTL (7 days)
 */
export const withLongIdempotency = createIdempotencyMiddleware({
  ttlSeconds: 604800,
});
