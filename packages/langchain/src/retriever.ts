/**
 * Seizn LangChain Adapter - Retriever
 *
 * LangChain BaseRetriever implementation for Seizn AI Infrastructure.
 * Enables seamless integration with LangChain chains and agents.
 *
 * @example
 * ```typescript
 * import { SeiznRetriever } from '@seizn/langchain';
 * import { ChatOpenAI } from '@langchain/openai';
 * import { createRetrievalChain } from 'langchain/chains/retrieval';
 *
 * const retriever = new SeiznRetriever({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   collectionId: 'my-docs',
 *   topK: 5,
 * });
 *
 * const chain = await createRetrievalChain({
 *   retriever,
 *   combineDocsChain: // your chain
 * });
 * ```
 */

import { BaseRetriever, type BaseRetrieverInput } from '@langchain/core/retrievers';
import { Document } from '@langchain/core/documents';
import { CallbackManagerForRetrieverRun } from '@langchain/core/callbacks/manager';
import {
  SeiznClient,
  type SeiznConfig,
  type RetrievalRequest,
  type RetrievalResponse,
  type Context,
} from '@seizn/core';

/**
 * Configuration options for SeiznRetriever
 */
export interface SeiznRetrieverConfig extends BaseRetrieverInput {
  /** Seizn API key (required if client not provided) */
  apiKey?: string;
  /** Pre-configured SeiznClient instance */
  client?: SeiznClient;
  /** Collection ID to search within */
  collectionId?: string;
  /** Number of top results to return (default: 5) */
  topK?: number;
  /** Minimum similarity score threshold (0-1) */
  minScore?: number;
  /** Whether to rerank results (default: true) */
  rerank?: boolean;
  /** Metadata filters to apply */
  filters?: Record<string, unknown>;
  /** Include Seizn metadata in document metadata (default: true) */
  includeSeiznMetadata?: boolean;
  /** Additional Seizn client configuration */
  clientConfig?: Partial<SeiznConfig>;
}

/**
 * Extended metadata for Seizn documents
 */
export interface SeiznDocumentMetadata extends Record<string, unknown> {
  /** Seizn trace ID for this retrieval */
  seizn_trace_id?: string;
  /** Relevance/similarity score */
  seizn_score?: number;
  /** Context ID from Seizn */
  seizn_context_id?: string;
  /** Source document ID */
  seizn_source_id?: string;
  /** Citation information */
  seizn_citation?: {
    source: string;
    url?: string;
    page?: number;
    section?: string;
  };
}

/**
 * LangChain Retriever implementation for Seizn AI Infrastructure.
 *
 * This retriever integrates Seizn's retrieval capabilities with LangChain,
 * allowing you to use Seizn as a retrieval backend in any LangChain chain.
 *
 * Features:
 * - Full integration with LangChain callbacks
 * - Automatic document conversion with metadata
 * - Citation tracking and traceability
 * - Configurable filtering and reranking
 *
 * @example Basic usage
 * ```typescript
 * const retriever = new SeiznRetriever({
 *   apiKey: 'szn_live_...',
 *   collectionId: 'docs',
 * });
 *
 * const docs = await retriever.invoke('What is the return policy?');
 * ```
 *
 * @example With existing client
 * ```typescript
 * const client = new SeiznClient({ apiKey: '...' });
 * const retriever = new SeiznRetriever({ client, topK: 10 });
 * ```
 */
export class SeiznRetriever extends BaseRetriever {
  /** Namespace for serialization */
  static lc_name(): string {
    return 'SeiznRetriever';
  }

  /** LangChain namespace */
  lc_namespace = ['seizn', 'retrievers'];

  /** Seizn client instance */
  private readonly client: SeiznClient;

  /** Collection ID to search */
  private readonly collectionId?: string;

  /** Number of results to return */
  private readonly topK: number;

  /** Minimum score threshold */
  private readonly minScore?: number;

  /** Whether to rerank results */
  private readonly rerank: boolean;

  /** Metadata filters */
  private readonly filters?: Record<string, unknown>;

  /** Include Seizn metadata in documents */
  private readonly includeSeiznMetadata: boolean;

  /**
   * Create a new SeiznRetriever
   *
   * @param config - Retriever configuration
   * @throws Error if neither apiKey nor client is provided
   */
  constructor(config: SeiznRetrieverConfig) {
    super(config);

    // Initialize client
    if (config.client) {
      this.client = config.client;
    } else if (config.apiKey) {
      this.client = new SeiznClient({
        apiKey: config.apiKey,
        ...config.clientConfig,
      });
    } else {
      throw new Error(
        'SeiznRetriever requires either an apiKey or a pre-configured client'
      );
    }

    // Store configuration
    this.collectionId = config.collectionId;
    this.topK = config.topK ?? 5;
    this.minScore = config.minScore;
    this.rerank = config.rerank ?? true;
    this.filters = config.filters;
    this.includeSeiznMetadata = config.includeSeiznMetadata ?? true;
  }

