/**
 * Seizn LangChain VectorStore Wrapper
 *
 * A LangChain-compatible VectorStore implementation that wraps Seizn's
 * Summer RAG stack for seamless integration with LangChain applications.
 *
 * @example
 * ```typescript
 * import { SeizVectorStore } from '@/lib/integrations/langchain';
 *
 * const vectorStore = new SeizVectorStore({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   collectionId: 'my-collection',
 *   userId: 'user-123',
 * });
 *
 * // Similarity search
 * const docs = await vectorStore.similaritySearch('What is RAG?', 5);
 *
 * // Maximum marginal relevance search
 * const diverseDocs = await vectorStore.maxMarginalRelevanceSearch('RAG', 5, { fetchK: 20 });
 *
 * // Use as retriever
 * const retriever = vectorStore.asRetriever({ k: 5 });
 * ```
 */

import type {
  SeizRetrieverMetadata,
  Document,
  SeizError,
} from './types';

const DEFAULT_BASE_URL = 'https://www.seizn.com/api';
const DEFAULT_TOP_K = 5;
const DEFAULT_TIMEOUT = 30000;

/**
 * Configuration for SeizVectorStore
 */
export interface SeizVectorStoreConfig {
  /** Seizn API key */
  apiKey: string;
  /** Base URL for Seizn API */
  baseUrl?: string;
  /** Collection ID */
  collectionId: string;
  /** User ID */
  userId: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Enable Flight Recorder tracing */
  enableTracing?: boolean;
  /** Enable reranking by default */
  rerank?: boolean;
  /** Enable autopilot mode */
  autopilot?: boolean;
}

/**
 * Search result with score
 */
export interface SearchResult {
  document: Document<SeizRetrieverMetadata>;
  score: number;
}

/**
 * Options for similarity search
 */
export interface SimilaritySearchOptions {
  /** Number of documents to retrieve */
  k?: number;
  /** Minimum similarity threshold */
  threshold?: number;
  /** Filter by metadata */
  filter?: Record<string, unknown>;
  /** Enable reranking */
  rerank?: boolean;
}

/**
 * Options for MMR search
 */
export interface MMRSearchOptions extends SimilaritySearchOptions {
  /** Number of documents to fetch before reranking */
  fetchK?: number;
  /** Lambda for MMR diversity (0-1, higher = less diverse) */
  lambda?: number;
}

/**
 * Retriever configuration
 */
export interface RetrieverConfig {
  /** Number of documents to retrieve */
  k?: number;
  /** Search type */
  searchType?: 'similarity' | 'mmr';
  /** MMR lambda parameter */
  lambda?: number;
  /** Metadata filter */
  filter?: Record<string, unknown>;
}

/**
 * SeizVectorStore - LangChain VectorStore implementation
 *
 * Provides vector similarity search and document retrieval
 * through Seizn's Summer RAG stack.
 */
export class SeizVectorStore {
  private readonly config: SeizVectorStoreConfig & {
    baseUrl: string;
    timeout: number;
  };

  /** LangChain namespace identifier */
  lc_namespace = ['seizn', 'vectorstores'];

  constructor(config: SeizVectorStoreConfig) {
    if (!config.apiKey) {
      throw new Error('Seizn API key is required');
    }
    if (!config.collectionId) {
      throw new Error('Collection ID is required');
    }
    if (!config.userId) {
      throw new Error('User ID is required');
    }

    this.config = {
      ...config,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
    };
  }

  /**
   * Perform a similarity search
   *
   * @param query - Search query
   * @param k - Number of results to return
   * @param options - Additional search options
   * @returns Array of documents
   */
  async similaritySearch(
    query: string,
    k?: number,
    options?: SimilaritySearchOptions
  ): Promise<Document<SeizRetrieverMetadata>[]> {
    const results = await this.similaritySearchWithScore(query, k, options);
    return results.map((r) => r.document);
  }

