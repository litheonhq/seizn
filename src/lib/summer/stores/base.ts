/**
 * Base Vector Store Implementation
 *
 * Abstract base class with common functionality for all vector stores.
 */

import type {
  VectorStore,
  VectorStoreProvider,
  VectorRecord,
  VectorSearchOptions,
  VectorFilter,
  HealthCheckResult,
  UpsertResult,
  SearchResponse,
  DeleteResult,
  FetchResult,
  StoreStats,
  BaseStoreConfig,
} from './types';
import { VectorStoreError, VectorStoreErrorCode } from './types';

export abstract class BaseVectorStore implements VectorStore {
  abstract readonly provider: VectorStoreProvider;

  protected _connected = false;
  protected config: BaseStoreConfig;

  constructor(config: BaseStoreConfig) {
    this.config = config;
  }

  get name(): string {
    return this.config.name || this.provider;
  }

  get isConnected(): boolean {
    return this._connected;
  }

  protected get timeout(): number {
    return this.config.timeout || 30000;
  }

  protected get debug(): boolean {
    return this.config.debug || false;
  }

  // Abstract methods to be implemented by providers
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract healthCheck(): Promise<HealthCheckResult>;
  abstract upsert(records: VectorRecord[], namespace?: string): Promise<UpsertResult>;
  abstract search(options: VectorSearchOptions): Promise<SearchResponse>;
  abstract delete(ids: string[], namespace?: string): Promise<DeleteResult>;

  // Optional methods with default implementations
  async deleteByFilter?(filter: VectorFilter, namespace?: string): Promise<DeleteResult>;
  async fetch?(ids: string[], namespace?: string): Promise<FetchResult>;
  async stats?(): Promise<StoreStats>;

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Ensure store is connected before operations
   */
  protected ensureConnected(): void {
    if (!this._connected) {
      throw new VectorStoreError(
        `Store "${this.name}" is not connected. Call connect() first.`,
        'NOT_CONNECTED',
        this.provider
      );
    }
  }

  /**
   * Create a VectorStoreError with proper context
   */
  protected createError(
    message: string,
    code: VectorStoreErrorCode,
    cause?: Error
  ): VectorStoreError {
    return new VectorStoreError(message, code, this.provider, cause);
  }

  /**
   * Log debug messages if debug mode is enabled
   */
  protected log(message: string, ...args: unknown[]): void {
    if (this.debug) {
      console.log(`[${this.provider}:${this.name}] ${message}`, ...args);
    }
  }

  /**
   * Measure operation latency
   */
  protected async measureLatency<T>(
    operation: () => Promise<T>
  ): Promise<{ result: T; latencyMs: number }> {
    const start = performance.now();
    const result = await operation();
    const latencyMs = Math.round(performance.now() - start);
    return { result, latencyMs };
  }

  /**
   * Execute with retry logic
   */
  protected async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    const maxRetries = this.config.retry?.maxRetries ?? 3;
    const initialDelayMs = this.config.retry?.initialDelayMs ?? 100;
    const maxDelayMs = this.config.retry?.maxDelayMs ?? 5000;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on certain errors
        if (this.isNonRetryableError(lastError)) {
          throw lastError;
        }

        if (attempt < maxRetries) {
          const delay = Math.min(initialDelayMs * Math.pow(2, attempt), maxDelayMs);
          this.log(`${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    throw this.createError(
      `${operationName} failed after ${maxRetries + 1} attempts: ${lastError?.message}`,
      'INTERNAL_ERROR',
      lastError
    );
  }

  /**
   * Check if error should not be retried
   */
  private isNonRetryableError(error: Error): boolean {
    if (error instanceof VectorStoreError) {
      const nonRetryableCodes: VectorStoreErrorCode[] = [
        'AUTHENTICATION_FAILED',
        'NOT_FOUND',
        'INVALID_DIMENSION',
        'INVALID_FILTER',
        'QUOTA_EXCEEDED',
      ];
      return nonRetryableCodes.includes(error.code);
    }
    return false;
  }

  /**
   * Sleep for specified milliseconds
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute fetch with timeout
   */
  protected async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs?: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      timeoutMs || this.timeout
    );

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw this.createError(
          `Request timed out after ${timeoutMs || this.timeout}ms`,
          'TIMEOUT'
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Batch array into chunks
   */
  protected batchArray<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }
}
