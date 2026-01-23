/**
 * Seizn LangChain Retriever
 *
 * A LangChain-compatible retriever that uses Seizn's RAG infrastructure.
 * Implements the BaseRetriever interface pattern for seamless integration
 * with LangChain chains and agents.
 *
 * @example Basic Usage
 * ```typescript
 * import { SeiznRetriever } from '@/lib/adapters/langchain';
 *
 * const retriever = new SeiznRetriever({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   collectionId: 'my-docs',
 *   topK: 5,
 * });
 *
 * const docs = await retriever.getRelevantDocuments('What is machine learning?');
 * ```
 *
 * @example With LangChain Chain
 * ```typescript
 * import { ChatOpenAI } from '@langchain/openai';
 * import { createRetrievalChain } from 'langchain/chains/retrieval';
 *
 * const retriever = new SeiznRetriever({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   collectionId: 'knowledge-base',
 *   searchMode: 'hybrid',
 *   rerank: true,
 * });
 *
 * const llm = new ChatOpenAI({ modelName: 'gpt-4' });
 * const chain = await createRetrievalChain({
 *   retriever,
 *   combineDocsChain: createStuffDocumentsChain({ llm }),
 * });
 *
 * const result = await chain.invoke({ input: 'How does authentication work?' });
 * ```
 */

import type {
  SeiznRetrieverConfig,
  LangChainDocument,
  SeiznDocument,
  CallbackManagerForRetrieverRun,
  DocumentConversionOptions,
  SeiznRetrieverError,
} from './types';
import type { SearchRequest, SearchResponse, SearchResult } from '@/lib/summer/sdk/types';

const DEFAULT_BASE_URL = 'https://seizn.com/api/summer';
const DEFAULT_TOP_K = 4;
const DEFAULT_TIMEOUT = 60000;
const DEFAULT_RETRIES = 3;

/**
 * SeiznRetriever - LangChain-compatible retriever for Seizn
 *
 * Provides a drop-in replacement for LangChain retrievers that uses
 * Seizn's vector search and RAG capabilities.
 */
export class SeiznRetriever {
  readonly name = 'SeiznRetriever';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly collectionId: string;
  private readonly topK: number;
  private readonly searchMode: 'vector' | 'keyword' | 'hybrid';
  private readonly threshold?: number;
  private readonly rerank: boolean;
  private readonly rerankTopN?: number;
  private readonly filter?: Record<string, unknown>;
  private readonly includeMetadata: boolean;
  private readonly timeout: number;
  private readonly retries: number;

  constructor(config: SeiznRetrieverConfig) {
    if (!config.apiKey) {
      throw new Error('SeiznRetriever: apiKey is required');
    }
    if (!config.collectionId) {
      throw new Error('SeiznRetriever: collectionId is required');
    }

    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.collectionId = config.collectionId;
    this.topK = config.topK ?? DEFAULT_TOP_K;
    this.searchMode = config.searchMode ?? 'hybrid';
    this.threshold = config.threshold;
    this.rerank = config.rerank ?? false;
    this.rerankTopN = config.rerankTopN;
    this.filter = config.filter;
    this.includeMetadata = config.includeMetadata ?? true;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.retries = config.retries ?? DEFAULT_RETRIES;
  }

  // ============================================
  // Public API - LangChain Compatible Methods
  // ============================================

  /**
   * Get relevant documents for a query.
   * This is the main method called by LangChain chains.
   *
   * @param query - The search query
   * @param runManager - Optional callback manager for tracing
   * @returns Array of LangChain Documents
   */
  async getRelevantDocuments(
    query: string,
    runManager?: CallbackManagerForRetrieverRun
  ): Promise<LangChainDocument[]> {
    return this._getRelevantDocuments(query, runManager);
  }

  /**
   * Async implementation of document retrieval.
   * Called by getRelevantDocuments.
   *
   * @param query - The search query
   * @param runManager - Optional callback manager
   * @returns Array of LangChain Documents
   */
  async _getRelevantDocuments(
    query: string,
    runManager?: CallbackManagerForRetrieverRun
  ): Promise<LangChainDocument[]> {
    try {
      // Notify start if callback manager provided
      await runManager?.handleRetrieverStart?.({ name: this.name }, query);

      // Execute search
      const response = await this.search(query);

      // Convert results to LangChain Documents
      const documents = this.convertToDocuments(response.results);

      // Notify completion
      await runManager?.handleRetrieverEnd?.(documents);

      return documents;
    } catch (error) {
      const retrieverError = this.wrapError(error);
      await runManager?.handleRetrieverError?.(retrieverError);
      throw retrieverError;
    }
  }

  /**
   * Invoke the retriever (alternative API compatible with newer LangChain versions)
   *
   * @param input - The search query
   * @param options - Optional configuration including callbacks
   * @returns Array of LangChain Documents
   */
  async invoke(
    input: string,
    options?: { callbacks?: CallbackManagerForRetrieverRun }
  ): Promise<LangChainDocument[]> {
    return this.getRelevantDocuments(input, options?.callbacks);
  }

  /**
   * Batch invoke for multiple queries
   *
   * @param inputs - Array of search queries
   * @param options - Optional configuration
   * @returns Array of document arrays (one per query)
   */
  async batch(
    inputs: string[],
    options?: { callbacks?: CallbackManagerForRetrieverRun }
  ): Promise<LangChainDocument[][]> {
    return Promise.all(
      inputs.map((input) => this.getRelevantDocuments(input, options?.callbacks))
    );
  }