  /**
   * Perform a similarity search with scores
   *
   * @param query - Search query
   * @param k - Number of results to return
   * @param options - Additional search options
   * @returns Array of documents with scores
   */
  async similaritySearchWithScore(
    query: string,
    k?: number,
    options?: SimilaritySearchOptions
  ): Promise<SearchResult[]> {
    const response = await this.search({
      query,
      topK: k ?? options?.k ?? DEFAULT_TOP_K,
      threshold: options?.threshold,
      mode: 'vector',
      rerank: options?.rerank ?? this.config.rerank,
    });

    let results = response.map((r) => ({
      document: this.toDocument(r),
      score: r.similarity ?? 0,
    }));

    // Apply metadata filter if provided
    if (options?.filter) {
      results = results.filter((r) =>
        this.matchesFilter(r.document.metadata, options.filter!)
      );
    }

    return results.slice(0, k ?? options?.k ?? DEFAULT_TOP_K);
  }

  /**
   * Maximum Marginal Relevance search
   *
   * Returns diverse results by balancing relevance and diversity.
   *
   * @param query - Search query
   * @param k - Number of results to return
   * @param options - MMR search options
   * @returns Array of documents
   */
  async maxMarginalRelevanceSearch(
    query: string,
    k?: number,
    options?: MMRSearchOptions
  ): Promise<Document<SeizRetrieverMetadata>[]> {
    const results = await this.maxMarginalRelevanceSearchWithScore(
      query,
      k,
      options
    );
    return results.map((r) => r.document);
  }

  /**
   * Maximum Marginal Relevance search with scores
   */
  async maxMarginalRelevanceSearchWithScore(
    query: string,
    k?: number,
    options?: MMRSearchOptions
  ): Promise<SearchResult[]> {
    const fetchK = options?.fetchK ?? (k ?? DEFAULT_TOP_K) * 4;
    const lambda = options?.lambda ?? 0.5;

    // Fetch more documents for MMR selection
    const candidates = await this.similaritySearchWithScore(query, fetchK, {
      threshold: options?.threshold,
      rerank: false, // We'll do MMR instead of reranking
    });

    // Apply MMR algorithm
    const selected = this.applyMMR(
      candidates,
      k ?? DEFAULT_TOP_K,
      lambda
    );

    // Apply metadata filter if provided
    if (options?.filter) {
      return selected.filter((r) =>
        this.matchesFilter(r.document.metadata, options.filter!)
      );
    }

    return selected;
  }

  /**
   * Hybrid search (combining semantic and keyword search)
   *
   * @param query - Search query
   * @param k - Number of results to return
   * @param options - Search options
   * @returns Array of documents
   */
  async hybridSearch(
    query: string,
    k?: number,
    options?: SimilaritySearchOptions
  ): Promise<Document<SeizRetrieverMetadata>[]> {
    const results = await this.hybridSearchWithScore(query, k, options);
    return results.map((r) => r.document);
  }

  /**
   * Hybrid search with scores
   */
  async hybridSearchWithScore(
    query: string,
    k?: number,
    options?: SimilaritySearchOptions
  ): Promise<SearchResult[]> {
    const response = await this.search({
      query,
      topK: k ?? options?.k ?? DEFAULT_TOP_K,
      threshold: options?.threshold,
      mode: 'hybrid',
      rerank: options?.rerank ?? this.config.rerank ?? true,
    });

    let results = response.map((r) => ({
      document: this.toDocument(r),
      score: r.combinedScore ?? r.similarity ?? 0,
    }));

    // Apply metadata filter if provided
    if (options?.filter) {
      results = results.filter((r) =>
        this.matchesFilter(r.document.metadata, options.filter!)
      );
    }

    return results.slice(0, k ?? options?.k ?? DEFAULT_TOP_K);
  }

  /**
   * Convert this vector store to a retriever
   *
   * @param config - Retriever configuration
   * @returns A retriever instance
   */
  asRetriever(config?: RetrieverConfig): SeizVectorStoreRetriever {
    return new SeizVectorStoreRetriever(this, config);
  }