  /**
   * Get relevant documents for a query.
   *
   * This is the main retrieval method called by LangChain chains.
   *
   * @param query - The query string to search for
   * @param runManager - LangChain callback manager (optional)
   * @returns Array of Document objects with content and metadata
   */
  async _getRelevantDocuments(
    query: string,
    runManager?: CallbackManagerForRetrieverRun
  ): Promise<Document<SeiznDocumentMetadata>[]> {
    // Build retrieval request
    const request: RetrievalRequest = {
      query,
      collectionId: this.collectionId,
      topK: this.topK,
      minScore: this.minScore,
      rerank: this.rerank,
      filters: this.filters,
      includeMetadata: true,
      traceMetadata: {
        source: 'langchain',
        retriever: 'SeiznRetriever',
      },
    };

    // Execute retrieval
    const response = await this.client.retrieve(request);

    // Convert Seizn contexts to LangChain documents
    const documents = this.convertToDocuments(response);

    // Emit retrieval event for callbacks
    if (runManager) {
      await runManager.handleRetrieverEnd(documents);
    }

    return documents;
  }

  /**
   * Convert Seizn retrieval response to LangChain documents
   */
  private convertToDocuments(
    response: RetrievalResponse
  ): Document<SeiznDocumentMetadata>[] {
    // Create citation lookup map
    const citationMap = new Map<string, (typeof response.citations)[0]>();
    for (const citation of response.citations) {
      for (const contextId of citation.contextIds) {
        citationMap.set(contextId, citation);
      }
    }

    return response.contexts.map((ctx) => {
      const citation = citationMap.get(ctx.id);

      // Build metadata
      const metadata: SeiznDocumentMetadata = {
        // Include original context metadata
        ...(ctx.metadata ?? {}),
      };

      // Add Seizn-specific metadata if enabled
      if (this.includeSeiznMetadata) {
        metadata.seizn_trace_id = response.traceId;
        metadata.seizn_score = ctx.score;
        metadata.seizn_context_id = ctx.id;
        metadata.seizn_source_id = ctx.sourceId;

        // Add citation information if available
        if (citation) {
          metadata.seizn_citation = {
            source: citation.source,
            url: citation.url,
            page: citation.page,
            section: citation.section,
          };
        }
      }

      return new Document<SeiznDocumentMetadata>({
        pageContent: ctx.content,
        metadata,
      });
    });
  }

  /**
   * Get the last retrieval trace ID.
   * Useful for debugging and audit trails.
   */
  getLastTraceId(): string | undefined {
    // Note: This would require storing the last response
    // For now, trace ID is available in document metadata
    return undefined;
  }

  /**
   * Create a retriever with specific filters.
   * Returns a new retriever instance with the filters applied.
   *
   * @param filters - Metadata filters to apply
   * @returns New SeiznRetriever with filters
   *
   * @example
   * ```typescript
   * const baseRetriever = new SeiznRetriever({ apiKey: '...' });
   * const filteredRetriever = baseRetriever.withFilters({
   *   department: 'engineering',
   *   year: 2024,
   * });
   * ```
   */
  withFilters(filters: Record<string, unknown>): SeiznRetriever {
    return new SeiznRetriever({
      client: this.client,
      collectionId: this.collectionId,
      topK: this.topK,
      minScore: this.minScore,
      rerank: this.rerank,
      filters: { ...this.filters, ...filters },
      includeSeiznMetadata: this.includeSeiznMetadata,
    });
  }

  /**
   * Create a retriever for a specific collection.
   *
   * @param collectionId - Collection ID to search
   * @returns New SeiznRetriever for the collection
   */
  withCollection(collectionId: string): SeiznRetriever {
    return new SeiznRetriever({
      client: this.client,
      collectionId,
      topK: this.topK,
      minScore: this.minScore,
      rerank: this.rerank,
      filters: this.filters,
      includeSeiznMetadata: this.includeSeiznMetadata,
    });
  }

  /**
   * Create a retriever with a different topK value.
   *
   * @param topK - Number of results to return
   * @returns New SeiznRetriever with updated topK
   */
  withTopK(topK: number): SeiznRetriever {
    return new SeiznRetriever({
      client: this.client,
      collectionId: this.collectionId,
      topK,
      minScore: this.minScore,
      rerank: this.rerank,
      filters: this.filters,
      includeSeiznMetadata: this.includeSeiznMetadata,
    });
  }
}

/**
 * Create a SeiznRetriever with the given configuration.
 * Factory function for more concise usage.
 *
 * @param config - Retriever configuration
 * @returns Configured SeiznRetriever instance
 *
 * @example
 * ```typescript
 * import { createSeiznRetriever } from '@seizn/langchain';
 *
 * const retriever = createSeiznRetriever({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   collectionId: 'docs',
 *   topK: 5,
 * });
 * ```
 */
export function createSeiznRetriever(
  config: SeiznRetrieverConfig
): SeiznRetriever {
  return new SeiznRetriever(config);
}
