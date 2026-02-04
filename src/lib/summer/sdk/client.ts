/**
 * Seizn Summer SDK Client
 *
 * TypeScript SDK for Seizn's Summer RAG infrastructure.
 * Enables external applications like TheLabForge to integrate
 * with Seizn's vector search and RAG capabilities.
 *
 * @example
 * ```typescript
 * import { SummerClient } from '@seizn/summer';
 *
 * const summer = new SummerClient({
 *   apiKey: process.env.SEIZN_API_KEY!,
 * });
 *
 * // Index a document
 * await summer.index({
 *   collectionId: 'my-collection',
 *   content: 'Document content...',
 *   metadata: { source: 'my-app' },
 * });
 *
 * // Search
 * const results = await summer.search({
 *   collectionId: 'my-collection',
 *   query: 'What is machine learning?',
 *   mode: 'hybrid',
 *   rerank: true,
 * });
 * ```
 */

import type {
  SummerClientConfig,
  SummerError,
  Collection,
  CreateCollectionRequest,
  CreateCollectionResponse,
  Document,
  IndexDocumentRequest,
  IndexDocumentResponse,
  BulkIndexRequest,
  BulkIndexResponse,
  SearchRequest,
  SearchResponse,
  FederatedSearchRequest,
  FederatedSearchResponse,
  RAGQueryRequest,
  RAGQueryResponse,
  CollectionStats,
  SearchAnalytics,
} from './types';

const DEFAULT_BASE_URL = 'https://www.seizn.com/api/summer';
const DEFAULT_TIMEOUT = 60000;
const DEFAULT_RETRIES = 3;

