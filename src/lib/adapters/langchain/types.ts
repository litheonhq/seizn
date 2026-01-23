/**
 * Seizn LangChain Adapter Types
 *
 * Type definitions for integrating Seizn retrieval with LangChain.
 * Enables seamless use of Seizn's RAG capabilities within LangChain pipelines.
 */

import type { SearchMode, SearchResult, SearchResponse } from '@/lib/summer/sdk/types';

// ============================================
// Configuration Types
// ============================================

/**
 * Configuration options for SeiznRetriever
 *
 * @example
 * ```typescript
 * const config: SeiznRetrieverConfig = {
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   collectionId: 'my-docs',
 *   topK: 5,
 *   searchMode: 'hybrid',
 *   rerank: true,
 * };
 * ```
 */
export interface SeiznRetrieverConfig {
  /**
   * Seizn API key for authentication.
   * Get your key at https://seizn.com/dashboard/api-keys
   */
  apiKey: string;

  /**
   * The collection ID to search within.
   * Required for all search operations.
   */
  collectionId: string;

  /**
   * Base URL for Seizn API.
   * Defaults to 'https://seizn.com/api/summer'
   */
  baseUrl?: string;

  /**
   * Maximum number of documents to retrieve.
   * Defaults to 4.
   */
  topK?: number;

  /**
   * Search mode: 'vector', 'keyword', or 'hybrid'.
   * Defaults to 'hybrid' for best results.
   */
  searchMode?: SearchMode;

  /**
   * Minimum similarity threshold for results (0-1).
   * Results below this threshold are filtered out.
   */
  threshold?: number;

  /**
   * Whether to enable reranking for improved relevance.
   * Defaults to false. Enabling adds latency but improves quality.
   */
  rerank?: boolean;

  /**
   * Number of top results to keep after reranking.
   * Only used when rerank is true.
   */
  rerankTopN?: number;

  /**
   * Metadata filters to apply to search.
   * Uses MongoDB-style filter syntax.
   *
   * @example
   * ```typescript
   * filter: {
   *   source: 'documentation',
   *   language: { $in: ['en', 'ko'] }
   * }
   * ```
   */
  filter?: Record<string, unknown>;

  /**
   * Whether to include document metadata in results.
   * Defaults to true.
   */
  includeMetadata?: boolean;

  /**
   * Request timeout in milliseconds.
   * Defaults to 60000 (60 seconds).
   */
  timeout?: number;

  /**
   * Number of retry attempts for failed requests.
   * Defaults to 3.
   */
  retries?: number;
}

// ============================================
// Document Types
// ============================================

/**
 * LangChain Document interface
 * Matches @langchain/core Document type for compatibility
 */
export interface LangChainDocument {
  pageContent: string;
  metadata: Record<string, unknown>;
}

/**
 * Extended document with Seizn-specific fields
 */
export interface SeiznDocument extends LangChainDocument {
  metadata: {
    /** Original chunk ID from Seizn */
    chunkId: string;
    /** Parent document ID */
    documentId: string;
    /** External ID if provided during indexing */
    externalId?: string;
    /** Document title */
    title?: string;
    /** Similarity score from vector search (0-1) */
    similarity: number;
    /** Rerank score if reranking was applied */
    rerankScore?: number;
    /** Original metadata from indexed document */
    [key: string]: unknown;
  };
}

// ============================================
// Callback Types
// ============================================

/**
 * Callback manager interface for LangChain compatibility
 */
export interface CallbackManagerForRetrieverRun {
  getChild(tag?: string): CallbackManagerForRetrieverRun;
  handleRetrieverStart?(
    retriever: { name: string },
    query: string
  ): Promise<void>;
  handleRetrieverEnd?(documents: LangChainDocument[]): Promise<void>;
  handleRetrieverError?(error: Error): Promise<void>;
}

// ============================================
// Conversion Types
// ============================================

/**
 * Options for converting Seizn results to LangChain Documents
 */
export interface DocumentConversionOptions {
  /**
   * Whether to include similarity score in metadata.
   * Defaults to true.
   */
  includeSimilarity?: boolean;

  /**
   * Whether to include rerank score in metadata.
   * Defaults to true if reranking was used.
   */
  includeRerankScore?: boolean;

  /**
   * Custom metadata mapper function.
   * Use to transform or filter metadata fields.
   */
  metadataMapper?: (result: SearchResult) => Record<string, unknown>;
}

// ============================================
// Response Types
// ============================================

/**
 * Extended search response with timing and debug info
 */
export interface SeiznSearchResponse extends SearchResponse {
  /** Total results before filtering */
  totalResults?: number;
  /** Whether reranking was applied */
  reranked?: boolean;
}

// ============================================
// Error Types
// ============================================

/**
 * Seizn-specific error for retriever operations
 */
export interface SeiznRetrieverError extends Error {
  code: string;
  status?: number;
  details?: Record<string, unknown>;
}

/**
 * Type guard for SeiznRetrieverError
 */
export function isSeiznRetrieverError(error: unknown): error is SeiznRetrieverError {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof (error as SeiznRetrieverError).code === 'string'
  );
}

// ============================================
// Re-exports from SDK types for convenience
// ============================================

export type { SearchMode, SearchResult, SearchResponse };
