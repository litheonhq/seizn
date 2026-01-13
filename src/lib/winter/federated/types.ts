/**
 * Seizn Winter - Federated Graph Types
 *
 * Types for federated data source management, multi-source queries,
 * and cross-source data aggregation.
 */

// ============================================
// Source Provider Types
// ============================================

/**
 * Supported federated source providers
 */
export type FederatedSourceProvider =
  | 'supabase'
  | 'pinecone'
  | 'weaviate'
  | 'qdrant'
  | 'milvus'
  | 'azure_ai_search'
  | 'elasticsearch'
  | 'opensearch'
  | 'vespa'
  | 'http_api'
  | 'graphql'
  | 'custom';

/**
 * Source capabilities
 */
export interface SourceCapabilities {
  /** Supports vector similarity search */
  vector: boolean;
  /** Supports keyword/text search */
  keyword: boolean;
  /** Supports hybrid search */
  hybrid: boolean;
  /** Supports filtering */
  filter: boolean;
  /** Supports aggregations */
  aggregations: boolean;
  /** Supports real-time updates */
  realtime: boolean;
  /** Supports transactions */
  transactions: boolean;
  /** Maximum query size */
  maxQuerySize?: number;
  /** Maximum result size */
  maxResultSize?: number;
}

/**
 * Source health status
 */
export type SourceHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/**
 * Source connection status
 */
export type SourceConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

// ============================================
// Federated Source Configuration
// ============================================

/**
 * Base configuration for all federated sources
 */
export interface FederatedSourceBase {
  /** Unique source identifier */
  id: string;
  /** Display name */
  name: string;
  /** Source description */
  description?: string;
  /** Provider type */
  provider: FederatedSourceProvider;
  /** Whether this source is enabled */
  enabled: boolean;
  /** Priority for result ordering (lower = higher priority) */
  priority: number;
  /** Weight for result merging (0-1) */
  weight: number;
  /** Source capabilities */
  capabilities: SourceCapabilities;
  /** Connection status */
  connectionStatus: SourceConnectionStatus;
  /** Health status */
  healthStatus: SourceHealthStatus;
  /** Last health check timestamp */
  lastHealthCheck?: string;
  /** Average latency in ms */
  avgLatencyMs?: number;
  /** Tags for categorization */
  tags?: string[];
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  /** Created timestamp */
  createdAt: string;
  /** Updated timestamp */
  updatedAt: string;
}

/**
 * Federated source with provider-specific configuration
 */
export interface FederatedSource extends FederatedSourceBase {
  /** Provider-specific configuration (encrypted in storage) */
  config: FederatedSourceConfig;
}

/**
 * Provider-specific configuration union type
 */
export type FederatedSourceConfig =
  | SupabaseSourceConfig
  | PineconeSourceConfig
  | WeaviateSourceConfig
  | QdrantSourceConfig
  | HttpApiSourceConfig
  | GraphQLSourceConfig
  | CustomSourceConfig;

/**
 * Supabase source configuration
 */
export interface SupabaseSourceConfig {
  provider: 'supabase';
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
  tableName: string;
  embeddingColumn: string;
  contentColumn: string;
  metadataColumns?: string[];
}

/**
 * Pinecone source configuration
 */
export interface PineconeSourceConfig {
  provider: 'pinecone';
  apiKey: string;
  environment: string;
  indexName: string;
  namespace?: string;
  projectId?: string;
}

/**
 * Weaviate source configuration
 */
export interface WeaviateSourceConfig {
  provider: 'weaviate';
  host: string;
  scheme: 'http' | 'https';
  apiKey?: string;
  className: string;
  tenant?: string;
}

/**
 * Qdrant source configuration
 */
export interface QdrantSourceConfig {
  provider: 'qdrant';
  url: string;
  apiKey?: string;
  collectionName: string;
  grpcPort?: number;
}

/**
 * HTTP API source configuration
 */
export interface HttpApiSourceConfig {
  provider: 'http_api';
  baseUrl: string;
  searchEndpoint: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  auth?: {
    type: 'bearer' | 'api_key' | 'basic';
    token?: string;
    username?: string;
    password?: string;
    headerName?: string;
  };
  requestTransform?: string; // JSONata or JavaScript expression
  responseTransform?: string;
  timeout?: number;
}

/**
 * GraphQL source configuration
 */
export interface GraphQLSourceConfig {
  provider: 'graphql';
  endpoint: string;
  headers?: Record<string, string>;
  queryTemplate: string;
  variables?: Record<string, unknown>;
  auth?: {
    type: 'bearer' | 'api_key';
    token?: string;
    headerName?: string;
  };
}

/**
 * Custom source configuration
 */
export interface CustomSourceConfig {
  provider: 'custom';
  connectionString?: string;
  config: Record<string, unknown>;
}

// ============================================
// Federated Query Types
// ============================================

/**
 * Query execution mode
 */
export type QueryExecutionMode = 'parallel' | 'sequential' | 'adaptive';

/**
 * Result merge strategy
 */
export type MergeStrategy =
  | 'interleave'      // Round-robin from each source
  | 'append'          // Concatenate results
  | 'weighted'        // Sort by weighted scores
  | 'reciprocal_rank' // Reciprocal rank fusion
  | 'custom';         // Custom merge function

