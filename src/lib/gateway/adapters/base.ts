/**
 * Base Vector Adapter
 *
 * Abstract base class for all vector database adapters.
 * Provides common functionality like latency measurement and error handling.
 */

import type {
  VectorAdapter,
  VectorDBProvider,
  GatewayConfig,
  SearchPayload,
  UpsertPayload,
  DeletePayload,
  SearchResponseData,
  UpsertResponseData,
  DeleteResponseData,
  HealthResponseData,
  GatewayLog,
} from '../types';

export abstract class BaseVectorAdapter implements VectorAdapter {
  protected config: GatewayConfig;
  protected connected: boolean = false;
  protected logs: GatewayLog[] = [];

  abstract readonly provider: VectorDBProvider;

  constructor(config: GatewayConfig) {
    this.config = config;
  }

  get name(): string {
    return `${this.provider}-adapter`;
  }

  // Abstract methods to be implemented by each provider
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract search(payload: SearchPayload): Promise<SearchResponseData>;
  abstract upsert(payload: UpsertPayload): Promise<UpsertResponseData>;
  abstract delete(payload: DeletePayload): Promise<DeleteResponseData>;
  abstract health(): Promise<HealthResponseData>;

  /**
   * Validate that the adapter is connected before operations
   */
  protected validateConnected(): void {
    if (!this.connected) {
      throw new AdapterError(
        'NOT_CONNECTED',
        `Adapter ${this.name} is not connected`,
        false
      );
    }
  }

  /**
   * Measure latency of an async operation
   */
  protected async measureLatency<T>(
    fn: () => Promise<T>
  ): Promise<{ result: T; latencyMs: number }> {
    const start = performance.now();
    try {
      const result = await fn();
      return {
        result,
        latencyMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      // Still capture latency on error
      const latencyMs = Math.round(performance.now() - start);
      throw new AdapterError(
        'OPERATION_FAILED',
        error instanceof Error ? error.message : 'Unknown error',
        this.isRetryableError(error),
        { latencyMs }
      );
    }
  }

  /**
   * Determine if an error is retryable
   */
  protected isRetryableError(error: unknown): boolean {
    if (error instanceof AdapterError) {
      return error.retryable;
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      // Network errors and timeouts are typically retryable
      return (
        message.includes('timeout') ||
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('rate limit') ||
        message.includes('503') ||
        message.includes('429')
      );
    }

    return false;
  }

  /**
   * Add a log entry
   */
  protected log(
    level: GatewayLog['level'],
    message: string,
    fields?: Record<string, unknown>
  ): void {
    this.logs.push({
      timestamp: new Date().toISOString(),
      level,
      message,
      fields,
    });

    // Keep only last 100 logs
    if (this.logs.length > 100) {
      this.logs = this.logs.slice(-100);
    }
  }

  /**
   * Get collected logs
   */
  getLogs(): GatewayLog[] {
    return [...this.logs];
  }

  /**
   * Clear logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Normalize similarity score to 0-1 range
   */
  protected normalizeScore(
    score: number,
    metric: 'cosine' | 'dotproduct' | 'euclidean' | 'l2'
  ): number {
    switch (metric) {
      case 'cosine':
        // Cosine similarity is already -1 to 1, map to 0-1
        return (score + 1) / 2;
      case 'dotproduct':
        // Dot product can be any value, use sigmoid
        return 1 / (1 + Math.exp(-score));
      case 'euclidean':
      case 'l2':
        // Euclidean/L2 distance: lower is better, use inverse
        return 1 / (1 + score);
      default:
        return score;
    }
  }

  /**
   * Build common fetch options with timeout
   */
  protected buildFetchOptions(
    method: string,
    headers: Record<string, string>,
    body?: unknown,
    timeoutMs: number = 30000
  ): RequestInit & { signal: AbortSignal } {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const options: RequestInit & { signal: AbortSignal } = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      signal: controller.signal,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    // Clear timeout when request completes (handled by caller)
    (options as RequestInit & { signal: AbortSignal; timeoutId: NodeJS.Timeout }).timeoutId = timeoutId;

    return options;
  }
}

/**
 * Custom error class for adapter operations
 */
export class AdapterError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    retryable: boolean = false,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      details: this.details,
    };
  }
}
