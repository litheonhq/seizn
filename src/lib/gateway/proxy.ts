/**
 * Gateway Proxy
 *
 * Core proxy logic for routing VectorDB requests through the gateway.
 * Handles request interception, adapter routing, and response wrapping.
 */

import type {
  ProxyRequest,
  ProxyResponse,
  ProxyError,
  VectorAdapter,
  GatewayConfig,
  VectorDBProvider,
  GatewayOptions,
  SearchPayload,
  UpsertPayload,
  DeletePayload,
  HealthPayload,
  ProxyResponseData,
} from './types';
import { createAdapter, AdapterError } from './adapters';
import { TraceInjector } from './trace-injector';

// Default options
const DEFAULT_OPTIONS: GatewayOptions = {
  timeout: 30000,
  retries: 2,
  retryDelayMs: 1000,
  rateLimit: {
    enabled: false,
    maxRequestsPerSecond: 100,
    maxRequestsPerMinute: 1000,
    burstSize: 50,
  },
  circuitBreaker: {
    enabled: false,
    failureThreshold: 5,
    resetTimeoutMs: 30000,
    halfOpenRequests: 3,
  },
};

// Adapter cache for connection reuse
const adapterCache = new Map<string, { adapter: VectorAdapter; lastUsed: number }>();
const ADAPTER_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generate cache key for adapter
 */
function getAdapterCacheKey(config: GatewayConfig): string {
  return `${config.provider}:${config.host || config.connectionString || ''}:${config.indexName || config.className || config.collectionName || config.tableName || ''}`;
}

/**
 * Get or create an adapter for the given config
 */
async function getAdapter(config: GatewayConfig): Promise<VectorAdapter> {
  const cacheKey = getAdapterCacheKey(config);
  const cached = adapterCache.get(cacheKey);

  if (cached && Date.now() - cached.lastUsed < ADAPTER_TTL_MS) {
    cached.lastUsed = Date.now();
    return cached.adapter;
  }

  // Create new adapter
  const adapter = createAdapter(config);
  await adapter.connect();

  // Cache it
  adapterCache.set(cacheKey, { adapter, lastUsed: Date.now() });

  // Cleanup old adapters
  cleanupAdapterCache();

  return adapter;
}

/**
 * Cleanup expired adapters from cache
 */
function cleanupAdapterCache(): void {
  const now = Date.now();

  Array.from(adapterCache.entries()).forEach(([key, entry]) => {
    if (now - entry.lastUsed > ADAPTER_TTL_MS) {
      entry.adapter.disconnect().catch(() => {});
      adapterCache.delete(key);
    }
  });
}

/**
 * VectorDB Gateway Proxy
 *
 * Main proxy class for handling vector database operations.
 */
export class GatewayProxy {
  private options: GatewayOptions;

