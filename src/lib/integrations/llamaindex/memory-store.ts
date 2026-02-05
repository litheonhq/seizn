/**
 * Seizn LlamaIndex Vector Store
 *
 * A LlamaIndex-compatible VectorStore implementation that uses Seizn's
 * Spring Memory API for semantic memory storage and retrieval.
 *
 * @example
 * ```typescript
 * import { SeizNVectorStore } from '@/lib/integrations/llamaindex';
 *
 * const vectorStore = new SeizNVectorStore({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   userId: 'user-123',
 * });
 *
 * // Add nodes
 * const ids = await vectorStore.add(nodes);
 *
 * // Query the store
 * const results = await vectorStore.query({
 *   queryStr: 'user preferences',
 *   similarityTopK: 5,
 * });
 * ```
 */

import type { MemoryType, SearchMode } from '@/lib/spring/types';

const DEFAULT_BASE_URL = 'https://www.seizn.com/api';
const DEFAULT_TOP_K = 5;
const DEFAULT_THRESHOLD = 0.7;
const DEFAULT_TIMEOUT = 30000;

// ============================================
// LlamaIndex Compatible Types
// ============================================

/**
 * LlamaIndex BaseNode compatible interface
 */
export interface BaseNode {
  /** Unique node identifier */
  nodeId?: string;
  /** Node ID (alias for nodeId) */
  id_?: string;
  /** Node content/text */
  text?: string;
  /** Get node content */
  getContent?(): string;
  /** Node metadata */
  metadata?: Record<string, unknown>;
  /** Embedding vector */
  embedding?: number[];
}

/**
 * LlamaIndex VectorStoreQuery interface
 */
export interface VectorStoreQuery {
  /** Query string */
  queryStr?: string;
  /** Query embedding vector */
  queryEmbedding?: number[];
  /** Number of results to return */
  similarityTopK?: number;
  /** Metadata filters */
  filters?: VectorStoreFilter;
  /** Minimum similarity threshold */
  similarityThreshold?: number;
  /** Query mode */
  mode?: 'default' | 'sparse' | 'hybrid';
}

/**
 * VectorStore filter interface
 */
export interface VectorStoreFilter {
  /** Filter conditions */
  filters?: Array<{
    key: string;
    value: unknown;
    operator?: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin';
  }>;
}

/**
 * VectorStore query result interface
 */
export interface VectorStoreQueryResult {
  /** Matching nodes */
  nodes: BaseNode[];
  /** Similarity scores for each node */
  similarities: number[];
  /** Node IDs */
  ids: string[];
}

/**
 * Configuration for SeizNVectorStore
 */
export interface SeizNVectorStoreConfig {
  /** Seizn API key */
  apiKey: string;
  /** Base URL for Seizn API (default: https://www.seizn.com/api) */
  baseUrl?: string;
  /** User ID for scoped memory */
  userId?: string;
  /** Memory namespace */
  namespace?: string;
  /** Session ID for session-scoped memory */
  sessionId?: string;
  /** Default memory type for added nodes */
  defaultMemoryType?: MemoryType;
  /** Default tags for added nodes */
  defaultTags?: string[];
  /** Search mode for queries */
  searchMode?: SearchMode;
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
 * SeizNVectorStore - LlamaIndex VectorStore implementation
 *
 * Provides vector storage and retrieval through Seizn's Spring Memory API.
 * Compatible with LlamaIndex index builders and query engines.
 *
 * @example Basic Usage
 * ```typescript
 * const store = new SeizNVectorStore({
 *   apiKey: 'your-api-key',
 *   userId: 'user-123',
 * });
 *
 * // Add documents
 * const ids = await store.add([
 *   { text: 'User prefers dark mode', metadata: { type: 'preference' } },
 * ]);
 *
 * // Query
 * const results = await store.query({
 *   queryStr: 'UI preferences',
 *   similarityTopK: 5,
 * });
 * ```
 *
 * @example With VectorStoreIndex
 * ```typescript
 * const index = await VectorStoreIndex.fromVectorStore(store);
 * const queryEngine = index.asQueryEngine();
 * const response = await queryEngine.query('What are user preferences?');
 * ```
 */
export class SeizNVectorStore {
  private readonly config: Required<
    Pick<SeizNVectorStoreConfig, 'apiKey' | 'baseUrl' | 'timeout'>
  > &
    SeizNVectorStoreConfig;

  /** Store type identifier */
  storeType = 'seizn';

  /** Whether the store is flat (no hierarchy) */
  isFlat = true;

