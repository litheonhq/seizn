/**
 * Idempotency Module
 *
 * Provides idempotent request handling for API endpoints.
 * Prevents duplicate operations when clients retry requests.
 *
 * Features:
 * - Redis-based idempotency key storage with TTL
 * - Request body hashing for conflict detection
 * - Concurrent request handling with locks
 * - Graceful fallback when Redis unavailable
 * - Configurable TTL and key validation
 *
 * @module idempotency
 *
 * @example
 * ```ts
 * // Basic usage - idempotency optional
 * import { withIdempotency } from '@/lib/idempotency';
 *
 * export const POST = withIdempotency(async (request) => {
 *   const result = await createPayment();
 *   return NextResponse.json({ success: true, data: result });
 * });
 *
 * // Required idempotency key for critical operations
 * import { withRequiredIdempotency } from '@/lib/idempotency';
 *
 * export const POST = withRequiredIdempotency(async (request) => {
 *   const result = await processRefund();
 *   return NextResponse.json({ success: true, data: result });
 * });
 *
 * // Custom options
 * import { withIdempotency } from '@/lib/idempotency';
 *
 * export const POST = withIdempotency(
 *   async (request, context, idempotency) => {
 *     try {
 *       const result = await processOrder();
 *       return NextResponse.json({ success: true, data: result });
 *     } catch (error) {
 *       // Allow retry with same key on failure
 *       await idempotency?.fail();
 *       throw error;
 *     }
 *   },
 *   { required: true, ttlSeconds: 3600 }
 * );
 * ```
 *
 * Client usage:
 * ```http
 * POST /api/payments
 * Content-Type: application/json
 * Idempotency-Key: unique-request-id-12345
 *
 * {"amount": 100, "currency": "USD"}
 * ```
 */

// Types
export type {
  IdempotencyStatus,
  IdempotencyRecord,
  StoredResponse,
  IdempotencyOptions,
  IdempotencyCheckResult,
} from './types';
export { DEFAULT_IDEMPOTENCY_OPTIONS } from './types';

// Store
export {
  IdempotencyStore,
  getIdempotencyStore,
  createIdempotencyStore,
  hashRequestBody,
} from './store';

// Middleware
export type {
  IdempotentHandler,
  IdempotentHandlerWithContext,
  IdempotencyContext,
} from './middleware';
export {
  withIdempotency,
  createIdempotencyMiddleware,
  withRequiredIdempotency,
  withShortIdempotency,
  withLongIdempotency,
} from './middleware';
