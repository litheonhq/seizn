/**
 * Seizn LangChain Retriever
 *
 * A LangChain-compatible retriever that uses Seizn's Summer RAG stack
 * for semantic, keyword, and hybrid document retrieval.
 *
 * @example
 * ```typescript
 * import { SeizRetriever } from '@seizn/langchain';
 *
 * const retriever = new SeizRetriever({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   collectionId: 'my-collection',
 *   userId: 'user-123',
 *   mode: 'hybrid',
 *   topK: 5,
 * });
 *
 * const docs = await retriever.getRelevantDocuments('How do I use the API?');
 * ```
 */

import type {
  SeizRetrieverConfig,
  SeizRetrieverMetadata,
  Document,
  SeizError,
} from './types';
import type { VectorSearchResult } from '@/lib/summer/types';

const DEFAULT_BASE_URL = 'https://www.seizn.com/api';
const DEFAULT_TOP_K = 5;
const DEFAULT_THRESHOLD = 0.7;
const DEFAULT_TIMEOUT = 30000;

/**
 * SeizRetriever - LangChain BaseRetriever implementation
 *
 * Provides semantic search, keyword search, and hybrid search capabilities
 * through Seizn's Summer RAG stack. Compatible with LangChain chains and agents.
 */
export class SeizRetriever {
  private readonly config: Required<
    Pick<SeizRetrieverConfig, 'apiKey' | 'baseUrl' | 'collectionId' | 'userId' | 'timeout'>
  > & SeizRetrieverConfig;

  /** Retriever type identifier for LangChain */
  lc_namespace = ['seizn', 'retrievers'];

  constructor(config: SeizRetrieverConfig) {
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
   * Get relevant documents for a query.
   * This is the main method used by LangChain chains.
   *
   * @param query - The search query
   * @param options - Optional override options
   * @returns Array of documents with metadata
   */
  async getRelevantDocuments(
    query: string,
    options?: Partial<SeizRetrieverConfig>
  ): Promise<Document<SeizRetrieverMetadata>[]> {
    const mergedConfig = { ...this.config, ...options };

    const response = await this.retrieve(query, mergedConfig);

    return response.map((result) => this.toDocument(result));
  }

  /**
   * Alias for getRelevantDocuments (LangChain Runnable interface)
   */
  async invoke(
    query: string,
    options?: Partial<SeizRetrieverConfig>
  ): Promise<Document<SeizRetrieverMetadata>[]> {
    return this.getRelevantDocuments(query, options);
  }

  /**
   * Batch retrieve documents for multiple queries
   */
  async batch(
    queries: string[],
    options?: Partial<SeizRetrieverConfig>
  ): Promise<Document<SeizRetrieverMetadata>[][]> {
    return Promise.all(queries.map((q) => this.getRelevantDocuments(q, options)));
  }

  /**
   * Stream documents (yields all at once since retrieval is not streamable)
   */
  async *stream(
    query: string,
    options?: Partial<SeizRetrieverConfig>
  ): AsyncGenerator<Document<SeizRetrieverMetadata>> {
    const docs = await this.getRelevantDocuments(query, options);
    for (const doc of docs) {
      yield doc;
    }
  }

  /**
   * Perform hybrid search with custom weights
   */
  async hybridSearch(
    query: string,
    options?: {
      keywordWeight?: number;
      vectorWeight?: number;
      topK?: number;
    }
  ): Promise<Document<SeizRetrieverMetadata>[]> {
    return this.getRelevantDocuments(query, {
      mode: 'hybrid',
      topK: options?.topK,
      // Note: keyword/vector weights are passed via the API
    });
  }

  /**
   * Perform pure semantic (vector) search
   */
  async semanticSearch(
    query: string,
    options?: { topK?: number; threshold?: number }
  ): Promise<Document<SeizRetrieverMetadata>[]> {
    return this.getRelevantDocuments(query, {
      mode: 'vector',
      topK: options?.topK,
      threshold: options?.threshold,
    });
  }

  /**
   * Perform pure keyword search
   */
  async keywordSearch(
    query: string,
    options?: { topK?: number }
  ): Promise<Document<SeizRetrieverMetadata>[]> {
    return this.getRelevantDocuments(query, {
      mode: 'keyword',
      topK: options?.topK,
    });
  }

  /**
   * Filter documents by metadata
   */
  async getRelevantDocumentsWithFilter(
    query: string,
    filter: Record<string, unknown>,
    options?: Partial<SeizRetrieverConfig>
  ): Promise<Document<SeizRetrieverMetadata>[]> {
    const docs = await this.getRelevantDocuments(query, options);

    return docs.filter((doc) => {
      for (const [key, value] of Object.entries(filter)) {
        if (doc.metadata[key] !== value) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Get retriever configuration
   */
  getConfig(): SeizRetrieverConfig {
    return { ...this.config };
  }

  /**
   * Create a new retriever with updated configuration
   */
  withConfig(config: Partial<SeizRetrieverConfig>): SeizRetriever {
    return new SeizRetriever({
      ...this.config,
      ...config,
    });
  }

  // ============================================
  // Private Methods
  // ============================================

  private async retrieve(
    query: string,
    config: SeizRetrieverConfig
  ): Promise<VectorSearchResult[]> {
    const url = `${config.baseUrl}/summer/retrieve`;

    const body = {
      userId: config.userId,
      collectionId: config.collectionId,
      query,
      mode: config.mode ?? 'hybrid',
      topK: config.topK ?? DEFAULT_TOP_K,
      threshold: config.threshold ?? DEFAULT_THRESHOLD,
      rerank: config.rerank ?? true,
      federated: config.federated ?? false,
      autopilot: config.autopilot ?? true,
      includeTrace: config.enableTracing ?? false,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout ?? DEFAULT_TIMEOUT);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error: SeizError = {
          code: errorData.code ?? 'RETRIEVE_FAILED',
          message: errorData.error ?? errorData.message ?? `Request failed with status ${response.status}`,
          status: response.status,
          details: errorData,
        };
        throw error;
      }

      const data = await response.json();
      return data.results ?? [];
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw {
          code: 'TIMEOUT',
          message: `Request timed out after ${config.timeout}ms`,
        };
      }

      throw error;
    }
  }

  private toDocument(result: VectorSearchResult): Document<SeizRetrieverMetadata> {
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
}

/**
 * Create a SeizRetriever instance
 */
export function createSeizRetriever(config: SeizRetrieverConfig): SeizRetriever {
  return new SeizRetriever(config);
}

/**
 * Create a retriever with hybrid search configuration
 */
export function createHybridRetriever(
  config: Omit<SeizRetrieverConfig, 'mode'> & {
    keywordWeight?: number;
    vectorWeight?: number;
  }
): SeizRetriever {
  return new SeizRetriever({
    ...config,
    mode: 'hybrid',
  });
}

/**
 * Create a retriever with semantic search configuration
 */
export function createSemanticRetriever(
  config: Omit<SeizRetrieverConfig, 'mode'>
): SeizRetriever {
  return new SeizRetriever({
    ...config,
    mode: 'vector',
  });
}
