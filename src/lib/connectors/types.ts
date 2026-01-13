/**
 * Federated Connector Types
 *
 * Common types for vector database connectors
 */

export interface VectorDocument {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  score?: number;
  source: string; // Which connector returned this
}

export interface SearchOptions {
  query: string;
  embedding?: number[];
  topK?: number;
  filter?: Record<string, unknown>;
  namespace?: string;
  includeMetadata?: boolean;
  includeValues?: boolean;
}

export interface SearchResult {
  documents: VectorDocument[];
  latency_ms: number;
  source: string;
  error?: string;
}

export interface ConnectorConfig {
  type: 'pinecone' | 'weaviate' | 'qdrant' | 'milvus' | 'supabase';
  name: string;
  enabled: boolean;
  priority: number; // Lower = higher priority
  weight: number; // For result merging (0-1)
  config: Record<string, unknown>;
}

export interface PineconeConfig extends ConnectorConfig {
  type: 'pinecone';
  config: {
    apiKey: string;
    environment: string;
    indexName: string;
    namespace?: string;
  };
}

export interface WeaviateConfig extends ConnectorConfig {
  type: 'weaviate';
  config: {
    host: string;
    apiKey?: string;
    scheme: 'http' | 'https';
    className: string;
    tenant?: string;
  };
}

export interface QdrantConfig extends ConnectorConfig {
  type: 'qdrant';
  config: {
    url: string;
    apiKey?: string;
    collectionName: string;
  };
}

export interface SupabaseVectorConfig extends ConnectorConfig {
  type: 'supabase';
  config: {
    url: string;
    anonKey: string;
    tableName: string;
    embeddingColumn: string;
    contentColumn: string;
  };
}

export type AnyConnectorConfig =
  | PineconeConfig
  | WeaviateConfig
  | QdrantConfig
  | SupabaseVectorConfig;

export interface VectorConnector {
  readonly name: string;
  readonly type: string;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  search(options: SearchOptions): Promise<SearchResult>;
  upsert(documents: VectorDocument[]): Promise<{ count: number }>;
  delete(ids: string[]): Promise<{ count: number }>;

  healthCheck(): Promise<{ healthy: boolean; latency_ms: number }>;
}

export interface FederatedSearchOptions extends SearchOptions {
  sources?: string[]; // Filter to specific connectors
  mergeStrategy?: 'interleave' | 'append' | 'weighted';
  deduplicateBy?: 'id' | 'content' | 'similarity';
  timeout_ms?: number;
}

export interface FederatedSearchResult {
  documents: VectorDocument[];
  sources: {
    [name: string]: {
      count: number;
      latency_ms: number;
      error?: string;
    };
  };
  total_latency_ms: number;
  merge_strategy: string;
}