  constructor(options?: Partial<GatewayOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Execute a proxy request
   */
  async execute(request: ProxyRequest, traceInjector?: TraceInjector): Promise<ProxyResponse> {
    const startTime = performance.now();
    const trace = traceInjector || new TraceInjector();

    // Start span for this operation
    const span = trace.startSpan(request.operation, request.provider);

    try {
      // Validate request
      this.validateRequest(request);

      // Get adapter
      trace.log('debug', 'Getting adapter', { provider: request.provider });
      const adapter = await getAdapter(request.config);

      // Execute operation with retries
      const result = await this.executeWithRetry(
        adapter,
        request,
        trace
      );

      // Calculate latencies
      const totalLatencyMs = Math.round(performance.now() - startTime);

      // Finish span successfully
      trace.finish('ok');

      return trace.wrapResponse({
        success: true,
        data: result.data,
        latencyMs: totalLatencyMs,
        providerLatencyMs: result.providerLatencyMs,
        provider: request.provider,
        operation: request.operation,
      });
    } catch (error) {
      const totalLatencyMs = Math.round(performance.now() - startTime);

      // Log error
      trace.log('error', 'Proxy request failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Finish span with error
      trace.finish('error');

      return trace.wrapResponse({
        success: false,
        error: this.formatError(error),
        latencyMs: totalLatencyMs,
        providerLatencyMs: 0,
        provider: request.provider,
        operation: request.operation,
      });
    }
  }

  /**
   * Validate proxy request
   */
  private validateRequest(request: ProxyRequest): void {
    if (!request.provider) {
      throw new ProxyValidationError('provider is required');
    }

    if (!request.operation) {
      throw new ProxyValidationError('operation is required');
    }

    if (!request.config) {
      throw new ProxyValidationError('config is required');
    }

    const validOperations = ['search', 'upsert', 'delete', 'health'];
    if (!validOperations.includes(request.operation)) {
      throw new ProxyValidationError(`Invalid operation: ${request.operation}`);
    }

    const validProviders: VectorDBProvider[] = ['pinecone', 'weaviate', 'pgvector', 'qdrant'];
    if (!validProviders.includes(request.provider)) {
      throw new ProxyValidationError(`Invalid provider: ${request.provider}`);
    }
  }

  /**
   * Execute operation with retry logic
   */
  private async executeWithRetry(
    adapter: VectorAdapter,
    request: ProxyRequest,
    trace: TraceInjector
  ): Promise<{ data: ProxyResponseData; providerLatencyMs: number }> {
    const maxRetries = this.options.retries ?? 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          trace.log('info', `Retry attempt ${attempt}/${maxRetries}`);
          await this.delay(this.options.retryDelayMs ?? 1000);
        }

        const startTime = performance.now();
        const data = await this.executeOperation(adapter, request);
        const providerLatencyMs = Math.round(performance.now() - startTime);

        return { data, providerLatencyMs };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        if (!this.isRetryable(error) || attempt === maxRetries) {
          throw error;
        }

        trace.log('warn', `Operation failed, will retry`, {
          attempt,
          error: lastError.message,
        });
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Execute the actual operation on the adapter
   */
  private async executeOperation(
    adapter: VectorAdapter,
    request: ProxyRequest
  ): Promise<ProxyResponseData> {
    switch (request.operation) {
      case 'search':
        return adapter.search(request.payload as SearchPayload);

      case 'upsert':
        return adapter.upsert(request.payload as UpsertPayload);

      case 'delete':
        return adapter.delete(request.payload as DeletePayload);

      case 'health':
        return adapter.health();

      default:
        throw new ProxyValidationError(`Unknown operation: ${request.operation}`);
    }
  }

  /**
   * Check if an error is retryable
   */
  private isRetryable(error: unknown): boolean {
    if (error instanceof AdapterError) {
      return error.retryable;
    }

    if (error instanceof ProxyValidationError) {
      return false;
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('timeout') ||
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('rate limit') ||
        message.includes('429') ||
        message.includes('503')
      );
    }

    return false;
  }

  /**
   * Format error for response
   */
  private formatError(error: unknown): ProxyError {
    if (error instanceof AdapterError) {
      return {
        code: error.code,
        message: error.message,
        details: error.details,
        retryable: error.retryable,
      };
    }

    if (error instanceof ProxyValidationError) {
      return {
        code: 'VALIDATION_ERROR',
        message: error.message,
        retryable: false,
      };
    }

    if (error instanceof Error) {
      return {
        code: 'INTERNAL_ERROR',
        message: error.message,
        retryable: this.isRetryable(error),
      };
    }

    return {
      code: 'UNKNOWN_ERROR',
      message: String(error),
      retryable: false,
    };
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Proxy validation error
 */
export class ProxyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProxyValidationError';
  }
}

// Default proxy instance
let defaultProxy: GatewayProxy | null = null;

/**
 * Get the default proxy instance
 */
export function getDefaultProxy(): GatewayProxy {
  if (!defaultProxy) {
    defaultProxy = new GatewayProxy();
  }
  return defaultProxy;
}

/**
 * Execute a proxy request using the default proxy
 */
export async function proxyRequest(
  request: ProxyRequest,
  options?: {
    headers?: Record<string, string | undefined>;
  }
): Promise<ProxyResponse> {
  const proxy = getDefaultProxy();

  // Create trace injector from headers if provided
  const trace = options?.headers
    ? TraceInjector.fromHeaders(options.headers)
    : new TraceInjector();

  return proxy.execute(request, trace);
}

/**
 * Quick search helper
 */
export async function proxySearch(
  provider: VectorDBProvider,
  config: GatewayConfig,
  embedding: number[],
  options?: {
    topK?: number;
    filter?: Record<string, unknown>;
    namespace?: string;
  }
): Promise<ProxyResponse> {
  return proxyRequest({
    operation: 'search',
    provider,
    config,
    payload: {
      type: 'search',
      embedding,
      topK: options?.topK ?? 10,
      filter: options?.filter,
      namespace: options?.namespace,
      includeMetadata: true,
    },
  });
}

/**
 * Quick upsert helper
 */
export async function proxyUpsert(
  provider: VectorDBProvider,
  config: GatewayConfig,
  vectors: Array<{ id: string; values: number[]; metadata?: Record<string, unknown>; content?: string }>,
  options?: {
    namespace?: string;
  }
): Promise<ProxyResponse> {
  return proxyRequest({
    operation: 'upsert',
    provider,
    config,
    payload: {
      type: 'upsert',
      vectors,
      namespace: options?.namespace,
    },
  });
}

/**
 * Quick delete helper
 */
export async function proxyDelete(
  provider: VectorDBProvider,
  config: GatewayConfig,
  ids: string[],
  options?: {
    namespace?: string;
  }
): Promise<ProxyResponse> {
  return proxyRequest({
    operation: 'delete',
    provider,
    config,
    payload: {
      type: 'delete',
      ids,
      namespace: options?.namespace,
    },
  });
}

/**
 * Quick health check helper
 */
export async function proxyHealth(
  provider: VectorDBProvider,
  config: GatewayConfig
): Promise<ProxyResponse> {
  return proxyRequest({
    operation: 'health',
    provider,
    config,
    payload: {
      type: 'health',
    },
  });
}
