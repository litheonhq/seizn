/**
 * Seizn Spring SDK Client
 *
 * TypeScript/JavaScript SDK for the Spring Memory API.
 * Provides a simple interface for memory operations.
 *
 * @example
 * ```typescript
 * import { SpringClient } from '@seizn/spring';
 *
 * const spring = new SpringClient({
 *   apiKey: 'szn_...',
 *   namespace: 'my-app',
 * });
 *
 * // Add a memory
 * await spring.add({
 *   content: 'User prefers dark mode',
 *   memory_type: 'preference',
 * });
 *
 * // Search memories
 * const results = await spring.search('UI preferences');
 * ```
 */

import type {
  SpringClientConfig,
  SpringError,
  AddMemoryRequest,
  AddMemoryResponse,
  SearchMemoriesRequest,
  SearchMemoriesResponse,
  UpdateMemoryRequest,
  UpdateMemoryResponse,
  DeleteMemoriesResponse,
  Memory,
  MemoryExport,
  MemoryImportResult,
  BulkAddRequest,
  BulkAddResponse,
  MemoryStats,
  Edge,
  CreateEdgeRequest,
  GraphNeighbor,
  TemporalSearchRequest,
  TemporalSearchResponse,
  TimelineResponse,
  FactHistoryResponse,
  ChangedFactsResponse,
  TemporalStatusResponse,
  IngestionRule,
  CreateIngestionRuleRequest,
  IngestionSettings,
} from './types';

const DEFAULT_BASE_URL = 'https://www.seizn.com/api';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRIES = 3;