  /**
   * Add documents to the collection (via ingestion API)
   *
   * Note: For bulk ingestion, use the Summer ingestion API directly.
   *
   * @param documents - Documents to add
   * @returns Array of document IDs
   */
  async addDocuments(
    documents: Array<{ pageContent: string; metadata?: Record<string, unknown> }>
  ): Promise<string[]> {
    const url = `${this.config.baseUrl}/summer/ingest`;

    const body = {
      userId: this.config.userId,
      collectionId: this.config.collectionId,
      documents: documents.map((doc) => ({
        content: doc.pageContent,
        metadata: doc.metadata,
      })),
    };

    const response = await this.request<{
      documentIds: string[];
      chunkIds: string[];
    }>(url, {
      method: 'POST',
      body,
    });

    return response.documentIds;
  }

  /**
   * Delete documents by IDs
   *
   * @param ids - Document IDs to delete
   * @returns Number of deleted documents
   */
  async deleteDocuments(ids: string[]): Promise<number> {
    const url = `${this.config.baseUrl}/summer/documents`;

    const response = await this.request<{ deleted: number }>(url, {
      method: 'DELETE',
      body: {
        userId: this.config.userId,
        collectionId: this.config.collectionId,
        documentIds: ids,
      },
    });

    return response.deleted;
  }

  /**
   * Get store configuration
   */
  getConfig(): SeizVectorStoreConfig {
    return { ...this.config };
  }

  /**
   * Create a new store with updated configuration
   */
  withConfig(config: Partial<SeizVectorStoreConfig>): SeizVectorStore {
    return new SeizVectorStore({
      ...this.config,
      ...config,
    });
  }

  // ============================================
  // Private Methods
  // ============================================

  private async search(params: {
    query: string;
    topK: number;
    threshold?: number;
    mode: 'vector' | 'keyword' | 'hybrid';
    rerank?: boolean;
  }): Promise<SearchResponse[]> {
    const url = `${this.config.baseUrl}/summer/retrieve`;

    const body = {
      userId: this.config.userId,
      collectionId: this.config.collectionId,
      query: params.query,
      mode: params.mode,
      topK: params.topK,
      threshold: params.threshold,
      rerank: params.rerank ?? true,
      autopilot: this.config.autopilot ?? true,
      includeTrace: this.config.enableTracing ?? false,
    };

    const response = await this.request<{ results: SearchResponse[] }>(url, {
      method: 'POST',
      body,
    });

    return response.results ?? [];
  }

  private toDocument(result: SearchResponse): Document<SeizRetrieverMetadata> {
    return {
      pageContent: result.text,
      metadata: {
        chunkId: result.chunkId,
        documentId: result.documentId,
        similarity: result.similarity,
        keywordRank: result.keywordRank,
        combinedScore: result.combinedScore,
        source: result.source,
        ...result.metadata,
      },
    };
  }

  private matchesFilter(
    metadata: Record<string, unknown>,
    filter: Record<string, unknown>
  ): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (metadata[key] !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * Apply Maximum Marginal Relevance algorithm
   */
  private applyMMR(
    candidates: SearchResult[],
    k: number,
    lambda: number
  ): SearchResult[] {
    if (candidates.length <= k) {
      return candidates;
    }

    const selected: SearchResult[] = [];
    const remaining = [...candidates];

    // Select first document (highest score)
    if (remaining.length > 0) {
      const first = remaining.shift()!;
      selected.push(first);
    }

    // Select remaining documents using MMR
    while (selected.length < k && remaining.length > 0) {
      let bestScore = -Infinity;
      let bestIdx = 0;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];

        // Calculate max similarity to already selected documents
        // Using Jaccard similarity approximation based on metadata overlap
        let maxSimilarityToSelected = 0;
        for (const selectedDoc of selected) {
          const similarity = this.calculateDocumentSimilarity(
            candidate.document,
            selectedDoc.document
          );
          maxSimilarityToSelected = Math.max(
            maxSimilarityToSelected,
            similarity
          );
        }

        // MMR score: lambda * relevance - (1 - lambda) * max_similarity
        const mmrScore =
          lambda * candidate.score -
          (1 - lambda) * maxSimilarityToSelected;

        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIdx = i;
        }
      }

