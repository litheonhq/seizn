/**
 * Seizn LlamaIndex Memory Retriever
 *
 * A LlamaIndex-compatible BaseRetriever implementation that uses Seizn's
 * Spring Memory API for semantic memory search and retrieval.
 *
 * @example
 * ```typescript
 * import { SeizNMemoryRetriever } from '@/lib/integrations/llamaindex';
 *
 * const retriever = new SeizNMemoryRetriever({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   userId: 'user-123',
 * });
 *
 * // Retrieve relevant memories
 * const nodes = await retriever.retrieve('What are my preferences?');
 *
 * // Async version
 * const asyncNodes = await retriever.aretrieve('user settings');
 * ```
 */

import type {
  Memory,
  MemorySearchResult,
  MemoryType,
  SearchMode,
} from '@/lib/spring/types';

const DEFAULT_BASE_URL = 'https://www.seizn.com/api';
const DEFAULT_TOP_K = 5;
const DEFAULT_THRESHOLD = 0.7;
const DEFAULT_TIMEOUT = 30000;

// ============================================
// LlamaIndex Compatible Types
// ============================================

/**
 * Node metadata for LlamaIndex compatibility
 */
export interface NodeMetadata {
  /** Memory ID */
  memoryId: string;
  /** Memory type */
  memoryType: MemoryType;
  /** Tags associated with the memory */
  tags: string[];
  /** Memory namespace */
  namespace: string;
  /** Memory scope */
  scope: string;
  /** Confidence score */
  confidence: number;
  /** Importance score */
  importance: number;
  /** Source identifier */
  source: string;
  /** Creation timestamp */
  createdAt: string;
  /** Additional metadata */
  [key: string]: unknown;
}

/**
 * LlamaIndex BaseNode compatible interface
 */
export interface BaseNode {
  /** Unique node identifier */
  nodeId: string;
  /** Node content/text */
  text: string;
  /** Node metadata */
  metadata: NodeMetadata;
  /** Embedding vector (optional) */
  embedding?: number[];
}

/**
 * LlamaIndex NodeWithScore compatible interface
 */
export interface NodeWithScore {
  /** The node */
  node: BaseNode;
  /** Relevance score */
  score: number;
}

/**
 * Configuration for SeizNMemoryRetriever
 */
export interface SeizNMemoryRetrieverConfig {
  /** Seizn API key */
  apiKey: string;
  /** Base URL for Seizn API (default: https://www.seizn.com/api) */
  baseUrl?: string;
  /** User ID for scoped memory retrieval */
  userId?: string;
  /** Memory namespace */
  namespace?: string;
  /** Session ID for session-scoped retrieval */
  sessionId?: string;
  /** Search mode: vector, keyword, or hybrid */
  searchMode?: SearchMode;
  /** Default number of results to retrieve */
  topK?: number;
  /** Minimum similarity threshold (0-1) */
  threshold?: number;
  /** Filter by memory types */
  memoryTypes?: MemoryType[];
  /** Filter by tags */
  tags?: string[];
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Error type for Seizn API errors
 */
export interface SeizNError {
  code: string;
  message: string;
  status?: number;
  details?: Record<string, unknown>;
}

/**
 * SeizNMemoryRetriever - LlamaIndex BaseRetriever implementation
 *
 * Provides semantic memory search through Seizn's Spring Memory API.
 * Compatible with LlamaIndex query engines and pipelines.
 *
 * @example Basic Usage
 * ```typescript
 * const retriever = new SeizNMemoryRetriever({
 *   apiKey: 'your-api-key',
 *   userId: 'user-123',
 *   namespace: 'my-app',
 * });
 *
 * const results = await retriever.retrieve('user preferences', 5);
 * ```
 *
 * @example With Query Engine
 * ```typescript
 * const queryEngine = new RetrieverQueryEngine(retriever);
 * const response = await queryEngine.query('What does the user prefer?');
 * ```
 */
export class SeizNMemoryRetriever {
  private readonly config: Required<
    Pick<SeizNMemoryRetrieverConfig, 'apiKey' | 'baseUrl' | 'timeout'>
  > &
    SeizNMemoryRetrieverConfig;

  /**
   * Creates a new SeizNMemoryRetriever instance.
   *
   * @param config - Retriever configuration
   * @throws Error if apiKey is not provided
   */
  constructor(config: SeizNMemoryRetrieverConfig) {
    if (!config.apiKey) {
      throw new Error('Seizn API key is required');
    }

    this.config = {
      ...config,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
    };
  }

  /**
   * Retrieve relevant memories for a query (sync interface).
   *
   * This method is provided for LlamaIndex BaseRetriever compatibility.
   * It internally calls the async implementation.
   *
   * @param query - The search query
   * @param topK - Number of results to return (optional)
   * @returns Promise resolving to array of NodeWithScore objects
   *
   * @example
   * ```typescript
   * const nodes = await retriever.retrieve('user preferences');
   *
   * for (const { node, score } of nodes) {
   *   console.log(`[${score.toFixed(3)}] ${node.text}`);
   * }
   * ```
   */
  async retrieve(query: string, topK?: number): Promise<NodeWithScore[]> {
    return this.aretrieve(query, topK);
  }

  /**
   * Retrieve relevant memories for a query (async interface).
   *
   * Primary async retrieval method that searches the Spring Memory API
   * and returns results as LlamaIndex-compatible NodeWithScore objects.
   *
   * @param query - The search query
   * @param topK - Number of results to return (optional, defaults to config.topK or 5)
   * @returns Promise resolving to array of NodeWithScore objects
   *
   * @example
   * ```typescript
   * const nodes = await retriever.aretrieve('cooking preferences', 10);
   *
   * // Filter high-scoring results
   * const relevant = nodes.filter(n => n.score > 0.8);
   * ```
   */
  async aretrieve(query: string, topK?: number): Promise<NodeWithScore[]> {
    const results = await this.searchMemories(query, topK);
    return results.map((result) => this.toNodeWithScore(result));
  }

