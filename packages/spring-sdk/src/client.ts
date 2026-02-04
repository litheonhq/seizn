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