  /**
   * Creates a new SeizNVectorStore instance.
   *
   * @param config - Store configuration
   * @throws Error if apiKey is not provided
   */
  constructor(config: SeizNVectorStoreConfig) {
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
   * Add nodes to the vector store.
   *
   * Converts nodes to memories and stores them in the Spring Memory API.
   * Each node's text content becomes the memory content.
   *
   * @param nodes - Array of BaseNode objects to add
   * @returns Promise resolving to array of assigned memory IDs
   *
   * @example
   * ```typescript
   * const ids = await store.add([
   *   { text: 'User prefers dark mode', metadata: { source: 'settings' } },
   *   { text: 'User speaks English', metadata: { source: 'profile' } },
   * ]);
   * console.log(`Added ${ids.length} memories`);
   * ```
   */
  async add(nodes: BaseNode[]): Promise<string[]> {
    const ids: string[] = [];

    for (const node of nodes) {
      const content = this.getNodeContent(node);
      if (!content) continue;

      const memoryType = this.inferMemoryType(node);
      const tags = this.extractTags(node);

      const response = await this.request<{
        success: boolean;
        memory: { id: string };
      }>('/memories', {
        method: 'POST',
        body: {
          content,
          memory_type: memoryType,
          tags,
          namespace: this.config.namespace,
          scope: this.config.sessionId ? 'session' : 'user',
          session_id: this.config.sessionId,
          source: 'llamaindex',
          metadata: node.metadata,
        },
      });

      if (response.success && response.memory) {
        ids.push(response.memory.id);
      }
    }

    return ids;
  }

  /**
   * Delete a document/memory by reference document ID.
   *
   * @param refDocId - The document/memory ID to delete
   * @returns Promise resolving when deletion is complete
   *
   * @example
   * ```typescript
   * await store.delete('memory-123');
   * ```
   */
  async delete(refDocId: string): Promise<void> {
    await this.request<{ success: boolean; deleted: number }>(
      `/memories?ids=${refDocId}`,
      { method: 'DELETE' }
    );
  }

  /**
   * Delete multiple documents/memories by ID.
   *
   * @param ids - Array of memory IDs to delete
   * @returns Promise resolving to number of deleted memories
   *
   * @example
   * ```typescript
   * const count = await store.deleteMany(['id1', 'id2', 'id3']);
   * console.log(`Deleted ${count} memories`);
   * ```
   */
  async deleteMany(ids: string[]): Promise<number> {
    const response = await this.request<{ success: boolean; deleted: number }>(
      `/memories?ids=${ids.join(',')}`,
      { method: 'DELETE' }
    );

    return response.deleted;
  }

  /**
   * Query the vector store for similar nodes.
   *
   * Searches the Spring Memory API and returns matching memories
   * as LlamaIndex-compatible nodes with similarity scores.
   *
   * @param query - The VectorStoreQuery containing search parameters
   * @returns Promise resolving to VectorStoreQueryResult
   *
   * @example
   * ```typescript
   * const result = await store.query({
   *   queryStr: 'user interface preferences',
   *   similarityTopK: 10,
   *   similarityThreshold: 0.7,
   * });
   *
   * for (let i = 0; i < result.nodes.length; i++) {
   *   console.log(`[${result.similarities[i].toFixed(3)}] ${result.nodes[i].text}`);
   * }
   * ```
   */
  async query(query: VectorStoreQuery): Promise<VectorStoreQueryResult> {
    const queryStr = query.queryStr;
    if (!queryStr) {
      return { nodes: [], similarities: [], ids: [] };
    }

    const params = new URLSearchParams({
      query: queryStr,
      limit: String(query.similarityTopK ?? DEFAULT_TOP_K),
      threshold: String(query.similarityThreshold ?? DEFAULT_THRESHOLD),
      mode: this.mapQueryMode(query.mode),
    });

    if (this.config.namespace) {
      params.set('namespace', this.config.namespace);
    }

    if (this.config.sessionId) {
      params.set('session_id', this.config.sessionId);
    }

    // Apply filters if present
    if (query.filters?.filters?.length) {
      const tags = query.filters.filters
        .filter((f) => f.key === 'tags' && f.operator === 'in')
        .flatMap((f) => (Array.isArray(f.value) ? f.value : [f.value]))
        .filter(Boolean);

      if (tags.length) {
        params.set('tags', tags.join(','));
      }

      const memoryTypes = query.filters.filters
        .filter((f) => f.key === 'memory_type' || f.key === 'memoryType')
        .map((f) => f.value)
        .filter(Boolean);

      if (memoryTypes.length) {
        params.set('memory_types', memoryTypes.join(','));
      }
    }

    const url = `${this.config.baseUrl}/memories?${params}`;

    const response = await this.request<{
      success: boolean;
      results: Array<{
        id: string;
        content: string;
        memoryType: MemoryType;
        tags: string[];
        namespace: string;
        scope: string;
        confidence: number;
        importance: number;
        source: string;
        createdAt: string;
        similarity?: number;
        combinedScore?: number;
      }>;
    }>(url);

    const nodes: BaseNode[] = [];
    const similarities: number[] = [];
    const ids: string[] = [];

    for (const memory of response.results ?? []) {
      nodes.push({
        nodeId: memory.id,
        id_: memory.id,
        text: memory.content,
        metadata: {
          memoryId: memory.id,
          memoryType: memory.memoryType,
          tags: memory.tags,
          namespace: memory.namespace,
          scope: memory.scope,
          confidence: memory.confidence,
          importance: memory.importance,
          source: memory.source,
          createdAt: memory.createdAt,
        },
      });

      similarities.push(memory.similarity ?? memory.combinedScore ?? 0);
      ids.push(memory.id);
    }

    return { nodes, similarities, ids };
  }

  /**
   * Get store configuration.
   *
   * @returns Current store configuration
   */
  getConfig(): SeizNVectorStoreConfig {
    return { ...this.config };
  }

  /**
   * Create a new store with updated configuration.
   *
   * @param config - Configuration overrides
   * @returns New SeizNVectorStore instance
   *
   * @example
   * ```typescript
   * const sessionStore = store.withConfig({
   *   sessionId: 'session-123',
   *   defaultMemoryType: 'conversation',
   * });
   * ```
   */
  withConfig(config: Partial<SeizNVectorStoreConfig>): SeizNVectorStore {
    return new SeizNVectorStore({
      ...this.config,
      ...config,
    });
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Get text content from a node
   */
  private getNodeContent(node: BaseNode): string | undefined {
    if (node.text) return node.text;
    if (node.getContent) return node.getContent();
    return undefined;
  }

  /**
   * Infer memory type from node metadata
   */
  private inferMemoryType(node: BaseNode): MemoryType {
    const metadata = node.metadata ?? {};

    // Check for explicit memory type
    if (metadata.memoryType && this.isValidMemoryType(metadata.memoryType as string)) {
      return metadata.memoryType as MemoryType;
    }
    if (metadata.memory_type && this.isValidMemoryType(metadata.memory_type as string)) {
      return metadata.memory_type as MemoryType;
    }

    // Use default
    return this.config.defaultMemoryType ?? 'fact';
  }

  /**
   * Check if a string is a valid memory type
   */
  private isValidMemoryType(type: string): type is MemoryType {
    return ['fact', 'preference', 'experience', 'relationship', 'instruction', 'conversation'].includes(type);
  }

  /**
   * Extract tags from node metadata
   */
  private extractTags(node: BaseNode): string[] {
    const metadata = node.metadata ?? {};
    const tags: string[] = [];

    // Add default tags
    if (this.config.defaultTags?.length) {
      tags.push(...this.config.defaultTags);
    }

    // Add tags from metadata
    if (Array.isArray(metadata.tags)) {
      tags.push(...(metadata.tags as string[]));
    }

    // Add source as tag if present
    if (typeof metadata.source === 'string') {
      tags.push(`source:${metadata.source}`);
    }

    return [...new Set(tags)]; // Deduplicate
  }

  /**
   * Map LlamaIndex query mode to Seizn search mode
   */
  private mapQueryMode(mode?: 'default' | 'sparse' | 'hybrid'): SearchMode {
    if (this.config.searchMode) return this.config.searchMode;

    switch (mode) {
      case 'sparse':
        return 'keyword';
      case 'hybrid':
        return 'hybrid';
      case 'default':
      default:
        return 'vector';
    }
  }

  /**
   * Make HTTP request to Seizn API
   */
  private async request<T>(
    path: string,
    options?: {
      method?: string;
      body?: unknown;
    }
  ): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.config.baseUrl}${path}`;
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
 * Create a SeizNVectorStore instance.
 *
 * @param config - Store configuration
 * @returns New SeizNVectorStore instance
 *
 * @example
 * ```typescript
 * const store = createSeizNVectorStore({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   userId: 'user-123',
 * });
 * ```
 */
export function createSeizNVectorStore(
  config: SeizNVectorStoreConfig
): SeizNVectorStore {
  return new SeizNVectorStore(config);
}

/**
 * Create a session-scoped vector store.
 *
 * @param config - Configuration with required sessionId
 * @returns Session-scoped SeizNVectorStore
 *
 * @example
 * ```typescript
 * const sessionStore = createSessionVectorStore({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   sessionId: 'session-456',
 * });
 * ```
 */
export function createSessionVectorStore(
  config: Omit<SeizNVectorStoreConfig, 'sessionId'> & { sessionId: string }
): SeizNVectorStore {
  return new SeizNVectorStore(config);
}

/**
 * Create a user-scoped vector store (persistent across sessions).
 *
 * @param config - Configuration with required userId
 * @returns User-scoped SeizNVectorStore
 *
 * @example
 * ```typescript
 * const userStore = createUserVectorStore({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   userId: 'user-123',
 *   namespace: 'my-app',
 * });
 * ```
 */
export function createUserVectorStore(
  config: Omit<SeizNVectorStoreConfig, 'sessionId'> & { userId: string }
): SeizNVectorStore {
  return new SeizNVectorStore({
    ...config,
    sessionId: undefined,
  });
}
