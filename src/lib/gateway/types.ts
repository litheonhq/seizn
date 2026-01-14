/**
 * A3 Gateway Types
 *
 * Type definitions for the VectorDB Gateway/Proxy
 * Supports Pinecone, Weaviate, pgvector, and Qdrant
 */

// Supported vector database providers
export type VectorDBProvider = 'pinecone' | 'weaviate' | 'pgvector' | 'qdrant';

// Gateway configuration for connecting to a provider
export interface GatewayConfig {
  provider: VectorDBProvider;
  connectionString?: string;
  apiKey?: string;
  environment?: string;
  indexName?: string;
  host?: string;
  port?: number;
  namespace?: string;
  className?: string;
  collectionName?: string;
  tableName?: string;
  scheme?: 'http' | 'https';
}

// Supported operations
export type ProxyOperation = 'search' | 'upsert' | 'delete' | 'health';

// Incoming proxy request
export interface ProxyRequest {
  operation: ProxyOperation;
  provider: VectorDBProvider;
  payload: ProxyPayload;
  config: GatewayConfig;
}

// Union type for different operation payloads
export type ProxyPayload = SearchPayload | UpsertPayload | DeletePayload | HealthPayload;

// Search operation payload
export interface SearchPayload {
  type: 'search';
  query?: string;
  embedding?: number[];
  topK?: number;
  filter?: Record<string, unknown>;
  namespace?: string;
  includeMetadata?: boolean;
  includeValues?: boolean;
}

// Upsert operation payload
export interface UpsertPayload {
  type: 'upsert';
  vectors: VectorRecord[];
  namespace?: string;
}

// Delete operation payload
export interface DeletePayload {
  type: 'delete';
  ids: string[];
  namespace?: string;
  deleteAll?: boolean;
  filter?: Record<string, unknown>;
}

// Health check payload
export interface HealthPayload {
  type: 'health';
}

// Vector record for upsert
export interface VectorRecord {
  id: string;
  values: number[];
  metadata?: Record<string, unknown>;
  content?: string;
}

// Search result item
export interface SearchResultItem {
  id: string;
  score: number;
  values?: number[];
  metadata?: Record<string, unknown>;
  content?: string;
}

// Proxy response wrapper
export interface ProxyResponse {
  success: boolean;
  data?: ProxyResponseData;
  error?: ProxyError;
  traceId: string;
  spanId: string;
  latencyMs: number;
  providerLatencyMs: number;
  provider: VectorDBProvider;
  operation: ProxyOperation;
  timestamp: string;
}

// Union type for response data
export type ProxyResponseData = SearchResponseData | UpsertResponseData | DeleteResponseData | HealthResponseData;

// Search response data
export interface SearchResponseData {
  type: 'search';
  results: SearchResultItem[];
  count: number;
  namespace?: string;
}

// Upsert response data
export interface UpsertResponseData {
  type: 'upsert';
  upsertedCount: number;
  namespace?: string;
}

// Delete response data
export interface DeleteResponseData {
  type: 'delete';
  deletedCount: number;
  namespace?: string;
}

// Health response data
export interface HealthResponseData {
  type: 'health';
  healthy: boolean;
  provider: VectorDBProvider;
  details?: Record<string, unknown>;
}

// Error structure
export interface ProxyError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
}

// Trace injection metadata
export interface TraceInjection {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  timestamp: string;
  userId?: string;
  projectId?: string;
  environment?: string;
  baggage?: Record<string, string>;
}

// Span for tracing
export interface GatewaySpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  service: string;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  status: 'ok' | 'error';
  tags: Record<string, string | number | boolean>;
  logs: GatewayLog[];
}

// Log entry for spans
export interface GatewayLog {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  fields?: Record<string, unknown>;
}

// Adapter interface that all providers must implement
export interface VectorAdapter {
  readonly provider: VectorDBProvider;
  readonly name: string;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  search(payload: SearchPayload): Promise<SearchResponseData>;
  upsert(payload: UpsertPayload): Promise<UpsertResponseData>;
  delete(payload: DeletePayload): Promise<DeleteResponseData>;
  health(): Promise<HealthResponseData>;
}

// Adapter factory function type
export type AdapterFactory = (config: GatewayConfig) => VectorAdapter;

// Registry for adapters
export interface AdapterRegistry {
  register(provider: VectorDBProvider, factory: AdapterFactory): void;
  create(config: GatewayConfig): VectorAdapter;
  has(provider: VectorDBProvider): boolean;
}

// Metrics for monitoring
export interface GatewayMetrics {
  requestCount: number;
  errorCount: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  byProvider: Record<VectorDBProvider, ProviderMetrics>;
  byOperation: Record<ProxyOperation, OperationMetrics>;
}

export interface ProviderMetrics {
  requestCount: number;
  errorCount: number;
  avgLatencyMs: number;
}

export interface OperationMetrics {
  requestCount: number;
  errorCount: number;
  avgLatencyMs: number;
}

// Rate limiting configuration
export interface RateLimitConfig {
  enabled: boolean;
  maxRequestsPerSecond: number;
  maxRequestsPerMinute: number;
  burstSize: number;
}

// Circuit breaker configuration
export interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenRequests: number;
}

// Full gateway options
export interface GatewayOptions {
  rateLimit?: RateLimitConfig;
  circuitBreaker?: CircuitBreakerConfig;
  timeout?: number;
  retries?: number;
  retryDelayMs?: number;
}