/**
 * Deduplication strategy
 */
export type DeduplicationStrategy =
  | 'none'
  | 'id'              // By document ID
  | 'content_hash'    // By content hash
  | 'similarity'      // By similarity threshold
  | 'exact_match';    // By exact content match

/**
 * Federated query request
 */
export interface FederatedQuery {
  /** Query text */
  query: string;
  /** Pre-computed query embedding (optional) */
  embedding?: number[];
  /** Number of results to return */
  topK: number;
  /** Minimum score threshold */
  threshold?: number;
  /** Specific sources to query (empty = all enabled) */
  sources?: string[];
  /** Query execution mode */
  executionMode?: QueryExecutionMode;
  /** Result merge strategy */
  mergeStrategy?: MergeStrategy;
  /** Deduplication strategy */
  deduplicationStrategy?: DeduplicationStrategy;
  /** Filters to apply */
  filter?: FederatedQueryFilter;
  /** Timeout per source in ms */
  sourceTimeoutMs?: number;
  /** Total query timeout in ms */
  totalTimeoutMs?: number;
  /** Include source metadata in results */
  includeSourceMetadata?: boolean;
  /** Include debug information */
  debug?: boolean;
}

/**
 * Query filter that can be applied across sources
 */
export interface FederatedQueryFilter {
  /** Filter by metadata fields */
  metadata?: Record<string, unknown>;
  /** Date range filter */
  dateRange?: {
    field: string;
    start?: string;
    end?: string;
  };
  /** Include only specific document IDs */
  documentIds?: string[];
  /** Exclude specific document IDs */
  excludeDocumentIds?: string[];
  /** Custom filter expression (source-specific) */
  custom?: Record<string, unknown>;
}

// ============================================
// Federated Query Result Types
// ============================================

/**
 * Single result item from federated query
 */
export interface FederatedResultItem {
  /** Unique result identifier */
  id: string;
  /** Document/chunk ID from source */
  documentId: string;
  /** Content text */
  content: string;
  /** Result score (0-1 normalized) */
  score: number;
  /** Original score from source */
  rawScore?: number;
  /** Source identifier */
  sourceId: string;
  /** Source name */
  sourceName: string;
  /** Rank within source results */
  sourceRank: number;
  /** Document metadata */
  metadata: Record<string, unknown>;
  /** Highlighting information */
  highlights?: ResultHighlight[];
}

/**
 * Highlight information for search results
 */
export interface ResultHighlight {
  field: string;
  snippets: string[];
  offsets?: Array<{ start: number; end: number }>;
}

/**
 * Per-source query result summary
 */
export interface SourceQueryResult {
  /** Source identifier */
  sourceId: string;
  /** Source name */
  sourceName: string;
  /** Number of results returned */
  resultCount: number;
  /** Query latency in ms */
  latencyMs: number;
  /** Whether the query succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Warnings from the source */
  warnings?: string[];
}

/**
 * Complete federated query response
 */
export interface FederatedQueryResponse {
  /** Query success status */
  success: boolean;
  /** Merged and ranked results */
  results: FederatedResultItem[];
  /** Total number of results before pagination */
  totalCount: number;
  /** Per-source query summaries */
  sources: SourceQueryResult[];
  /** Total query latency in ms */
  totalLatencyMs: number;
  /** Merge strategy used */
  mergeStrategy: MergeStrategy;
  /** Number of duplicates removed */
  duplicatesRemoved: number;
  /** Debug information if requested */
  debug?: FederatedQueryDebug;
}

/**
 * Debug information for federated queries
 */
export interface FederatedQueryDebug {
  /** Original query */
  originalQuery: string;
  /** Query embedding dimensions */
  embeddingDimensions?: number;
  /** Per-source raw results before merge */
  rawResults: Record<string, FederatedResultItem[]>;
  /** Merge operation details */
  mergeDetails: {
    strategy: MergeStrategy;
    inputCount: number;
    outputCount: number;
    deduplicationMatches: number;
  };
  /** Timing breakdown */
  timings: {
    embeddingMs?: number;
    queryDispatchMs: number;
    mergeMs: number;
    totalMs: number;
  };
}

// ============================================
// Source Management Types
// ============================================

/**
 * Request to create a new federated source
 */
export interface CreateSourceRequest {
  name: string;
  description?: string;
  provider: FederatedSourceProvider;
  config: FederatedSourceConfig;
  enabled?: boolean;
  priority?: number;
  weight?: number;
  tags?: string[];
}

/**
 * Request to update a federated source
 */
export interface UpdateSourceRequest {
  name?: string;
  description?: string;
  config?: Partial<FederatedSourceConfig>;
  enabled?: boolean;
  priority?: number;
  weight?: number;
  tags?: string[];
}

/**
 * Source health check result
 */
export interface SourceHealthCheckResult {
  sourceId: string;
  status: SourceHealthStatus;
  latencyMs: number;
  message?: string;
  checkedAt: string;
  details?: Record<string, unknown>;
}

/**
 * Source statistics
 */
export interface SourceStatistics {
  sourceId: string;
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  lastQueryAt?: string;
  period: {
    start: string;
    end: string;
  };
}
