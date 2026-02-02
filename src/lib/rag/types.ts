/**
 * Summer RAG Types
 *
 * Types for the RAG (Retrieval-Augmented Generation) system.
 */

// ============================================
// Collection Types
// ============================================

export interface RAGCollection {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  embeddingModel: EmbeddingModel;
  embeddingDimension: number;
  chunkingStrategy: ChunkingStrategy;
  metadata?: Record<string, unknown>;
  documentCount: number;
  chunkCount: number;
  status: CollectionStatus;
  createdAt: string;
  updatedAt: string;
}

export type CollectionStatus = 'active' | 'indexing' | 'error' | 'archived';

export type EmbeddingModel =
  | 'text-embedding-3-small'
  | 'text-embedding-3-large'
  | 'text-embedding-ada-002'
  | 'voyage-large-2'
  | 'voyage-code-2'
  | 'cohere-embed-english-v3.0'
  | 'cohere-embed-multilingual-v3.0'
  | 'bge-large-en-v1.5'
  | 'custom';

export const EMBEDDING_DIMENSIONS: Record<EmbeddingModel, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
  'voyage-large-2': 1536,
  'voyage-code-2': 1536,
  'cohere-embed-english-v3.0': 1024,
  'cohere-embed-multilingual-v3.0': 1024,
  'bge-large-en-v1.5': 1024,
  'custom': 0, // User-defined
};

export interface ChunkingStrategy {
  type: 'fixed' | 'semantic' | 'recursive' | 'sentence' | 'paragraph' | 'custom';
  chunkSize: number;
  chunkOverlap: number;
  separators?: string[];
  minChunkSize?: number;
  maxChunkSize?: number;
}

export const DEFAULT_CHUNKING: ChunkingStrategy = {
  type: 'recursive',
  chunkSize: 1000,
  chunkOverlap: 200,
  separators: ['\n\n', '\n', '. ', ' '],
  minChunkSize: 100,
  maxChunkSize: 2000,
};

// ============================================
// Document Types
// ============================================

export interface RAGDocument {
  id: string;
  collectionId: string;
  sourceType: DocumentSourceType;
  sourceUrl?: string;
  filename?: string;
  mimeType?: string;
  content: string;
  metadata?: Record<string, unknown>;
  chunkCount: number;
  status: DocumentStatus;
  processingError?: string;
  createdAt: string;
  updatedAt: string;
}

export type DocumentSourceType = 'upload' | 'url' | 'api' | 'text' | 'github' | 'notion' | 'confluence';

export type DocumentStatus = 'pending' | 'processing' | 'indexed' | 'failed';

export interface DocumentUpload {
  content?: string;
  file?: {
    name: string;
    type: string;
    data: string; // Base64
  };
  url?: string;
  sourceType: DocumentSourceType;
  metadata?: Record<string, unknown>;
}

// ============================================
// Chunk Types
// ============================================

