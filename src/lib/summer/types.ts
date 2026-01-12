/**
 * Seizn Summer (RAG Stack) - Core Types
 *
 * Design goals:
 * - Provider-agnostic (Embedding / Rerank / Vector store)
 * - Works in managed mode (Supabase/pgvector) and federated mode (remote agents)
 * - Stable wire types for SDKs
 */

export type EmbeddingInputType = 'document' | 'query';

export interface EmbeddingProvider {
  /** Provider identifier (e.g. "voyage", "openai") */
  id: string;
  /** Default embedding dimensions */
  dimensions: number;
  /**
   * Create embeddings for a batch of texts.
   * Implementations should keep ordering identical to input.
   */
  embed(texts: string[], inputType: EmbeddingInputType): Promise<number[][]>;
}

export interface RerankDocument {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface RerankResult {
  id: string;
  /** Higher is better. Score scale depends on provider. */
  score: number;
  /** Index of the document in the input array */
  index: number;
}

export interface RerankProvider {
  id: string;
  /**
   * Rerank a list of documents for the query.
   * Return results sorted by score desc.
   */
  rerank(query: string, documents: RerankDocument[], options?: { topN?: number }): Promise<RerankResult[]>;
}

export type RetrievalMode = 'vector' | 'keyword' | 'hybrid';

export interface VectorSearchResult {
  chunkId: string;
  documentId: string;
  text: string;
  metadata: Record<string, unknown>;
  similarity: number; // 0..1 (cosine similarity)
  keywordRank?: number;
  combinedScore?: number;
  /** Source tag ("managed" | "federated:<id>" | "agent:<id>" etc) */
  source?: string;
}

export interface VectorStore {
  id: string;

  search(params: {
    userId: string;
    collectionId: string;
    queryEmbedding: number[];
    topK: number;
    threshold?: number;
    searchEf?: number;
  }): Promise<VectorSearchResult[]>;

  keywordSearch(params: {
    userId: string;
    collectionId: string;
    queryText: string;
    topK: number;
  }): Promise<VectorSearchResult[]>;

  hybridSearch(params: {
    userId: string;
    collectionId: string;
    queryText: string;
    queryEmbedding: number[];
    topK: number;
    threshold?: number;
    keywordWeight?: number;
    vectorWeight?: number;
    searchEf?: number;
  }): Promise<VectorSearchResult[]>;
}

export interface RetrievalConfig {
  mode: RetrievalMode;
  topK: number;
  threshold: number;
  searchEf: number;
  rerank: boolean;
  rerankTopN: number;
  keywordWeight: number;
  vectorWeight: number;
}

export interface RetrievalExperimentInfo {
  experimentId: string;
  armId: string;
  armName: string;
}

export interface RetrievalTrace {
  requestId: string;
  startedAt: string;
  timingsMs: {
    embedQuery?: number;
    vectorSearch?: number;
    rerank?: number;
    total?: number;
  };
  autopilot: {
    enabled: boolean;
    reason: string;
    effectiveConfig: RetrievalConfig;
  };
  experiment?: RetrievalExperimentInfo;
  /** For joining feedback without exposing DB ids */
  sampled?: boolean;
}

export interface RetrieveParams {
  userId: string;
  apiKeyId?: string;

  plan: string;
  collectionId: string;
  query: string;

  autopilot?: boolean;
  override?: Partial<RetrievalConfig>;

  /** Enable federated retrieval for this collection (if bindings exist) */
  federated?: boolean;

  /** Optional: force a specific experiment (otherwise uses latest running) */
  experimentId?: string;

  includeTrace?: boolean;
}

export interface RetrieveResponse {
  results: VectorSearchResult[];
  config: RetrievalConfig;
  trace?: RetrievalTrace;
}
