/**
 * Retry Logic for Answer Generation
 *
 * Implements exponential backoff with jitter for resilient
 * answer generation with configurable retry strategies.
 */

import type { RetryConfig } from './types';
import { DEFAULT_RETRY_CONFIG } from './types';

export interface RetryState {
  attempt: number;
  lastError?: Error;
  totalDelayMs: number;
  startTime: number;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalTimeMs: number;
  retriedErrors: string[];
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: Error, config: RetryConfig): boolean {
  const errorMessage = error.message.toLowerCase();
  const errorName = error.name.toLowerCase();

  // Check against configured retryable errors
  for (const pattern of config.retryableErrors) {
    const lowerPattern = pattern.toLowerCase();
    if (errorMessage.includes(lowerPattern) || errorName.includes(lowerPattern)) {
      return true;
    }
  }

  // Check for common retryable HTTP status codes (if present in message)
  const retryableStatusCodes = [429, 500, 502, 503, 504];
  for (const code of retryableStatusCodes) {
    if (errorMessage.includes(code.toString())) {
      return true;
    }
  }

  // Check for network errors
  const networkErrors = ['network', 'socket', 'econnreset', 'etimedout', 'enotfound'];
  for (const netError of networkErrors) {
    if (errorMessage.includes(netError) || errorName.includes(netError)) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate delay for next retry with exponential backoff and jitter
 */
export function calculateRetryDelay(
  attempt: number,
  config: RetryConfig
): number {
  // Exponential backoff
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);

  // Add jitter (±25%)
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);

  // Apply delay with bounds
  const delay = Math.min(exponentialDelay + jitter, config.maxDelayMs);

  return Math.max(delay, config.initialDelayMs);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const finalConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const retriedErrors: string[] = [];
  const startTime = Date.now();

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= finalConfig.maxRetries + 1; attempt++) {
    try {
      const data = await fn();
      return {
        success: true,
        data,
        attempts: attempt,
        totalTimeMs: Date.now() - startTime,
        retriedErrors,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      const canRetry = attempt <= finalConfig.maxRetries && isRetryableError(lastError, finalConfig);

      if (!canRetry) {
        return {
          success: false,
          error: lastError,
          attempts: attempt,
          totalTimeMs: Date.now() - startTime,
          retriedErrors,
        };
      }

      // Record the error
      retriedErrors.push(`Attempt ${attempt}: ${lastError.message}`);

      // Call retry callback if provided
      if (finalConfig.onRetry) {
        finalConfig.onRetry(attempt, lastError);
      }

      // Wait before retrying
      const delay = calculateRetryDelay(attempt, finalConfig);
      await sleep(delay);
    }
  }

  // Should not reach here, but handle edge case
  return {
    success: false,
    error: lastError ?? new Error('Max retries exceeded'),
    attempts: finalConfig.maxRetries + 1,
    totalTimeMs: Date.now() - startTime,
    retriedErrors,
  };
}

/**
 * Create a retry wrapper for a specific function
 */
export function createRetryWrapper<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  config: Partial<RetryConfig> = {}
): (...args: Parameters<T>) => Promise<RetryResult<Awaited<ReturnType<T>>>> {
  return async (...args: Parameters<T>) => {
    return withRetry(() => fn(...args), config);
  };
}

/**
 * Retry with circuit breaker pattern
 */
export class RetryWithCircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private isOpen = false;

  constructor(
    private config: RetryConfig & {
      failureThreshold: number;
      resetTimeMs: number;
    }
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<RetryResult<T>> {
    // Check circuit breaker state
    if (this.isOpen) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;

      if (timeSinceLastFailure < this.config.resetTimeMs) {
        return {
          success: false,
          error: new Error('Circuit breaker is open'),
          attempts: 0,
          totalTimeMs: 0,
          retriedErrors: ['Circuit breaker prevented execution'],
        };
      }

      // Half-open state: allow one request through
      this.isOpen = false;
    }

    const result = await withRetry(fn, this.config);

    if (result.success) {
      // Reset failure count on success
      this.failureCount = 0;
    } else {
      // Increment failure count
      this.failureCount++;
      this.lastFailureTime = Date.now();

      // Open circuit if threshold exceeded
      if (this.failureCount >= this.config.failureThreshold) {
        this.isOpen = true;
      }
    }

    return result;
  }

  getState(): { isOpen: boolean; failureCount: number } {
    return {
      isOpen: this.isOpen,
      failureCount: this.failureCount,
    };
  }

  reset(): void {
    this.isOpen = false;
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }
}

/**
 * Retry with timeout
 */
export async function withRetryAndTimeout<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> & { timeoutMs: number }
): Promise<RetryResult<T>> {
  const { timeoutMs, ...retryConfig } = config;

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });

  const wrappedFn = async () => {
    return Promise.race([fn(), timeoutPromise]);
  };

  return withRetry(wrappedFn, retryConfig);
}

/**
 * Batch retry - retry multiple operations with shared backoff
 */
export async function batchRetry<T>(
  operations: Array<() => Promise<T>>,
  config: Partial<RetryConfig> & { concurrency?: number } = {}
): Promise<Array<RetryResult<T>>> {
  const { concurrency = 5, ...retryConfig } = config;
  const results: Array<RetryResult<T>> = [];

  // Process in batches
  for (let i = 0; i < operations.length; i += concurrency) {
    const batch = operations.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((op) => withRetry(op, retryConfig))
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Retry with fallback
 */
export async function withRetryAndFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const primaryResult = await withRetry(primary, config);

  if (primaryResult.success) {
    return primaryResult;
  }

  // Try fallback with same retry logic
  const fallbackResult = await withRetry(fallback, config);

  return {
    ...fallbackResult,
    attempts: primaryResult.attempts + fallbackResult.attempts,
    retriedErrors: [
      ...primaryResult.retriedErrors,
      'Switched to fallback',
      ...fallbackResult.retriedErrors,
    ],
  };
}
