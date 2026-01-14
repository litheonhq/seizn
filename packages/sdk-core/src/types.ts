/**
 * Seizn Core SDK - Type Definitions
 *
 * A1 Drop-in Adoption Layer for Seizn AI Infrastructure.
 * These types define the wire format for retrieval operations.
 */

// ============================================
// Configuration Types
// ============================================

/**
 * Configuration options for SeiznClient
 */
export interface SeiznConfig {
  /** API key for authentication (required) */
  apiKey: string;
  /** Base URL for API requests (default: 'https://api.seizn.com') */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Maximum retry attempts for failed requests (default: 3) */
  maxRetries?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** Default collection ID for queries */
  defaultCollectionId?: string;
  /** Custom headers to include in all requests */
  customHeaders?: Record<string, string>;
}

// ============================================
// Retrieval Types
// ============================================

/**
 * Request payload for retrieval operations
 */
export interface RetrievalRequest {
  /** Natural language query string */
  query: string;
  /** Collection ID to search within (optional, uses default if not provided) */
  collectionId?: string;
  /** Number of top results to return (default: 10) */
  topK?: number;
  /** Metadata filters to apply */
  filters?: Record<string, unknown>;
  /** Whether to rerank results (default: true) */
  rerank?: boolean;
  /** Include metadata in response (default: true) */
  includeMetadata?: boolean;
  /** Custom trace metadata for observability */
  traceMetadata?: Record<string, unknown>;
  /** Minimum similarity threshold (0-1) */
  minScore?: number;
}

/**
 * Response from retrieval operations
 */
export interface RetrievalResponse {
  /** Retrieved context chunks */
  contexts: Context[];
  /** Cryptographic receipt for audit trail */
  receipt: Receipt;
  /** Unique trace ID for this request */
  traceId: string;
  /** Source citations for retrieved content */
  citations: Citation[];
  /** Request latency in milliseconds */
  latencyMs: number;
  /** Query metadata */
  queryInfo: QueryInfo;
}

/**
 * A single retrieved context chunk
 */
export interface Context {
  /** Unique identifier for this context */
  id: string;
  /** Text content of the context */
  content: string;
  /** Similarity/relevance score (0-1) */
  score: number;
  /** Optional metadata associated with this context */
  metadata?: Record<string, unknown>;
  /** Source document ID */
  sourceId?: string;
  /** Character offset in source document */
  offset?: number;
  /** Length of the context in characters */
  length?: number;
}

/**
 * Cryptographic receipt for audit and verification
 */
export interface Receipt {
  /** SHA-256 hash of the query */
  queryHash: string;
  /** SHA-256 hash of the results */
  resultHash: string;
  /** ISO 8601 timestamp of the query */
  timestamp: string;
  /** Version of the index used */
  indexVersion: string;
  /** Digital signature for verification */
  signature?: string;
  /** Receipt ID for reference */
  receiptId?: string;
}

/**
 * Citation for source attribution
 */
export interface Citation {
  /** Citation index (1-based) */
  index: number;
  /** Source document title or identifier */
  source: string;
  /** URL or URI to the source */
  url?: string;
  /** Relevant excerpt from the source */
  excerpt?: string;
  /** Page number if applicable */
  page?: number;
  /** Section or chapter reference */
  section?: string;
  /** Context IDs this citation references */
  contextIds: string[];
}

/**
 * Query metadata and statistics
 */
export interface QueryInfo {
  /** Original query string */
  originalQuery: string;
  /** Expanded/enhanced query (if rewriting was applied) */
  expandedQuery?: string;
  /** Number of documents searched */
  documentsSearched: number;
  /** Number of chunks evaluated */
  chunksEvaluated: number;
  /** Whether reranking was applied */
  rerankApplied: boolean;
  /** Model used for embeddings */
  embeddingModel: string;
}

// ============================================
// Collection Types
// ============================================

/**
 * Collection metadata
 */
export interface Collection {
  /** Unique collection identifier */
  id: string;
  /** Human-readable collection name */
  name: string;
  /** Collection description */
  description?: string;
  /** Number of documents in collection */
  documentCount: number;
  /** Number of chunks in collection */
  chunkCount: number;
  /** Embedding dimension */
  dimension: number;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Collection-specific settings */
  settings?: CollectionSettings;
}

/**
 * Collection configuration settings
 */
export interface CollectionSettings {
  /** Chunk size for documents */
  chunkSize?: number;
  /** Chunk overlap */
  chunkOverlap?: number;
  /** Default top-K for queries */
  defaultTopK?: number;
  /** Default similarity threshold */
  defaultMinScore?: number;
  /** Enable automatic reranking */
  autoRerank?: boolean;
}

// ============================================
// Document Types
// ============================================

/**
 * Document upload request
 */
export interface DocumentUploadRequest {
  /** Collection ID to upload to */
  collectionId: string;
  /** Document content (text or base64 for binary) */
  content: string;
  /** Content type (e.g., 'text/plain', 'application/pdf') */
  contentType: string;
  /** Document filename or identifier */
  filename?: string;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  /** Chunking strategy override */
  chunkingStrategy?: 'sentence' | 'paragraph' | 'fixed' | 'semantic';
}

/**
 * Document upload response
 */
export interface DocumentUploadResponse {
  /** Uploaded document ID */
  documentId: string;
  /** Number of chunks created */
  chunkCount: number;
  /** Processing status */
  status: 'processing' | 'completed' | 'failed';
  /** Processing message */
  message?: string;
}

// ============================================
// Trace Types
// ============================================

/**
 * Trace context for distributed tracing
 */
export interface TraceContext {
  /** Unique trace identifier */
  traceId: string;
  /** Span identifier within the trace */
  spanId: string;
  /** Parent span identifier */
  parentSpanId?: string;
  /** Trace sampling decision */
  sampled: boolean;
  /** Custom baggage items */
  baggage?: Record<string, string>;
}

/**
 * Span for tracing operations
 */
export interface Span {
  /** Span name/operation */
  name: string;
  /** Start timestamp */
  startTime: number;
  /** End timestamp */
  endTime?: number;
  /** Span attributes */
  attributes?: Record<string, unknown>;
  /** Span events */
  events?: SpanEvent[];
  /** Span status */
  status: 'ok' | 'error' | 'unset';
}

/**
 * Event within a span
 */
export interface SpanEvent {
  /** Event name */
  name: string;
  /** Event timestamp */
  timestamp: number;
  /** Event attributes */
  attributes?: Record<string, unknown>;
}

// ============================================
// Error Types
// ============================================

/**
 * Error codes for SDK operations
 */
export type SeiznErrorCode =
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND_ERROR'
  | 'TIMEOUT_ERROR'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Structured error information
 */
export interface SeiznErrorInfo {
  /** Error code */
  code: SeiznErrorCode;
  /** Human-readable error message */
  message: string;
  /** HTTP status code if applicable */
  statusCode?: number;
  /** Request ID for debugging */
  requestId?: string;
  /** Additional error details */
  details?: Record<string, unknown>;
  /** Retry-after seconds (for rate limiting) */
  retryAfter?: number;
}

// ============================================
// Health Check Types
// ============================================

/**
 * API health status response
 */
export interface HealthStatus {
  /** Overall health status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** API version */
  version: string;
  /** Timestamp of health check */
  timestamp: string;
  /** Component health statuses */
  components?: Record<string, ComponentHealth>;
}

/**
 * Individual component health
 */
export interface ComponentHealth {
  /** Component status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Component latency in ms */
  latencyMs?: number;
  /** Additional component info */
  details?: Record<string, unknown>;
}