export class SummerClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly onError?: (error: SummerError) => void;

  constructor(config: SummerClientConfig) {
    if (!config.apiKey) {
      throw new Error('API key is required');
    }

    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.retries = config.retries ?? DEFAULT_RETRIES;
    this.onError = config.onError;
  }

  // ============================================
  // Collection Management
  // ============================================

  /**
   * Create a new collection
   */
  async createCollection(request: CreateCollectionRequest): Promise<Collection> {
    const response = await this.request<CreateCollectionResponse>('/collections', {
      method: 'POST',
      body: request,
    });
    return response.collection;
  }

  /**
   * List all collections
   */
  async listCollections(): Promise<Collection[]> {
    const response = await this.request<{ collections: Collection[] }>('/collections');
    return response.collections;
  }

  /**
   * Get collection by ID
   */
  async getCollection(collectionId: string): Promise<Collection> {
    const response = await this.request<{ collection: Collection }>(
      `/collections/${collectionId}`
    );
    return response.collection;
  }

  /**
   * Delete a collection
   */
  async deleteCollection(collectionId: string): Promise<void> {
    await this.request(`/collections/${collectionId}`, { method: 'DELETE' });
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats(collectionId: string): Promise<CollectionStats> {
    return this.request<CollectionStats>(`/collections/${collectionId}/stats`);
  }

  // ============================================
  // Document Indexing
  // ============================================

  /**
   * Index a single document
   */
  async index(request: IndexDocumentRequest): Promise<IndexDocumentResponse> {
    return this.request<IndexDocumentResponse>('/index', {
      method: 'POST',
      body: request,
    });
  }

  /**
   * Bulk index multiple documents
   */
  async bulkIndex(request: BulkIndexRequest): Promise<BulkIndexResponse> {
    return this.request<BulkIndexResponse>('/index/bulk', {
      method: 'POST',
      body: request,
    });
  }

  /**
   * Get document by ID
   */
  async getDocument(documentId: string): Promise<Document> {
    const response = await this.request<{ document: Document }>(
      `/documents/${documentId}`
    );
    return response.document;
  }

  /**
   * Delete a document
   */
  async deleteDocument(documentId: string): Promise<void> {
    await this.request(`/documents/${documentId}`, { method: 'DELETE' });
  }

  /**
   * Update document metadata
   */
  async updateDocumentMetadata(
    documentId: string,
    metadata: Record<string, unknown>
  ): Promise<Document> {
    const response = await this.request<{ document: Document }>(
      `/documents/${documentId}`,
      {
        method: 'PATCH',
        body: { metadata },
      }
    );
    return response.document;
  }

  // ============================================
  // Search
  // ============================================

  /**
   * Search within a collection
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    return this.request<SearchResponse>('/search', {
      method: 'POST',
      body: request,
    });
  }

  /**
   * Quick search shorthand
   */
  async query(
    collectionId: string,
    query: string,
    options?: {
      topK?: number;
      mode?: 'vector' | 'keyword' | 'hybrid';
      rerank?: boolean;
    }
  ): Promise<SearchResponse> {
    return this.search({
      collectionId,
      query,
      topK: options?.topK ?? 10,
      mode: options?.mode ?? 'hybrid',
      rerank: options?.rerank ?? false,
    });
  }

  /**
   * Federated search across multiple sources
   */
  async federatedSearch(request: FederatedSearchRequest): Promise<FederatedSearchResponse> {
    return this.request<FederatedSearchResponse>('/search/federated', {
      method: 'POST',
      body: request,
    });
  }

  // ============================================
  // RAG Query
  // ============================================

  /**
   * RAG query with answer generation
   */
  async rag(request: RAGQueryRequest): Promise<RAGQueryResponse> {
    return this.request<RAGQueryResponse>('/rag', {
      method: 'POST',
      body: request,
    });
  }

  /**
   * Quick RAG query shorthand
   */
  async ask(
    collectionId: string,
    question: string,
    options?: {
      systemPrompt?: string;
      contextLimit?: number;
    }
  ): Promise<RAGQueryResponse> {
    return this.rag({
      collectionId,
      query: question,
      systemPrompt: options?.systemPrompt,
      contextLimit: options?.contextLimit ?? 8000,
      citationStyle: 'inline',
    });
  }

  // ============================================
  // Analytics
  // ============================================

  /**
   * Get search analytics
   */
  async getAnalytics(
    collectionId: string,
    period: 'day' | 'week' | 'month' = 'week'
  ): Promise<SearchAnalytics> {
    return this.request<SearchAnalytics>(
      `/collections/${collectionId}/analytics?period=${period}`
    );
  }

  // ============================================
  // Utilities
  // ============================================

  /**
   * Generate embedding for text (for external use)
   */
  async embed(text: string | string[]): Promise<number[][]> {
    const texts = Array.isArray(text) ? text : [text];
    const response = await this.request<{ embeddings: number[][] }>('/embed', {
      method: 'POST',
      body: { texts },
    });
    return response.embeddings;
  }

  /**
   * Rerank results
   */
  async rerank(
    query: string,
    documents: Array<{ id: string; text: string }>,
    topN?: number
  ): Promise<Array<{ id: string; score: number }>> {
    const response = await this.request<{ results: Array<{ id: string; score: number }> }>(
      '/rerank',
      {
        method: 'POST',
        body: { query, documents, topN },
      }
    );
    return response.results;
  }

  // ============================================
  // Internal
  // ============================================

  private async request<T>(
    path: string,
    options?: {
      method?: string;
      body?: unknown;
    }
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const method = options?.method ?? 'GET';

    let lastError: SummerError | null = null;

    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: options?.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const error: SummerError = {
            code: errorData.code ?? 'REQUEST_FAILED',
            message: errorData.error ?? errorData.message ?? `Request failed with status ${response.status}`,
            status: response.status,
            details: errorData,
          };

          // Don't retry 4xx errors
          if (response.status >= 400 && response.status < 500) {
            this.onError?.(error);
            throw error;
          }

          lastError = error;
          continue;
        }

        return response.json();
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          lastError = {
            code: 'TIMEOUT',
            message: `Request timed out after ${this.timeout}ms`,
          };
        } else if ((error as SummerError).code) {
          throw error;
        } else {
          lastError = {
            code: 'NETWORK_ERROR',
            message: error instanceof Error ? error.message : 'Network error',
          };
        }

        if (attempt < this.retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    if (lastError) {
      this.onError?.(lastError);
      throw lastError;
    }

    throw { code: 'UNKNOWN', message: 'Unknown error' };
  }
}

/**
 * Create a Summer client instance
 */
export function createSummerClient(config: SummerClientConfig): SummerClient {
  return new SummerClient(config);
}
