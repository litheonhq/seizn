/**
 * A3 Gateway - VectorDB Proxy
 *
 * Unified gateway for vector database operations.
 * Supports Pinecone, Weaviate, pgvector, and Qdrant.
 *
 * Features:
 * - Provider abstraction with adapters
 * - Distributed tracing (W3C Trace Context)
 * - Automatic retries with backoff
 * - Connection pooling
 * - Request/response wrapping
 *
 * @example
 * ```typescript
 * import { proxySearch, GatewayProxy } from '@/lib/gateway';
 *
 * // Quick search
 * const response = await proxySearch('pinecone', config, embedding);
 *
 * // Custom proxy
 * const proxy = new GatewayProxy({ retries: 3 });
 * const result = await proxy.execute(request);
 * ```
 */

// Types
export type {
  VectorDBProvider,
  GatewayConfig,
  ProxyOperation,
  ProxyRequest,
  ProxyPayload,
  SearchPayload,
  UpsertPayload,
  DeletePayload,
  HealthPayload,
  VectorRecord,
  SearchResultItem,
  ProxyResponse,
  ProxyResponseData,
  SearchResponseData,
  UpsertResponseData,
  DeleteResponseData,
  HealthResponseData,
  ProxyError,
  TraceInjection,
  GatewaySpan,
  GatewayLog,
  VectorAdapter,
  AdapterFactory,
  AdapterRegistry,
  GatewayMetrics,
  ProviderMetrics,
  OperationMetrics,
  RateLimitConfig,
  CircuitBreakerConfig,
  GatewayOptions,
} from './types';

// Adapters
export {
  BaseVectorAdapter,
  AdapterError,
  PineconeAdapter,
  WeaviateAdapter,
  PgvectorAdapter,
  QdrantAdapter,
  adapterRegistry,
  createAdapter,
  registerAdapter,
  getSupportedProviders,
} from './adapters';

// Trace Injector
export {
  TraceInjector,
  generateTraceId,
  generateSpanId,
  shouldSample,
  createTraceInjection,
  createChildTrace,
  extractTraceFromHeaders,
  injectTraceToHeaders,
  createGatewaySpan,
  addSpanTag,
  addSpanLog,
  finishSpan,
} from './trace-injector';

// Proxy
export {
  GatewayProxy,
  ProxyValidationError,
  getDefaultProxy,
  proxyRequest,
  proxySearch,
  proxyUpsert,
  proxyDelete,
  proxyHealth,
} from './proxy';

/**
 * Create a gateway configuration object
 *
 * Helper for type-safe config creation.
 */
export function createGatewayConfig(
  provider: 'pinecone',
  config: {
    apiKey: string;
    host?: string;
    environment?: string;
    indexName?: string;
    namespace?: string;
  }
): import('./types').GatewayConfig;
export function createGatewayConfig(
  provider: 'weaviate',
  config: {
    host: string;
    apiKey?: string;
    className: string;
    scheme?: 'http' | 'https';
    namespace?: string;
  }
): import('./types').GatewayConfig;
export function createGatewayConfig(
  provider: 'pgvector',
  config: {
    connectionString?: string;
    host?: string;
    apiKey?: string;
    tableName?: string;
  }
): import('./types').GatewayConfig;
export function createGatewayConfig(
  provider: 'qdrant',
  config: {
    host: string;
    apiKey?: string;
    collectionName: string;
    scheme?: 'http' | 'https';
  }
): import('./types').GatewayConfig;
export function createGatewayConfig(
  provider: import('./types').VectorDBProvider,
  config: Record<string, unknown>
): import('./types').GatewayConfig {
  return {
    provider,
    ...config,
  } as import('./types').GatewayConfig;
}