  /**
   * Retrieve memories with additional filtering options.
   *
   * @param query - The search query
   * @param options - Additional filtering and retrieval options
   * @returns Promise resolving to array of NodeWithScore objects
   *
   * @example
   * ```typescript
   * const nodes = await retriever.retrieveWithOptions('settings', {
   *   topK: 10,
   *   memoryTypes: ['preference', 'instruction'],
   *   tags: ['ui', 'settings'],
   *   threshold: 0.8,
   * });
   * ```
   */
  async retrieveWithOptions(
    query: string,
    options?: {
      topK?: number;
      memoryTypes?: MemoryType[];
      tags?: string[];
      threshold?: number;
    }
  ): Promise<NodeWithScore[]> {
    const mergedConfig = {
      ...this.config,
      ...options,
    };

    const results = await this.searchMemoriesWithConfig(query, mergedConfig);
    return results.map((result) => this.toNodeWithScore(result));
  }

  /**
   * Get retriever configuration.
   *
   * @returns Current retriever configuration
   */
  getConfig(): SeizNMemoryRetrieverConfig {
    return { ...this.config };
  }

  /**
   * Create a new retriever with updated configuration.
   *
   * @param config - Configuration overrides
   * @returns New SeizNMemoryRetriever instance
   *
   * @example
   * ```typescript
   * const sessionRetriever = retriever.withConfig({
   *   sessionId: 'session-123',
   *   topK: 10,
   * });
   * ```
   */
  withConfig(config: Partial<SeizNMemoryRetrieverConfig>): SeizNMemoryRetriever {
    return new SeizNMemoryRetriever({
      ...this.config,
      ...config,
    });
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Search memories using the Spring Memory API
   */
  private async searchMemories(
    query: string,
    topK?: number
  ): Promise<MemorySearchResult[]> {
    return this.searchMemoriesWithConfig(query, {
      ...this.config,
      topK: topK ?? this.config.topK ?? DEFAULT_TOP_K,
    });
  }

  /**
   * Search memories with custom configuration
   */
  private async searchMemoriesWithConfig(
    query: string,
    config: SeizNMemoryRetrieverConfig & { topK?: number }
  ): Promise<MemorySearchResult[]> {
    const params = new URLSearchParams({
      query,
      limit: String(config.topK ?? DEFAULT_TOP_K),
      threshold: String(config.threshold ?? DEFAULT_THRESHOLD),
      mode: config.searchMode ?? 'hybrid',
    });

    if (config.namespace) {
      params.set('namespace', config.namespace);
    }

    if (config.sessionId) {
      params.set('session_id', config.sessionId);
    }

    if (config.memoryTypes?.length) {
      params.set('memory_types', config.memoryTypes.join(','));
    }

    if (config.tags?.length) {
      params.set('tags', config.tags.join(','));
    }

    const url = `${config.baseUrl}/memories?${params}`;

    const response = await this.request<{
      success: boolean;
      results: MemorySearchResult[];
    }>(url);

    return response.results ?? [];
  }

  /**
   * Convert a MemorySearchResult to NodeWithScore format
   */
  private toNodeWithScore(result: MemorySearchResult): NodeWithScore {
    return {
      node: {
        nodeId: result.id,
        text: result.content,
        metadata: {
          memoryId: result.id,
          memoryType: result.memoryType,
          tags: result.tags,
          namespace: result.namespace,
          scope: result.scope,
          confidence: result.confidence,
          importance: result.importance,
          source: result.source,
          createdAt: result.createdAt,
        },
      },
      score: result.similarity ?? result.combinedScore ?? 0,
    };
  }

  /**
   * Make HTTP request to Seizn API
   */
  private async request<T>(
    url: string,
    options?: {
      method?: string;
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
        method: options?.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error: SeizNError = {
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
 * Create a SeizNMemoryRetriever instance.
 *
 * @param config - Retriever configuration
 * @returns New SeizNMemoryRetriever instance
 *
 * @example
 * ```typescript
 * const retriever = createSeizNMemoryRetriever({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   userId: 'user-123',
 * });
 * ```
 */
export function createSeizNMemoryRetriever(
  config: SeizNMemoryRetrieverConfig
): SeizNMemoryRetriever {
  return new SeizNMemoryRetriever(config);
}

/**
 * Create a session-scoped memory retriever.
 *
 * @param config - Configuration with required sessionId
 * @returns Session-scoped SeizNMemoryRetriever
 *
 * @example
 * ```typescript
 * const sessionRetriever = createSessionRetriever({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   sessionId: 'session-456',
 * });
 * ```
 */
export function createSessionRetriever(
  config: Omit<SeizNMemoryRetrieverConfig, 'sessionId'> & { sessionId: string }
): SeizNMemoryRetriever {
  return new SeizNMemoryRetriever(config);
}

/**
 * Create a user-scoped memory retriever (persistent across sessions).
 *
 * @param config - Configuration with required userId
 * @returns User-scoped SeizNMemoryRetriever
 *
 * @example
 * ```typescript
 * const userRetriever = createUserRetriever({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   userId: 'user-123',
 *   namespace: 'my-app',
 * });
 * ```
 */
export function createUserRetriever(
  config: Omit<SeizNMemoryRetrieverConfig, 'sessionId'> & { userId: string }
): SeizNMemoryRetriever {
  return new SeizNMemoryRetriever({
    ...config,
    sessionId: undefined,
  });
}
