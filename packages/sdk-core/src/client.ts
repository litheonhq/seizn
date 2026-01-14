/**
 * Seizn Core SDK - HTTP Client
 *
 * A1 Drop-in Adoption Layer for Seizn AI Infrastructure.
 * Provides retrieval operations with retry logic, tracing, and error handling.
 *
 * @example
 * ```typescript
 * import { SeiznClient } from '@seizn/core';
 *
 * const client = new SeiznClient({
 *   apiKey: 'szn_live_...',
 * });
 *
 * const result = await client.retrieve({
 *   query: 'What are the key findings?',
 *   topK: 5,
 * });
 *
 * console.log(result.contexts);
 * console.log(result.citations);
 * ```
 */

import type {
  SeiznConfig,
  RetrievalRequest,
  RetrievalResponse,
  Collection,
  DocumentUploadRequest,
  DocumentUploadResponse,
  HealthStatus,
  TraceContext,
} from './types';
import {
  SeiznError,
  TimeoutError,
  NetworkError,
  createErrorFromResponse,
  isSeiznError,
} from './errors';
import { resolveApiKey, buildAuthHeader, maskApiKey } from './auth';
import {
  createTraceContext,
  traceManager,
  generateTraceId,
} from './trace';

/**
 * Default configuration values
 */
const DEFAULTS = {
  baseUrl: 'https://api.seizn.com',
  timeout: 30000,
  maxRetries: 3,
  debug: false,
} as const;

/**
 * HTTP methods
 */
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * Request options for internal use
 */
interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
}

/**
 * Main Seizn client for retrieval operations
 */