export interface RAGChunk {
  id: string;
  documentId: string;
  collectionId: string;
  content: string;
  embedding?: number[];
  chunkIndex: number;
  startOffset: number;
  endOffset: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ============================================
// Index Types
// ============================================

export interface IndexJob {
  id: string;
  collectionId: string;
  documentIds: string[];
  status: IndexJobStatus;
  progress: number; // 0-100
  totalChunks: number;
  processedChunks: number;
  failedChunks: number;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

export type IndexJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface IndexOptions {
  forceReindex?: boolean;
  batchSize?: number;
  parallelism?: number;
  webhookUrl?: string;
}

// ============================================
// Retrieval Types
// ============================================

export interface RetrieveRequest {
  query: string;
  collectionIds?: string[];
  topK?: number;
  minScore?: number;
  filter?: RetrieveFilter;
  reranker?: RerankerConfig;
  hybridSearch?: HybridSearchConfig;
  includeMetadata?: boolean;
  includeContent?: boolean;
}

export interface RetrieveFilter {
  documentIds?: string[];
  metadata?: Record<string, unknown>;
  dateRange?: {
    field: string;
    from?: string;
    to?: string;
  };
}

export interface RerankerConfig {
  model: 'cohere-rerank-v3' | 'cross-encoder' | 'none';
  topN?: number;
}

export interface HybridSearchConfig {
  enabled: boolean;
  alpha?: number; // 0 = pure keyword, 1 = pure semantic
  keywordWeight?: number;
  semanticWeight?: number;
}

export interface RetrieveResult {
  chunks: RetrievedChunk[];
  query: string;
  totalResults: number;
  searchTimeMs: number;
  reranked: boolean;
}

export interface RetrievedChunk {
  id: string;
  documentId: string;
  collectionId: string;
  content: string;
  score: number;
  rerankScore?: number;
  metadata?: Record<string, unknown>;
  document?: {
    id: string;
    filename?: string;
    sourceUrl?: string;
    sourceType: DocumentSourceType;
  };
}

// ============================================
// Query Pipeline Types
// ============================================

export interface QueryPipeline {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  collectionIds: string[];
  config: QueryPipelineConfig;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QueryPipelineConfig {
  preProcessing?: {
    queryExpansion?: boolean;
    spellCorrection?: boolean;
    synonymExpansion?: boolean;
  };
  retrieval: {
    topK: number;
    minScore: number;
    hybridSearch?: HybridSearchConfig;
    reranker?: RerankerConfig;
  };
  postProcessing?: {
    deduplication?: boolean;
    contextCompression?: boolean;
    maxTokens?: number;
  };
  llm?: {
    model: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  };
}

// ============================================
// Analytics Types
// ============================================

export interface RAGAnalytics {
  collectionId: string;
  period: 'day' | 'week' | 'month';
  queries: number;
  avgLatencyMs: number;
  avgRelevanceScore: number;
  topQueries: Array<{
    query: string;
    count: number;
    avgScore: number;
  }>;
  noResultQueries: Array<{
    query: string;
    count: number;
  }>;
  documentHits: Array<{
    documentId: string;
    filename?: string;
    hitCount: number;
  }>;
}

// ============================================
// API Response Types
// ============================================

export interface CollectionListResponse {
  collections: RAGCollection[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DocumentListResponse {
  documents: RAGDocument[];
  total: number;
  page: number;
  pageSize: number;
}

export interface IndexJobResponse {
  job: IndexJob;
}

export interface RetrieveResponse {
  result: RetrieveResult;
}

// ============================================
// Helper Functions
// ============================================

export function getEmbeddingDimension(model: EmbeddingModel, customDimension?: number): number {
  if (model === 'custom') {
    return customDimension || 1536;
  }
  return EMBEDDING_DIMENSIONS[model];
}

export function validateChunkingStrategy(strategy: ChunkingStrategy): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (strategy.chunkSize < 50) {
    errors.push('Chunk size must be at least 50 characters');
  }
  if (strategy.chunkSize > 10000) {
    errors.push('Chunk size must not exceed 10000 characters');
  }
  if (strategy.chunkOverlap < 0) {
    errors.push('Chunk overlap must be non-negative');
  }
  if (strategy.chunkOverlap >= strategy.chunkSize) {
    errors.push('Chunk overlap must be less than chunk size');
  }
  if (strategy.minChunkSize && strategy.minChunkSize > strategy.chunkSize) {
    errors.push('Min chunk size must not exceed chunk size');
  }
  if (strategy.maxChunkSize && strategy.maxChunkSize < strategy.chunkSize) {
    errors.push('Max chunk size must not be less than chunk size');
  }

  return { valid: errors.length === 0, errors };
}

export function estimateChunkCount(contentLength: number, strategy: ChunkingStrategy): number {
  const effectiveChunkSize = strategy.chunkSize - strategy.chunkOverlap;
  return Math.ceil(contentLength / effectiveChunkSize);
}
