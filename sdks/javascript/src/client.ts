/**
 * Seizn SDK Client
 *
 * AI Memory Infrastructure for Developers.
 *
 * @example
 * ```typescript
 * import { Seizn } from 'seizn';
 *
 * const client = new Seizn({ apiKey: 'sk_...' });
 *
 * // Add a memory
 * await client.add('User prefers dark mode');
 *
 * // Search memories
 * const results = await client.search('user preferences');
 * ```
 */

import type {
  Memory,
  MemoryType,
  SearchResult,
  ExtractedMemory,
  QueryResponse,
  ConversationMessage,
  ConversationSummary,
  Webhook,
  AddMemoryOptions,
  SearchOptions,
  ExtractOptions,
  QueryOptions,
  SummarizeOptions,
  CreateWebhookOptions,
  SeiznConfig,
} from './types';

export class SeiznError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'SeiznError';
    this.status = status;
  }
}

export class Seizn {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  static DEFAULT_BASE_URL = 'https://api.seizn.dev';

  constructor(config: SeiznConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || Seizn.DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeout = config.timeout || 30000;
  }

  private async request<T>(
    method: string,
    path: string,
    options?: {
      params?: Record<string, string | number | boolean>;
      body?: unknown;
    }
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        throw new SeiznError(data.error || 'Request failed', response.status);
      }

      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof SeiznError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new SeiznError('Request timeout', 408);
      }
      throw new SeiznError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  // ==================== Memory Operations ====================

  /**
   * Add a new memory.
   */
  async add(content: string, options?: AddMemoryOptions): Promise<Memory> {
    const result = await this.request<{ success: boolean; memory: Memory }>('POST', '/api/memories', {
      body: {
        content,
        memory_type: options?.memory_type || 'fact',
        tags: options?.tags || [],
        namespace: options?.namespace || 'default',
        scope: options?.scope,
        session_id: options?.session_id,
        agent_id: options?.agent_id,
        source: options?.source,
      },
    });
    return result.memory;
  }

  /**
   * Get a specific memory by ID.
   */
  async get(memoryId: string): Promise<Memory> {
    const result = await this.request<{ success: boolean; memory: Memory }>(
      'GET',
      `/api/memories/${memoryId}`
    );
    return result.memory;
  }

  /**
   * Update a memory.
   */
  async update(
    memoryId: string,
    updates: {
      memory_type?: MemoryType;
      tags?: string[];
      importance?: number;
    }
  ): Promise<Memory> {
    const result = await this.request<{ success: boolean; memory: Memory }>(
      'PATCH',
      `/api/memories/${memoryId}`,
      { body: updates }
    );
    return result.memory;
  }

  /**
   * Delete a memory.
   */
  async delete(memoryId: string): Promise<boolean> {
    await this.request('DELETE', `/api/memories/${memoryId}`);
    return true;
  }

  /**
   * Delete multiple memories.
   */
  async deleteMany(memoryIds: string[]): Promise<number> {
    const result = await this.request<{ success: boolean; deleted: number }>(
      'DELETE',
      '/api/memories',
      { params: { ids: memoryIds.join(',') } }
    );
    return result.deleted;
  }

  /**
   * Search memories.
   */
  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const result = await this.request<{
      success: boolean;
      mode: string;
      results: SearchResult[];
      count: number;
    }>('GET', '/api/memories', {
      params: {
        query,
        mode: options?.mode || 'vector',
        limit: options?.limit || 10,
        threshold: options?.threshold || 0.7,
        ...(options?.namespace && { namespace: options.namespace }),
      },
    });
    return result.results;
  }

  // ==================== AI Operations ====================

  /**
   * Extract memories from a conversation.
   */
  async extract(conversation: string, options?: ExtractOptions): Promise<ExtractedMemory[]> {
    const result = await this.request<{
      message: string;
      extracted: ExtractedMemory[];
      stored: Memory[] | null;
    }>('POST', '/api/extract', {
      body: {
        conversation,
        model: options?.model || 'haiku',
        auto_store: options?.auto_store ?? true,
        namespace: options?.namespace || 'default',
      },
    });
    return result.extracted;
  }

  /**
   * Query with memory-augmented context (RAG).
   */
  async query(query: string, options?: QueryOptions): Promise<QueryResponse> {
    const result = await this.request<QueryResponse>('POST', '/api/query', {
      body: {
        query,
        model: options?.model || 'haiku',
        top_k: options?.top_k || 5,
        namespace: options?.namespace,
        include_memories: options?.include_memories ?? true,
      },
    });
    return result;
  }

  /**
   * Summarize a conversation.
   */
  async summarize(
    messages: ConversationMessage[],
    options?: SummarizeOptions
  ): Promise<ConversationSummary> {
    const result = await this.request<{
      success: boolean;
      summary: ConversationSummary;
      extracted_memories: number;
      saved_memories?: Memory[];
    }>('POST', '/api/summarize', {
      body: {
        messages,
        model: options?.model || 'haiku',
        save_memories: options?.save_memories || false,
        namespace: options?.namespace || 'default',
      },
    });
    return result.summary;
  }

  // ==================== Webhook Operations ====================

  /**
   * List all webhooks.
   */
  async listWebhooks(): Promise<Webhook[]> {
    const result = await this.request<{ success: boolean; webhooks: Webhook[]; count: number }>(
      'GET',
      '/api/webhooks'
    );
    return result.webhooks;
  }

  /**
   * Create a webhook.
   */
  async createWebhook(
    name: string,
    url: string,
    options?: CreateWebhookOptions
  ): Promise<Webhook> {
    const result = await this.request<{ success: boolean; webhook: Webhook; message: string }>(
      'POST',
      '/api/webhooks',
      {
        body: {
          name,
          url,
          events: options?.events || ['memory.created'],
          namespace: options?.namespace,
        },
      }
    );
    return result.webhook;
  }

  /**
   * Update a webhook.
   */
  async updateWebhook(
    webhookId: string,
    updates: {
      name?: string;
      url?: string;
      events?: string[];
      is_active?: boolean;
    }
  ): Promise<Webhook> {
    const result = await this.request<{ success: boolean; webhook: Webhook }>(
      'PATCH',
      '/api/webhooks',
      { body: { id: webhookId, ...updates } }
    );
    return result.webhook;
  }

  /**
   * Delete a webhook.
   */
  async deleteWebhook(webhookId: string): Promise<boolean> {
    await this.request('DELETE', '/api/webhooks', { params: { id: webhookId } });
    return true;
  }
}

export default Seizn;