  // ============================================
  // Search Implementation
  // ============================================

  /**
   * Execute search against Seizn API
   *
   * @param query - The search query
   * @returns SearchResponse from Seizn
   */
  private async search(query: string): Promise<SearchResponse> {
    const request: SearchRequest = {
      collectionId: this.collectionId,
      query,
      topK: this.topK,
      mode: this.searchMode,
      rerank: this.rerank,
      rerankTopN: this.rerankTopN,
      threshold: this.threshold,
      filter: this.filter,
      includeMetadata: this.includeMetadata,
    };

    return this.executeRequest<SearchResponse>('/search', request);
  }

  /**
   * Execute HTTP request with retry logic
   */
  private async executeRequest<T>(
    endpoint: string,
    body: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const error: SeiznRetrieverError = Object.assign(
            new Error(
              errorData.error ||
                errorData.message ||
                `Request failed with status ${response.status}`
            ),
            {
              code: errorData.code ?? 'REQUEST_FAILED',
              status: response.status,
              details: errorData,
            }
          );

          // Don't retry 4xx client errors
          if (response.status >= 400 && response.status < 500) {
            throw error;
          }

          lastError = error;
          continue;
        }

        return response.json();
      } catch (error) {
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            lastError = Object.assign(
              new Error(`Request timed out after ${this.timeout}ms`),
              { code: 'TIMEOUT' }
            );
          } else if ('code' in error) {
            throw error; // Re-throw Seizn errors
          } else {
            lastError = Object.assign(new Error(error.message), {
              code: 'NETWORK_ERROR',
            });
          }
        } else {
          lastError = new Error('Unknown error occurred');
        }

        // Exponential backoff before retry
        if (attempt < this.retries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 1000)
          );
        }
      }
    }

    throw lastError ?? new Error('Unknown error');
  }

  // ============================================
  // Document Conversion
  // ============================================

  /**
   * Convert Seizn search results to LangChain Documents
   *
   * @param results - Array of SearchResult from Seizn
   * @param options - Conversion options
   * @returns Array of LangChain Documents
   */
  private convertToDocuments(
    results: SearchResult[],
    options?: DocumentConversionOptions
  ): SeiznDocument[] {
    const includeSimilarity = options?.includeSimilarity ?? true;
    const includeRerankScore = options?.includeRerankScore ?? this.rerank;

    return results.map((result) => {
      // Base metadata
      const metadata: SeiznDocument['metadata'] = {
        chunkId: result.chunkId,
        documentId: result.documentId,
        similarity: result.similarity,
      };

      // Add optional fields
      if (result.externalId) {
        metadata.externalId = result.externalId;
      }
      if (result.title) {
        metadata.title = result.title;
      }
      if (includeSimilarity) {
        metadata.similarity = result.similarity;
      }
      if (includeRerankScore && result.rerankScore !== undefined) {
        metadata.rerankScore = result.rerankScore;
      }

      // Merge additional metadata from result
      if (result.metadata && typeof result.metadata === 'object') {
        Object.assign(metadata, result.metadata);
      }

      // Apply custom mapper if provided
      if (options?.metadataMapper) {
        Object.assign(metadata, options.metadataMapper(result));
      }

      return {
        pageContent: result.content,
        metadata,
      };
    });
  }

  /**
   * Wrap any error as SeiznRetrieverError
   */
  private wrapError(error: unknown): SeiznRetrieverError {
    if (error instanceof Error) {
      if ('code' in error) {
        return error as SeiznRetrieverError;
      }
      return Object.assign(error, {
        code: 'RETRIEVER_ERROR',
      }) as SeiznRetrieverError;
    }
    return Object.assign(new Error(String(error)), {
      code: 'UNKNOWN_ERROR',
    }) as SeiznRetrieverError;
  }

  // ============================================
  // Configuration Access
  // ============================================

  /**
   * Get current retriever configuration (without sensitive data)
   */
  getConfig(): Omit<SeiznRetrieverConfig, 'apiKey'> & { apiKey: string } {
    return {
      apiKey: '***', // Masked for security
      baseUrl: this.baseUrl,
      collectionId: this.collectionId,
      topK: this.topK,
      searchMode: this.searchMode,
      threshold: this.threshold,
      rerank: this.rerank,
      rerankTopN: this.rerankTopN,
      filter: this.filter,
      includeMetadata: this.includeMetadata,
      timeout: this.timeout,
      retries: this.retries,
    };
  }

  /**
   * Create a new retriever with modified configuration
   * (Immutable pattern - returns new instance)
   *
   * @param overrides - Configuration overrides
   * @returns New SeiznRetriever instance
   */
  withConfig(overrides: Partial<SeiznRetrieverConfig>): SeiznRetriever {
    return new SeiznRetriever({
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      collectionId: this.collectionId,
      topK: this.topK,
      searchMode: this.searchMode,
      threshold: this.threshold,
      rerank: this.rerank,
      rerankTopN: this.rerankTopN,
      filter: this.filter,
      includeMetadata: this.includeMetadata,
      timeout: this.timeout,
      retries: this.retries,
      ...overrides,
    });
  }
}

/**
 * Factory function to create a SeiznRetriever instance
 *
 * @param config - Retriever configuration
 * @returns New SeiznRetriever instance
 *
 * @example
 * ```typescript
 * const retriever = createSeiznRetriever({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   collectionId: 'my-collection',
 * });
 * ```
 */
export function createSeiznRetriever(config: SeiznRetrieverConfig): SeiznRetriever {
  return new SeiznRetriever(config);
}