      selected.push(remaining.splice(bestIdx, 1)[0]);
    }

    return selected;
  }

  /**
   * Calculate similarity between two documents based on metadata
   */
  private calculateDocumentSimilarity(
    doc1: Document<SeizRetrieverMetadata>,
    doc2: Document<SeizRetrieverMetadata>
  ): number {
    // Simple similarity: same document = 1.0, same source = 0.5, otherwise 0.0
    if (doc1.metadata.documentId === doc2.metadata.documentId) {
      return 1.0;
    }
    if (
      doc1.metadata.source &&
      doc1.metadata.source === doc2.metadata.source
    ) {
      return 0.5;
    }
    return 0.0;
  }

  private async request<T>(
    url: string,
    options: {
      method: string;
      body?: unknown;
    }
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeout
    );

    try {
      const response = await fetch(url, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error: SeizError = {
          code: errorData.code ?? 'REQUEST_FAILED',
          message:
            errorData.error ??
            errorData.message ??
            `Request failed with status ${response.status}`,
          status: response.status,
          details: errorData,
        };
        throw error;
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw {
          code: 'TIMEOUT',
          message: `Request timed out after ${this.config.timeout}ms`,
        };
      }

      throw error;
    }
  }
}

/**
 * Internal response type for search API
 */
interface SearchResponse {
  chunkId: string;
  documentId: string;
  text: string;
  similarity: number;
  keywordRank?: number;
  combinedScore?: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

/**
 * SeizVectorStoreRetriever - Retriever wrapper for SeizVectorStore
 */
export class SeizVectorStoreRetriever {
  private readonly store: SeizVectorStore;
  private readonly config: RetrieverConfig;

  /** LangChain namespace identifier */
  lc_namespace = ['seizn', 'retrievers'];

  constructor(store: SeizVectorStore, config?: RetrieverConfig) {
    this.store = store;
    this.config = {
      k: config?.k ?? DEFAULT_TOP_K,
      searchType: config?.searchType ?? 'similarity',
      lambda: config?.lambda ?? 0.5,
      filter: config?.filter,
    };
  }

  /**
   * Get relevant documents for a query
   */
  async getRelevantDocuments(
    query: string
  ): Promise<Document<SeizRetrieverMetadata>[]> {
    if (this.config.searchType === 'mmr') {
      return this.store.maxMarginalRelevanceSearch(query, this.config.k, {
        lambda: this.config.lambda,
        filter: this.config.filter,
      });
    }

    return this.store.similaritySearch(query, this.config.k, {
      filter: this.config.filter,
    });
  }

  /**
   * Invoke the retriever (LangChain Runnable interface)
   */
  async invoke(
    query: string
  ): Promise<Document<SeizRetrieverMetadata>[]> {
    return this.getRelevantDocuments(query);
  }

  /**
   * Batch retrieve documents for multiple queries
   */
  async batch(
    queries: string[]
  ): Promise<Document<SeizRetrieverMetadata>[][]> {
    return Promise.all(
      queries.map((q) => this.getRelevantDocuments(q))
    );
  }

  /**
   * Stream documents
   */
  async *stream(
    query: string
  ): AsyncGenerator<Document<SeizRetrieverMetadata>> {
    const docs = await this.getRelevantDocuments(query);
    for (const doc of docs) {
      yield doc;
    }
  }
}

/**
 * Create a SeizVectorStore instance
 */
export function createSeizVectorStore(
  config: SeizVectorStoreConfig
): SeizVectorStore {
  return new SeizVectorStore(config);
}

/**
 * Create a SeizVectorStore with hybrid search enabled
 */
export function createHybridVectorStore(
  config: Omit<SeizVectorStoreConfig, 'rerank'>
): SeizVectorStore {
  return new SeizVectorStore({
    ...config,
    rerank: true,
  });
}
