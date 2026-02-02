/**
 * Idempotency Key Types
 *
 * Type definitions for idempotency key handling in API requests.
 *
 * @module idempotency/types
 */

/**
 * Status of an idempotent request
 */
export type IdempotencyStatus = 'pending' | 'completed' | 'failed';

/**
 * Stored idempotency record
 */
export interface IdempotencyRecord {
  /** Unique idempotency key provided by client */
  key: string;

  /** User ID associated with this request */
  userId: string;

  /** API endpoint path */
  endpoint: string;

  /** HTTP method */
  method: string;

  /** Hash of the request body for conflict detection */
  requestHash: string;

  /** Current status of the request */
  status: IdempotencyStatus;

  /** Stored response (when completed) */
  response?: StoredResponse;

  /** Timestamp when the record was created */
  createdAt: Date;

  /** Timestamp when the record expires */
  expiresAt: Date;

  /** Timestamp when the request completed */
  completedAt?: Date;
}

/**
 * Stored response for replay
 */
export interface StoredResponse {
  /** HTTP status code */
  status: number;

  /** Response headers to preserve */
  headers: Record<string, string>;

  /** Response body (JSON stringified) */
  body: string;
}

/**
 * Options for idempotency middleware
 */
export interface IdempotencyOptions {
  /**
   * Header name for idempotency key
   * @default 'Idempotency-Key'
   */
  headerName?: string;

  /**
   * Whether idempotency key is required
   * @default false
   */
  required?: boolean;

  /**
   * TTL for idempotency records in seconds
   * @default 86400 (24 hours)
   */
  ttlSeconds?: number;

  /**
   * Maximum length for idempotency key
   * @default 256
   */
  maxKeyLength?: number;

  /**
   * Minimum length for idempotency key
   * @default 8
   */
  minKeyLength?: number;

  /**
   * Lock timeout in seconds for concurrent request handling
   * @default 60
   */
  lockTimeoutSeconds?: number;

  /**
   * Headers to include in stored response
   * @default ['Content-Type', 'X-Trace-ID']
   */
  preserveHeaders?: string[];
}

/**
 * Result of idempotency check
 */
export type IdempotencyCheckResult =
  | { type: 'new'; key: string }
  | { type: 'cached'; response: StoredResponse }
  | { type: 'in_progress'; key: string }
  | { type: 'conflict'; key: string; existingHash: string }
  | { type: 'error'; message: string };

/**
 * Default idempotency options
 */
export const DEFAULT_IDEMPOTENCY_OPTIONS: Required<IdempotencyOptions> = {
  headerName: 'Idempotency-Key',
  required: false,
  ttlSeconds: 86400, // 24 hours
  maxKeyLength: 256,
  minKeyLength: 8,
  lockTimeoutSeconds: 60,
  preserveHeaders: ['Content-Type', 'X-Trace-ID', 'X-Request-ID'],
};