export class SeiznClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly debug: boolean;
  private readonly defaultCollectionId?: string;
  private readonly customHeaders: Record<string, string>;

  /**
   * Create a new Seizn client
   *
   * @param config - Client configuration
   * @throws AuthenticationError if API key is invalid
   */
  constructor(config: SeiznConfig) {
    this.apiKey = resolveApiKey(config.apiKey);
    this.baseUrl = (config.baseUrl ?? DEFAULTS.baseUrl).replace(/\/$/, '');
    this.timeout = config.timeout ?? DEFAULTS.timeout;
    this.maxRetries = config.maxRetries ?? DEFAULTS.maxRetries;
    this.debug = config.debug ?? DEFAULTS.debug;
    this.defaultCollectionId = config.defaultCollectionId;
    this.customHeaders = config.customHeaders ?? {};

    this.log('Client initialized', {
      baseUrl: this.baseUrl,
      timeout: this.timeout,
      maxRetries: this.maxRetries,
      apiKey: maskApiKey(this.apiKey),
    });
  }

  // ============================================
  // Core Retrieval Operations
  // ============================================

  /**
   * Retrieve relevant contexts for a query
   *
   * @param request - Retrieval request parameters
   * @returns Retrieval response with contexts, citations, and receipt
   *
   * @example
   * ```typescript
   * const result = await client.retrieve({
   *   query: 'What is the return policy?',
   *   collectionId: 'docs',
   *   topK: 5,
   *   rerank: true,
   * });
   * ```
   */
  async retrieve(request: RetrievalRequest): Promise<RetrievalResponse> {
    const startTime = Date.now();
    const traceId = generateTraceId();

    this.log('Retrieval request', { query: request.query, traceId });

    const response = await this.request<RetrievalResponse>('/v1/retrieve', {
      method: 'POST',
      body: {
        query: request.query,
        collection_id: request.collectionId ?? this.defaultCollectionId,
        top_k: request.topK ?? 10,
        filters: request.filters,
        rerank: request.rerank ?? true,
        include_metadata: request.includeMetadata ?? true,
        min_score: request.minScore,
        trace_metadata: {
          ...request.traceMetadata,
          sdk_version: '0.1.0',
          sdk_name: '@seizn/core',
        },
      },
      headers: {
        'x-trace-id': traceId,
      },
    });

    const latencyMs = Date.now() - startTime;
    this.log('Retrieval complete', {
      traceId,
      contextsCount: response.contexts.length,
      latencyMs,
    });

    return {
      ...response,
      latencyMs: response.latencyMs ?? latencyMs,
      traceId: response.traceId ?? traceId,
    };
  }

  /**
   * Simple query method (alias for retrieve)
   */
  async query(
    query: string,
    options?: Omit<RetrievalRequest, 'query'>
  ): Promise<RetrievalResponse> {
    return this.retrieve({ query, ...options });
  }

  // ============================================
  // Collection Operations
  // ============================================

  /**
   * List all collections
   */
  async listCollections(): Promise<Collection[]> {
    const response = await this.request<{ collections: Collection[] }>(
      '/v1/collections'
    );
    return response.collections;
  }

  /**
   * Get a specific collection by ID
   */
  async getCollection(collectionId: string): Promise<Collection> {
    return this.request<Collection>(`/v1/collections/${collectionId}`);
  }

  /**
   * Create a new collection
   */
  async createCollection(
    name: string,
    options?: {
      description?: string;
      settings?: Collection['settings'];
    }
  ): Promise<Collection> {
    return this.request<Collection>('/v1/collections', {
      method: 'POST',
      body: {
        name,
        description: options?.description,
        settings: options?.settings,
      },
    });
  }

  /**
   * Delete a collection
   */
  async deleteCollection(collectionId: string): Promise<void> {
    await this.request(`/v1/collections/${collectionId}`, {
      method: 'DELETE',
    });
  }

  // ============================================
  // Document Operations
  // ============================================

  /**
   * Upload a document to a collection
   */
  async uploadDocument(
    request: DocumentUploadRequest
  ): Promise<DocumentUploadResponse> {
    return this.request<DocumentUploadResponse>('/v1/documents', {
      method: 'POST',
      body: {
        collection_id: request.collectionId,
        content: request.content,
        content_type: request.contentType,
        filename: request.filename,
        metadata: request.metadata,
        chunking_strategy: request.chunkingStrategy,
      },
    });
  }

  /**
   * Delete a document
   */
  async deleteDocument(documentId: string): Promise<void> {
    await this.request(`/v1/documents/${documentId}`, {
      method: 'DELETE',
    });
  }

  // ============================================
  // Utility Operations
  // ============================================

  /**
   * Check API health status
   */
  async health(): Promise<HealthStatus> {
    return this.request<HealthStatus>('/v1/health', {
      timeout: 5000,
      retries: 1,
    });
  }

  /**
   * Verify API key is valid
   */
  async verify(): Promise<boolean> {
    try {
      await this.request('/v1/auth/verify');
      return true;
    } catch {
      return false;
    }
  }

  // ============================================
  // Internal Request Handler
  // ============================================

  /**
   * Make an HTTP request with retry logic
   */
  private async request<T>(
    path: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const url = this.buildUrl(path, options.params);
    const method = options.method ?? 'GET';
    const timeout = options.timeout ?? this.timeout;
    const maxRetries = options.retries ?? this.maxRetries;

    let lastError: SeiznError | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.executeRequest<T>(
          url,
          method,
          options.body,
          {
            ...this.customHeaders,
            ...options.headers,
          },
          timeout
        );
        return response;
      } catch (error) {
        if (isSeiznError(error)) {
          lastError = error;

          // Don't retry non-retryable errors
          if (!error.isRetryable()) {
            throw error;
          }

          // Calculate backoff delay
          const delay = this.calculateBackoff(attempt, error.retryAfter);
          this.log('Retrying request', {
            attempt: attempt + 1,
            maxRetries,
            delay,
            error: error.code,
          });

          await this.sleep(delay);
        } else {
          // Wrap unknown errors
          throw new SeiznError({
            code: 'UNKNOWN_ERROR',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // All retries exhausted
    throw (
      lastError ??
      new SeiznError({
        code: 'UNKNOWN_ERROR',
        message: 'Request failed after all retries',
      })
    );
  }

  /**
   * Execute a single HTTP request
   */
  private async executeRequest<T>(
    url: string,
    method: HttpMethod,
    body: unknown | undefined,
    headers: Record<string, string>,
    timeout: number
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          ...buildAuthHeader(this.apiKey),
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': '@seizn/core/0.1.0',
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle non-2xx responses
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw createErrorFromResponse(response.status, errorBody);
      }

      // Handle empty responses
      const contentLength = response.headers.get('content-length');
      if (contentLength === '0' || response.status === 204) {
        return {} as T;
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError(timeout);
      }

      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new NetworkError(error.message);
      }

      // Re-throw Seizn errors
      if (isSeiznError(error)) {
        throw error;
      }

      // Wrap unknown errors
      throw new NetworkError(
        error instanceof Error ? error.message : 'Network request failed'
      );
    }
  }

  /**
   * Build full URL with query parameters
   */
  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): string {
    const url = new URL(path, this.baseUrl);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoff(attempt: number, retryAfter?: number): number {
    // If server specified retry-after, use that
    if (retryAfter !== undefined && retryAfter > 0) {
      return retryAfter * 1000;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s...
    const baseDelay = 1000;
    const maxDelay = 30000;
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

    // Add jitter (10-30% of delay)
    const jitter = delay * (0.1 + Math.random() * 0.2);
    return Math.floor(delay + jitter);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Debug logging
   */
  private log(message: string, data?: Record<string, unknown>): void {
    if (this.debug) {
      const timestamp = new Date().toISOString();
      console.log(`[Seizn ${timestamp}] ${message}`, data ?? '');
    }
  }
}

/**
 * Create a new Seizn client (factory function)
 */
export function createClient(config: SeiznConfig): SeiznClient {
  return new SeiznClient(config);
}

/**
 * Create a client with trace context
 */
export function createTracedClient(
  config: SeiznConfig,
  traceContext?: TraceContext
): SeiznClient {
  if (traceContext) {
    traceManager.setContext(traceContext);
  } else {
    traceManager.setContext(createTraceContext());
  }

  return new SeiznClient(config);
}
