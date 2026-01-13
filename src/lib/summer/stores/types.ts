/**
 * BYO (Bring Your Own) Vector Store Types
 *
 * Common interfaces for customer-provided vector databases.
 * Supports Pinecone, Weaviate, Qdrant, and extensible to other providers.
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * A single vector with associated metadata
 */
export interface VectorRecord {
  id: string;
  vector: number[];
  metadata?: Record<string, unknown>;
  content?: string;
}

/**
 * Search result from a vector query
 */
export interface VectorSearchResult {
  id: string;
  score: number;
  vector?: number[];
  metadata?: Record<string, unknown>;
  content?: string;
}

/**
 * Options for vector search operations
 */
export interface VectorSearchOptions {
  /** The query vector */
  vector: number[];
  /** Number of results to return (default: 10) */
  topK?: number;
  /** Metadata filters */
  filter?: VectorFilter;
  /** Include vector values in response */
  includeVectors?: boolean;
  /** Include metadata in response */
  includeMetadata?: boolean;
  /** Namespace/collection partition */
  namespace?: string;
}

/**
 * Filter conditions for vector queries
 */
export interface VectorFilter {
  /** AND conditions */
  $and?: VectorFilter[];
  /** OR conditions */
  $or?: VectorFilter[];
  /** NOT condition */
  $not?: VectorFilter;
  /** Field-level conditions */
  [field: string]: unknown;
}

/**
 * Field-level filter operators
 */
export interface FieldFilter {
  $eq?: unknown;
  $ne?: unknown;
  $gt?: number;
  $gte?: number;
  $lt?: number;
  $lte?: number;
  $in?: unknown[];
  $nin?: unknown[];
  $exists?: boolean;
  $contains?: string;
  $startsWith?: string;
}

// ============================================================================
// Store Configuration
// ============================================================================

export type VectorStoreProvider = 'pinecone' | 'weaviate' | 'qdrant' | 'supabase' | 'custom';

/**
 * Base configuration for all vector stores
 */
export interface BaseStoreConfig {
  provider: VectorStoreProvider;
  /** Display name for this store */
  name?: string;
  /** Connection timeout in ms (default: 30000) */
  timeout?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Retry configuration */
  retry?: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
  };
}

/**
 * Pinecone-specific configuration
 */
export interface PineconeStoreConfig extends BaseStoreConfig {
  provider: 'pinecone';
  apiKey: string;
  /** Pinecone host URL (e.g., "index-name-project.svc.region.pinecone.io") */
  host: string;
  /** Default namespace for operations */
  namespace?: string;
}

/**
 * Weaviate-specific configuration
 */
export interface WeaviateStoreConfig extends BaseStoreConfig {
  provider: 'weaviate';
  /** Weaviate host (e.g., "localhost:8080" or "my-cluster.weaviate.cloud") */
  host: string;
  /** HTTP scheme (default: "https") */
  scheme?: 'http' | 'https';
  /** API key for authentication */
  apiKey?: string;
  /** Class name for vectors */
  className: string;
  /** Tenant for multi-tenancy */
  tenant?: string;
}

/**
 * Qdrant-specific configuration
 */
export interface QdrantStoreConfig extends BaseStoreConfig {
  provider: 'qdrant';
  /** Qdrant URL (e.g., "http://localhost:6333" or "https://xxx.qdrant.io") */
  url: string;
  /** API key for cloud deployments */
  apiKey?: string;
  /** Collection name */
  collectionName: string;
}

/**
 * Supabase pgvector configuration
 */
export interface SupabaseStoreConfig extends BaseStoreConfig {
  provider: 'supabase';
  /** Supabase project URL */
  url: string;
  /** Supabase service role key */
  serviceKey: string;
  /** Table name for vectors */
  tableName: string;
  /** Column name for embeddings */
  embeddingColumn?: string;
  /** Column name for content */
  contentColumn?: string;
}

/**
 * Custom store configuration for user-implemented stores
 */
export interface CustomStoreConfig extends BaseStoreConfig {
  provider: 'custom';
  /** Custom configuration options */
  options: Record<string, unknown>;
}

export type VectorStoreConfig =
  | PineconeStoreConfig
  | WeaviateStoreConfig
  | QdrantStoreConfig
  | SupabaseStoreConfig
  | CustomStoreConfig;

// ============================================================================
// Store Interface
// ============================================================================

/**
 * Common interface for all vector stores
 */
export interface VectorStore {
  /** Provider name */
  readonly provider: VectorStoreProvider;
  /** Store display name */
  readonly name: string;

  // Lifecycle
  /**
   * Initialize connection to the store
   */
  connect(): Promise<void>;

  /**
   * Close connection and cleanup resources
   */
  disconnect(): Promise<void>;

  /**
   * Check if store is connected and healthy
   */
  healthCheck(): Promise<HealthCheckResult>;

  // CRUD Operations
  /**
   * Insert or update vectors
   * @param records - Vectors to upsert
   * @param namespace - Optional namespace/partition
   * @returns Number of vectors upserted
   */
  upsert(records: VectorRecord[], namespace?: string): Promise<UpsertResult>;

  /**
   * Search for similar vectors
   * @param options - Search options
   * @returns Matching vectors with scores
   */
  search(options: VectorSearchOptions): Promise<SearchResponse>;

  /**
   * Delete vectors by ID
   * @param ids - IDs to delete
   * @param namespace - Optional namespace/partition
   * @returns Number of vectors deleted
   */
  delete(ids: string[], namespace?: string): Promise<DeleteResult>;

  /**
   * Delete vectors matching a filter
   * @param filter - Filter conditions
   * @param namespace - Optional namespace/partition
   * @returns Number of vectors deleted
   */
  deleteByFilter?(filter: VectorFilter, namespace?: string): Promise<DeleteResult>;

  /**
   * Fetch vectors by ID
   * @param ids - IDs to fetch
   * @param namespace - Optional namespace/partition
   * @returns Fetched vectors
   */
  fetch?(ids: string[], namespace?: string): Promise<FetchResult>;

  /**
   * Get collection/index statistics
   */
  stats?(): Promise<StoreStats>;
}

// ============================================================================
// Response Types
// ============================================================================

export interface HealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface UpsertResult {
  upsertedCount: number;
  /** IDs of upserted vectors (if available) */
  upsertedIds?: string[];
}

export interface SearchResponse {
  results: VectorSearchResult[];
  latencyMs: number;
  /** Namespace searched */
  namespace?: string;
}

export interface DeleteResult {
  deletedCount: number;
}

export interface FetchResult {
  records: VectorRecord[];
  /** IDs that were not found */
  missingIds?: string[];
}

export interface StoreStats {
  /** Total number of vectors */
  totalVectors: number;
  /** Dimension of vectors */
  dimension?: number;
  /** Index fullness (0-1) for capacity-limited stores */
  indexFullness?: number;
  /** Stats per namespace */
  namespaces?: Record<string, { vectorCount: number }>;
  /** Provider-specific stats */
  raw?: Record<string, unknown>;
}

// ============================================================================
// Error Types
// ============================================================================

export class VectorStoreError extends Error {
  constructor(
    message: string,
    public readonly code: VectorStoreErrorCode,
    public readonly provider: VectorStoreProvider,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'VectorStoreError';
  }
}

export type VectorStoreErrorCode =
  | 'CONNECTION_FAILED'
  | 'AUTHENTICATION_FAILED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'INVALID_DIMENSION'
  | 'INVALID_FILTER'
  | 'TIMEOUT'
  | 'INTERNAL_ERROR'
  | 'NOT_CONNECTED';
