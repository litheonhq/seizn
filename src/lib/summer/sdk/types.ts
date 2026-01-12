/**
 * Seizn Summer SDK - External Client Types
 *
 * Type definitions for external applications to integrate with
 * Seizn's Summer RAG infrastructure.
 */

// ============================================
// Collection Types
// ============================================

export interface Collection {
  id: string;
  name: string;
  description?: string;
  documentCount: number;
  embeddingDimensions: number;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateCollectionRequest {
  name: string;
  description?: string;
  embeddingModel?: 'voyage-3' | 'voyage-3-lite';
}

export interface CreateCollectionResponse {
  success: boolean;
  collection: Collection;
}

// ============================================
// Document Types
// ============================================

export interface Document {
  id: string;
  collectionId: string;
  externalId?: string;
  title?: string;
  content: string;
  metadata: Record<string, unknown>;
  chunkCount: number;
  createdAt: string;
  updatedAt?: string;
}

export interface IndexDocumentRequest {
  collectionId: string;
  externalId?: string;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
  chunkingStrategy?: 'fixed' | 'semantic' | 'paragraph';
  chunkSize?: number;
  chunkOverlap?: number;
}

export interface IndexDocumentResponse {
  success: boolean;
  document: Document;
  chunksCreated: number;
}

export interface BulkIndexRequest {
  collectionId: string;
  documents: Array<{
    externalId?: string;
    title?: string;
    content: string;
    metadata?: Record<string, unknown>;
  }>;
  chunkingStrategy?: 'fixed' | 'semantic' | 'paragraph';
}

export interface BulkIndexResponse {
  success: boolean;
  indexed: number;
  failed: number;
  errors?: Array<{ index: number; error: string }>;
}

// ============================================
// Search Types
// ============================================

export type SearchMode = 'vector' | 'keyword' | 'hybrid';

export interface SearchRequest {
  collectionId: string;
  query: string;
  topK?: number;
  threshold?: number;
  mode?: SearchMode;
  rerank?: boolean;
  rerankTopN?: number;
  filter?: Record<string, unknown>;
  includeMetadata?: boolean;
}

export interface SearchResult {
  chunkId: string;
  documentId: string;
  externalId?: string;
  title?: string;
  content: string;
  similarity: number;
  rerankScore?: number;
  metadata?: Record<string, unknown>;
}

export interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  count: number;
  mode: SearchMode;
  timings: {
    embedMs: number;
    searchMs: number;
    rerankMs?: number;
    totalMs: number;
  };
}

// ============================================
// Federated Search Types
// ============================================

export interface FederatedSource {
  id: string;
  name: string;
  type: 'http' | 'agent';
  priority: number;
  weight: number;
}

export interface FederatedSearchRequest {
  query: string;
  sources?: string[]; // Source IDs, empty for all
  topK?: number;
  mode?: SearchMode;
  rerank?: boolean;
  dedupe?: boolean;
}

export interface FederatedSearchResponse {
  success: boolean;
  results: Array<SearchResult & { source: string }>;
  sourceStats: Array<{
    sourceId: string;
    resultsCount: number;
    latencyMs: number;
  }>;
  timings: {
    totalMs: number;
  };
}

// ============================================
// RAG Query Types
// ============================================

export interface RAGQueryRequest {
  collectionId: string;
  query: string;
  systemPrompt?: string;
  contextLimit?: number;
  citationStyle?: 'inline' | 'footnote' | 'none';
  model?: 'claude-sonnet' | 'claude-haiku';
  stream?: boolean;
}

export interface Citation {
  id: string;
  documentId: string;
  title?: string;
  content: string;
  relevance: number;
}

export interface RAGQueryResponse {
  success: boolean;
  answer: string;
  citations: Citation[];
  usage: {
    contextTokens: number;
    responseTokens: number;
    totalTokens: number;
  };
  timings: {
    searchMs: number;
    generationMs: number;
    totalMs: number;
  };
}

// ============================================
// SDK Configuration
// ============================================

export interface SummerClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  onError?: (error: SummerError) => void;
}

export interface SummerError {
  code: string;
  message: string;
  status?: number;
  details?: Record<string, unknown>;
}

// ============================================
// Analytics Types
// ============================================

export interface CollectionStats {
  collectionId: string;
  documentCount: number;
  chunkCount: number;
  totalTokens: number;
  storageBytes: number;
  lastIndexedAt?: string;
}

export interface SearchAnalytics {
  period: 'day' | 'week' | 'month';
  totalSearches: number;
  averageLatencyMs: number;
  topQueries: Array<{ query: string; count: number }>;
  modeDistribution: Record<SearchMode, number>;
}
