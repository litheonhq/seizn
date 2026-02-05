/**
 * Retry Handler with Exponential Backoff
 *
 * Implements intelligent retry logic for LLM API calls
 */

import type { RetryConfig, GatewayError } from './types';

// Default retry configuration
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    'RATE_LIMIT',
    'TIMEOUT',
    'SERVICE_UNAVAILABLE',
    'INTERNAL_ERROR',
    'CONNECTION_ERROR',
    'OVERLOADED',
  ],
};

/**
 * Retryable error codes by provider
 */
const RETRYABLE_HTTP_STATUS = [429, 500, 502, 503, 504];

const RETRYABLE_ERROR_PATTERNS = [
  /rate limit/i,
  /too many requests/i,
  /overloaded/i,
  /capacity/i,
  /timeout/i,
  /connection/i,
  /network/i,
  /ECONNRESET/,
  /ENOTFOUND/,
  /ETIMEDOUT/,
];

/**
 * Check if an error is retryable
 */
export function isRetryableError(
  error: Error | GatewayError,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): boolean {
  // Check if it's a GatewayError with explicit retryable flag
  if ('retryable' in error && typeof error.retryable === 'boolean') {
    return error.retryable;
  }

  // Check error code
  if ('code' in error && config.retryableErrors.includes(error.code as string)) {
    return true;
  }

  // Check HTTP status
  if ('status' in error && RETRYABLE_HTTP_STATUS.includes((error as { status: number }).status)) {
    return true;
  }

  // Check error message patterns
  const message = error.message || '';
  for (const pattern of RETRYABLE_ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate delay for retry attempt
 */
export function calculateDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const jitter = Math.random() * 0.3 * delay; // Add 0-30% jitter
  return Math.min(delay + jitter, config.maxDelayMs);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  onRetry?: (attempt: number, error: Error, delayMs: number) => void
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (attempt >= cfg.maxRetries || !isRetryableError(lastError, cfg)) {
        throw lastError;
      }

      // Calculate delay
      const delayMs = calculateDelay(attempt, cfg);

      // Notify retry callback
      if (onRetry) {
        onRetry(attempt + 1, lastError, delayMs);
      }

      // Wait before retrying
      await sleep(delayMs);
    }
  }

  throw lastError || new Error('Retry failed');
}

/**
 * Create a retry wrapper for a function
 */
export function createRetryWrapper<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  config: Partial<RetryConfig> = {}
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) => withRetry(() => fn(...args), config);
}

/**
 * Extract retry-after header value
 */
export function extractRetryAfter(
  headers: Headers | Record<string, string> | null | undefined
): number | null {
  if (!headers) return null;

  const retryAfter =
    headers instanceof Headers
      ? headers.get('retry-after')
      : headers['retry-after'] || headers['Retry-After'];

  if (!retryAfter) return null;

  // Check if it's a number (seconds)
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000; // Convert to milliseconds
  }

  // Check if it's a date
  const date = new Date(retryAfter);
  if (!isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }

  return null;
}

/**
 * Retry context for tracking retry state
 */
export interface RetryContext {
  attempt: number;
  maxRetries: number;
  startTime: Date;
  errors: Error[];
  lastDelay?: number;
}

/**
 * Create retry context
 */
export function createRetryContext(maxRetries: number): RetryContext {
  return {
    attempt: 0,
    maxRetries,
    startTime: new Date(),
    errors: [],
  };
}

/**
 * Update retry context after an attempt
 */
export function updateRetryContext(
  context: RetryContext,
  error: Error,
  delayMs: number
): RetryContext {
  return {
    ...context,
    attempt: context.attempt + 1,
    errors: [...context.errors, error],
    lastDelay: delayMs,
  };
}

/**
 * Get retry summary for logging
 */
export function getRetrySummary(context: RetryContext): string {
  const duration = Date.now() - context.startTime.getTime();
  return `Attempts: ${context.attempt}/${context.maxRetries}, Duration: ${duration}ms, Errors: ${context.errors.map((e) => e.message).join(', ')}`;
}