export class SpringClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly namespace: string;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly onError?: (error: SpringError) => void;

  constructor(config: SpringClientConfig) {
    if (!config.apiKey) {
      throw new Error('API key is required');
    }

    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.namespace = config.namespace ?? 'default';
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.retries = config.retries ?? DEFAULT_RETRIES;
    this.onError = config.onError;
  }

  // ============================================
  // Core Operations
  // ============================================

  /**
   * Add a new memory
   */
  async add(request: AddMemoryRequest): Promise<Memory> {
    const response = await this.request<AddMemoryResponse>('/memories', {
      method: 'POST',
      body: {
        ...request,
        namespace: request.namespace ?? this.namespace,
      },
    });

    return response.memory;
  }

  /**
   * Search for memories
   */
  async search(queryOrRequest: string | SearchMemoriesRequest): Promise<SearchMemoriesResponse> {
    const params =
      typeof queryOrRequest === 'string'
        ? { query: queryOrRequest }
        : queryOrRequest;

    const searchParams = new URLSearchParams({
      query: params.query,
      limit: String(params.limit ?? 10),
      threshold: String(params.threshold ?? 0.7),
      namespace: params.namespace ?? this.namespace,
      mode: params.mode ?? 'vector',
    });

    if (params.tags?.length) {
      searchParams.set('tags', params.tags.join(','));
    }

    return this.request<SearchMemoriesResponse>(`/memories?${searchParams}`);
  }

  /**
   * Get a memory by ID
   */
  async get(id: string): Promise<Memory> {
    const response = await this.request<{ success: boolean; memory: Memory }>(
      `/memories/${id}`
    );
    return response.memory;
  }

  /**
   * Update a memory
   */
  async update(id: string, request: UpdateMemoryRequest): Promise<Memory> {
    const response = await this.request<UpdateMemoryResponse>(`/memories/${id}`, {
      method: 'PUT',
      body: request,
    });
    return response.memory;
  }

  /**
   * Delete memories by IDs
   */
  async delete(ids: string | string[]): Promise<number> {
    const idsArray = Array.isArray(ids) ? ids : [ids];
    const response = await this.request<DeleteMemoriesResponse>(
      `/memories?ids=${idsArray.join(',')}`,
      { method: 'DELETE' }
    );
    return response.deleted;
  }

  // ============================================
  // Bulk Operations
  // ============================================

  /**
   * Add multiple memories at once
   */
  async bulkAdd(memories: AddMemoryRequest[]): Promise<BulkAddResponse> {
    const request: BulkAddRequest = {
      memories: memories.map((m) => ({
        ...m,
        namespace: m.namespace ?? this.namespace,
      })),
    };

    return this.request<BulkAddResponse>('/memories/bulk', {
      method: 'POST',
      body: request,
    });
  }

  // ============================================
  // Export/Import
  // ============================================

  /**
   * Export memories
   */
  async export(options?: { namespace?: string }): Promise<MemoryExport> {
    const params = new URLSearchParams();
    if (options?.namespace) {
      params.set('namespace', options.namespace);
    }

    const queryString = params.toString();
    return this.request<MemoryExport>(
      `/memories/export${queryString ? `?${queryString}` : ''}`
    );
  }

  /**
   * Import memories from export
   */
  async import(data: MemoryExport): Promise<MemoryImportResult> {
    return this.request<MemoryImportResult>('/memories/import', {
      method: 'POST',
      body: data,
    });
  }

  // ============================================
  // Analytics
  // ============================================

  /**
   * Get memory statistics
   */
  async stats(): Promise<MemoryStats> {
    return this.request<MemoryStats>('/memories/stats');
  }

  // ============================================
  // Helpers
  // ============================================

  /**
   * Quick remember - shorthand for adding a fact
   */
  async remember(content: string, tags?: string[]): Promise<Memory> {
    return this.add({
      content,
      memory_type: 'fact',
      tags,
    });
  }

  /**
   * Quick recall - shorthand for searching
   */
  async recall(query: string, limit = 5): Promise<Memory[]> {
    const response = await this.search({ query, limit });
    return response.results;
  }

  /**
   * Forget - shorthand for deleting
   */
  async forget(ids: string | string[]): Promise<number> {
    return this.delete(ids);
  }

  // ============================================
  // Graph Operations
  // ============================================

  /**
   * Get edges for a memory
   */
  async getEdges(
    memoryId: string,
    options?: { direction?: string; edge_types?: string[]; min_weight?: number }
  ): Promise<Edge[]> {
    const params = new URLSearchParams({
      memory_id: memoryId,
      direction: options?.direction ?? 'both',
      min_weight: String(options?.min_weight ?? 0),
    });
    if (options?.edge_types?.length) {
      params.set('edge_types', options.edge_types.join(','));
    }

    const response = await this.request<{ success: boolean; edges: Edge[] }>(
      `/spring/edges?${params}`
    );
    return response.edges;
  }

  /**
   * Create an edge between two memories
   */
  async createEdge(request: CreateEdgeRequest): Promise<Edge> {
    const response = await this.request<{ success: boolean; edge: Edge }>(
      '/spring/edges',
      { method: 'POST', body: request }
    );
    return response.edge;
  }

  /**
   * Delete an edge
   */
  async deleteEdge(edgeId: string): Promise<boolean> {
    await this.request<{ success: boolean }>(`/spring/edges/${edgeId}`, {
      method: 'DELETE',
    });
    return true;
  }

  /**
   * Get graph neighborhood of a memory
   */
  async getNeighborhood(
    memoryId: string,
    options?: { max_hops?: number; limit?: number; min_weight?: number; edge_types?: string[] }
  ): Promise<GraphNeighbor[]> {
    const params = new URLSearchParams({
      memory_id: memoryId,
      max_hops: String(options?.max_hops ?? 2),
      limit: String(options?.limit ?? 50),
      min_weight: String(options?.min_weight ?? 0),
    });
    if (options?.edge_types?.length) {
      params.set('edge_types', options.edge_types.join(','));
    }

    const response = await this.request<{ success: boolean; neighbors: GraphNeighbor[] }>(
      `/spring/graph/neighborhood?${params}`
    );
    return response.neighbors;
  }

  // ============================================
  // Temporal Operations
  // ============================================

  /**
   * Search memories valid at a specific point in time
   */
  async temporalSearch(request: TemporalSearchRequest): Promise<TemporalSearchResponse> {
    const params = new URLSearchParams({
      valid_at: request.valid_at,
      top_k: String(request.top_k ?? 20),
      min_similarity: String(request.min_similarity ?? 0.5),
      exclude_expired: String(request.exclude_expired ?? true),
      include_superseded: String(request.include_superseded ?? false),
    });
    if (request.query) params.set('query', request.query);
    if (request.types?.length) params.set('types', request.types.join(','));

    return this.request<TemporalSearchResponse>(`/spring/temporal/search?${params}`);
  }

  /**
   * Get memory timeline
   */
  async timeline(options?: {
    start_date?: string;
    end_date?: string;
    types?: string[];
    limit?: number;
  }): Promise<TimelineResponse> {
    const params = new URLSearchParams();
    if (options?.start_date) params.set('start_date', options.start_date);
    if (options?.end_date) params.set('end_date', options.end_date);
    if (options?.types?.length) params.set('types', options.types.join(','));
    if (options?.limit) params.set('limit', String(options.limit));

    const query = params.toString();
    return this.request<TimelineResponse>(
      `/spring/temporal/timeline${query ? `?${query}` : ''}`
    );
  }

  /**
   * Get fact history (all versions including superseded)
   */
  async factHistory(factId: string): Promise<FactHistoryResponse> {
    return this.request<FactHistoryResponse>(`/spring/temporal/history/${factId}`);
  }

  /**
   * Get facts that changed within a time range
   */
  async changedFacts(startDate: string, endDate: string): Promise<ChangedFactsResponse> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });
    return this.request<ChangedFactsResponse>(`/spring/temporal/changes?${params}`);
  }

  /**
   * Get temporal status counts
   */
  async temporalStatus(): Promise<TemporalStatusResponse> {
    return this.request<TemporalStatusResponse>('/spring/temporal/status');
  }

  // ============================================
  // Ingestion Rules
  // ============================================

  /**
   * List ingestion rules
   */
  async listIngestionRules(options?: {
    workspace_id?: string;
    enabled_only?: boolean;
  }): Promise<IngestionRule[]> {
    const params = new URLSearchParams();
    if (options?.workspace_id) params.set('workspace_id', options.workspace_id);
    if (options?.enabled_only) params.set('enabled_only', 'true');

    const query = params.toString();
    const response = await this.request<{ success: boolean; rules: IngestionRule[] }>(
      `/spring/ingestion/rules${query ? `?${query}` : ''}`
    );
    return response.rules;
  }

  /**
   * Create an ingestion rule
   */
  async createIngestionRule(request: CreateIngestionRuleRequest): Promise<IngestionRule> {
    const response = await this.request<{ success: boolean; rule: IngestionRule }>(
      '/spring/ingestion/rules',
      { method: 'POST', body: request }
    );
    return response.rule;
  }

  /**
   * Update an ingestion rule
   */
  async updateIngestionRule(
    ruleId: string,
    updates: Partial<CreateIngestionRuleRequest>
  ): Promise<IngestionRule> {
    const response = await this.request<{ success: boolean; rule: IngestionRule }>(
      `/spring/ingestion/rules/${ruleId}`,
      { method: 'PUT', body: updates }
    );
    return response.rule;
  }

  /**
   * Delete an ingestion rule
   */
  async deleteIngestionRule(ruleId: string): Promise<boolean> {
    await this.request<{ success: boolean }>(`/spring/ingestion/rules/${ruleId}`, {
      method: 'DELETE',
    });
    return true;
  }

  /**
   * Get ingestion settings
   */
  async getIngestionSettings(): Promise<IngestionSettings> {
    const response = await this.request<{ success: boolean; settings: IngestionSettings }>(
      '/spring/ingestion/settings'
    );
    return response.settings;
  }

  /**
   * Update ingestion settings
   */
  async updateIngestionSettings(
    updates: Partial<IngestionSettings>
  ): Promise<IngestionSettings> {
    const response = await this.request<{ success: boolean; settings: IngestionSettings }>(
      '/spring/ingestion/settings',
      { method: 'PUT', body: updates }
    );
    return response.settings;
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

    let lastError: SpringError | null = null;

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
          const error: SpringError = {
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
        } else if ((error as SpringError).code) {
          throw error; // Re-throw SpringError
        } else {
          lastError = {
            code: 'NETWORK_ERROR',
            message: error instanceof Error ? error.message : 'Network error',
          };
        }

        // Wait before retry (exponential backoff)
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
 * Create a Spring client instance
 */
export function createSpringClient(config: SpringClientConfig): SpringClient {
  return new SpringClient(config);
}
