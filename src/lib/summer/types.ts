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
    compression?: number;
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

/** Compression options for retrieval */
export interface CompressionParams {
  /** Enable context compression (default: false) */
  enabled: boolean;
  /** Target compression ratio (0.1 to 1.0, default: 0.5) */
  target_ratio?: number;
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

  /** Context compression options */
  compression?: CompressionParams;
}

export interface RetrieveResponse {
  results: VectorSearchResult[];
  config: RetrievalConfig;
  trace?: RetrievalTrace;
  /** Query receipt with cost/execution/evidence breakdown */
  receipt?: import('@/lib/retrieval/receipt').QueryReceipt;
  /** Compressed context chunks (if compression enabled) */
  compressed?: import('@/lib/compression').CompressedChunk[];
  /** Compression statistics (if compression enabled) */
  compressionStats?: import('@/lib/compression').CompressionTraceStats;
}

// ============================================
// Indexing Types
// ============================================

/**
 * Chunking strategy for document processing
 * - sliding_window: Fixed size chunks with overlap (default)
 * - sentence: Split by sentences, pack into chunks
 * - paragraph: Split by paragraphs
 * - semantic: Semantic-aware chunking with boundary detection
 */
export type ChunkingStrategy = 'sliding_window' | 'sentence' | 'paragraph' | 'semantic';

/**
 * Embedding model options for indexing
 */
export type EmbeddingModel = 'voyage-3' | 'voyage-3-lite' | 'voyage-code-3' | 'voyage-finance-2';

/**
 * Document input for indexing API
 */
export interface IndexDocumentInput {
  /** Unique identifier for the document (optional, for upsert behavior) */
  id?: string;
  /** Document content to be indexed */
  content: string;
  /** Document metadata (searchable and returned with results) */
  metadata?: Record<string, unknown>;
  /** Document title (stored separately for display) */
  title?: string;
  /** Source URL or identifier */
  source?: string;
  /** MIME type of the original document */
  mime_type?: string;
}

/**
 * Options for the indexing process
 */
export interface IndexingOptions {
  /** Chunking strategy (default: sliding_window) */
  chunking_strategy?: ChunkingStrategy;
  /** Maximum tokens per chunk (default: 512) */
  chunk_size?: number;
  /** Overlap between chunks in tokens (default: 64) */
  chunk_overlap?: number;
  /** Embedding model to use (default: voyage-3) */
  embedding_model?: EmbeddingModel;
  /** Skip duplicate detection based on content hash */
  skip_duplicates?: boolean;
}

/**
 * Request body for POST /api/summer/index
 */
export interface IndexRequest {
  /** Collection ID to index documents into */
  collection_id: string;
  /** Array of documents to index */
  documents: IndexDocumentInput[];
  /** Indexing options */
  options?: IndexingOptions;
}

/**
 * Response from POST /api/summer/index
 */
export interface IndexResponse {
  success: boolean;
  /** Number of documents successfully indexed */
  indexed_count: number;
  /** Total number of chunks created */
  chunks_created: number;
  /** Processing duration in milliseconds */
  duration_ms: number;
  /** Per-document results */
  results?: IndexDocumentResult[];
}

/**
 * Result for a single document indexing operation
 */
export interface IndexDocumentResult {
  /** Document ID (assigned or provided) */
  document_id: string;
  /** External ID if provided */
  external_id?: string;
  /** Number of chunks created for this document */
  chunk_count: number;
  /** Status of the operation */
  status: 'created' | 'updated' | 'skipped' | 'error';
  /** Error message if status is 'error' */
  error?: string;
}

/**
 * Internal chunk representation after chunking
 */
export interface ProcessedChunk {
  /** Chunk index within the document */
  index: number;
  /** Chunk text content */
  content: string;
  /** Estimated token count */
  token_count: number;
  /** Start character offset in original document */
  start_offset: number;
  /** End character offset in original document */
  end_offset: number;
  /** Chunk-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Chunk with embedding ready for storage
 */
export interface IndexedChunk extends ProcessedChunk {
  /** Document ID this chunk belongs to */
  document_id: string;
  /** Embedding vector */
  embedding: number[];
}
