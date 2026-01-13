/**
 * Seizn Relay Agent - Type Definitions
 */

// ============================================
// Protocol Types (mirrored from Seizn cloud)
// ============================================

export const RELAY_PROTOCOL_VERSION = '1.0' as const;

export type RelayAction = 'retrieve' | 'health' | 'capabilities';

export interface RelayProtocolRequest {
  version: typeof RELAY_PROTOCOL_VERSION;
  requestId: string;
  action: RelayAction;
  payload?: RetrievePayload | HealthPayload | CapabilitiesPayload;
  timestamp: string;
  signature?: string;
}

export interface RetrievePayload {
  query: string;
  queryEmbedding?: number[];
  collectionId?: string;
  topK?: number;
  filters?: Record<string, unknown>;
  includeContent?: boolean;
  maxSnippetLength?: number;
}

export interface HealthPayload {
  detailed?: boolean;
}

export interface CapabilitiesPayload {
  capability?: string;
}

export interface RelayProtocolResponse {
  version: typeof RELAY_PROTOCOL_VERSION;
  requestId: string;
  status: 'success' | 'error';
  payload?: RetrieveResult | HealthResult | CapabilitiesResult;
  error?: RelayError;
  latencyMs: number;
  timestamp: string;
}

export interface RetrieveResult {
  results: RelaySearchResult[];
  totalFound: number;
  collectionId?: string;
}

export interface RelaySearchResult {
  chunkId: string;
  documentId: string;
  score: number;
  snippet?: string;
  metadata?: Record<string, unknown>;
  title?: string;
  source?: string;
}

export interface HealthResult {
  healthy: boolean;
  version: string;
  uptimeSeconds: number;
  collections: string[];
  vectorDbStatus: 'connected' | 'disconnected' | 'error';
  diagnostics?: RelayDiagnostics;
}

export interface RelayDiagnostics {
  memoryUsageMb: number;
  cpuUsagePercent: number;
  activeConnections: number;
  pendingRequests: number;
  lastQueryAt?: string;
  vectorDb?: {
    type: string;
    version?: string;
    indexCount?: number;
    totalVectors?: number;
  };
}

export interface CapabilitiesResult {
  actions: RelayAction[];
  embeddingDimensions: number[];
  supportedFilters: string[];
  maxBatchSize: number;
  maxTopK: number;
  vectorDbType: string;
  metadata?: Record<string, unknown>;
}

export type RelayErrorCode =
  | 'INVALID_REQUEST'
  | 'AUTHENTICATION_FAILED'
  | 'COLLECTION_NOT_FOUND'
  | 'VECTOR_DB_ERROR'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface RelayError {
  code: RelayErrorCode;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
}

// ============================================
// Configuration Types
// ============================================

export interface RelayAgentConfig {
  /** Seizn cloud callback URL */
  seiznCallbackUrl: string;
  /** Agent key for authentication */
  agentKey: string;
  /** Collections this relay serves */
  collections: string[];
  /** Port to listen on (for direct mode) */
  port: number;
  /** Enable direct mode (Seizn calls relay) */
  directMode: boolean;
  /** Heartbeat interval in milliseconds */
  heartbeatIntervalMs: number;
  /** Log level */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface VectorSearchConfig {
  /** Vector database type */
  type: 'pgvector' | 'qdrant' | 'pinecone' | 'weaviate' | 'milvus' | 'chroma';
  /** Connection string or config */
  connectionString?: string;
  /** Host (for HTTP-based DBs) */
  host?: string;
  /** Port */
  port?: number;
  /** API key (if required) */
  apiKey?: string;
  /** Default collection/index name */
  defaultCollection?: string;
  /** Embedding dimensions */
  dimensions: number;
}

// ============================================
// Vector Store Interface
// ============================================

export interface VectorStore {
  /** Connect to the vector database */
  connect(): Promise<void>;

  /** Disconnect from the vector database */
  disconnect(): Promise<void>;

  /** Check if connected */
  isConnected(): boolean;

  /** Search for similar vectors */
  search(params: VectorSearchParams): Promise<VectorSearchResultInternal[]>;

  /** Get store info */
  getInfo(): Promise<VectorStoreInfo>;

  /** List available collections */
  listCollections(): Promise<string[]>;
}

export interface VectorSearchParams {
  collectionId: string;
  queryEmbedding: number[];
  topK: number;
  filters?: Record<string, unknown>;
  threshold?: number;
}

export interface VectorSearchResultInternal {
  id: string;
  documentId: string;
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface VectorStoreInfo {
  type: string;
  version?: string;
  indexCount?: number;
  totalVectors?: number;
}
