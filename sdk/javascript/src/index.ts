/**
 * Seizn - AI Memory SDK for JavaScript/TypeScript
 *
 * Persistent memory for your AI applications.
 */

export interface SeiznConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export interface Memory {
  id: string;
  content: string;
  memory_type: string;
  tags: string[];
  namespace?: string;
  similarity?: number;
  created_at: string;
}

export interface AddMemoryOptions {
  memory_type?: 'fact' | 'preference' | 'experience' | 'relationship' | 'instruction';
  tags?: string[];
  namespace?: string;
  scope?: 'user' | 'session' | 'agent';
  session_id?: string;
  agent_id?: string;
  source?: string;
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
  namespace?: string;
}

export interface ExtractOptions {
  model?: 'haiku' | 'sonnet';
  auto_store?: boolean;
  namespace?: string;
}

export interface ExtractResult {
  message: string;
  extracted: Array<{
    content: string;
    memory_type: string;
    tags: string[];
    confidence: number;
    importance: number;
  }>;
  stored: Memory[] | null;
}

export interface QueryOptions {
  model?: 'haiku' | 'sonnet';
  top_k?: number;
  namespace?: string;
  include_memories?: boolean;
}

export interface QueryResult {
  response: string;
  memories_used?: Array<{
    id: string;
    content: string;
    similarity: number;
  }>;
  model_used: string;
}

export class SeiznError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = 'SeiznError';
  }
}

export class AuthenticationError extends SeiznError {
  constructor(message = 'Invalid API key') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends SeiznError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

export class Seizn {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  /**
   * Create a new Seizn client.
   *
   * @example
   * ```typescript
   * const client = new Seizn({ apiKey: 'your_api_key' });
   *
   * // Add a memory
   * await client.add('User prefers dark mode');
   *
   * // Search memories
   * const results = await client.search('preferences');
   * ```
   */
  constructor(config: SeiznConfig) {
    this.apiKey = config.apiKey || process.env.SEIZN_API_KEY || '';
    if (!this.apiKey) {
      throw new AuthenticationError(
        'API key required. Pass apiKey in config or set SEIZN_API_KEY environment variable.',
      );
    }

    this.baseUrl = (config.baseUrl || process.env.SEIZN_BASE_URL || 'https://seizn.com').replace(
      /\/$/,
      '',
    );
    this.timeout = config.timeout || 30000;
  }

  private async request<T>(
    method: string,
    path: string,
    options?: {
      body?: Record<string, unknown>;
      params?: Record<string, string | number>;
    },
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);

    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        url.searchParams.set(key, String(value));
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 401) {
        throw new AuthenticationError();
      }
      if (response.status === 429) {
        throw new RateLimitError();
      }
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new SeiznError(error.error || 'Request failed', response.status);
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof SeiznError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new SeiznError('Request timeout');
      }
      throw new SeiznError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Add a new memory.
   *
   * @param content - The memory content to store.
   * @param options - Additional options for the memory.
   * @returns The created memory object.
   *
   * @example
   * ```typescript
   * const memory = await client.add('User prefers dark mode', {
   *   memory_type: 'preference',
   *   tags: ['ui', 'settings'],
   * });
   * ```
   */
  async add(content: string, options: AddMemoryOptions = {}): Promise<Memory> {
    const result = await this.request<{ success: boolean; memory: Memory }>('POST', '/api/memories', {
      body: {
        content,
        memory_type: options.memory_type || 'fact',
        tags: options.tags || [],
        namespace: options.namespace || 'default',
        scope: options.scope,
        session_id: options.session_id,
        agent_id: options.agent_id,
        source: options.source,
      },
    });
    return result.memory;
  }

  /**
   * Search memories using semantic similarity.
   *
   * @param query - Search query text.
   * @param options - Search options.
   * @returns Array of matching memories.
   *
   * @example
   * ```typescript
   * const results = await client.search('user preferences', { limit: 5 });
   * ```
   */
  async search(query: string, options: SearchOptions = {}): Promise<Memory[]> {
    const params: Record<string, string | number> = {
      query,
      limit: options.limit || 10,
      threshold: options.threshold || 0.7,
    };
    if (options.namespace) {
      params.namespace = options.namespace;
    }

    const result = await this.request<{ success: boolean; results: Memory[] }>(
      'GET',
      '/api/memories',
      { params },
    );
    return result.results;
  }

  /**
   * Delete memories by their IDs.
   *
   * @param ids - Array of memory IDs to delete.
   * @returns Number of deleted memories.
   *
   * @example
   * ```typescript
   * const deleted = await client.delete(['mem_123', 'mem_456']);
   * ```
   */
  async delete(ids: string[]): Promise<number> {
    const result = await this.request<{ success: boolean; deleted: number }>(
      'DELETE',
      '/api/memories',
      {
        params: { ids: ids.join(',') },
      },
    );
    return result.deleted;
  }

  /**
   * Extract and store memories from a conversation using AI.
   *
   * @param conversation - The conversation text to extract memories from.
   * @param options - Extraction options.
   * @returns Extracted and stored memories.
   *
   * @example
   * ```typescript
   * const result = await client.extract(
   *   'User: I love Python programming!',
   *   { model: 'sonnet' }
   * );
   * ```
   */
  async extract(conversation: string, options: ExtractOptions = {}): Promise<ExtractResult> {
    return this.request<ExtractResult>('POST', '/api/extract', {
      body: {
        conversation,
        model: options.model || 'haiku',
        auto_store: options.auto_store ?? true,
        namespace: options.namespace || 'default',
      },
    });
  }

  /**
   * Get AI-generated response using relevant memories as context (RAG).
   *
   * @param query - The user's question or prompt.
   * @param options - Query options.
   * @returns Response and optionally the memories used.
   *
   * @example
   * ```typescript
   * const result = await client.query('What are my preferences?');
   * console.log(result.response);
   * ```
   */
  async query(query: string, options: QueryOptions = {}): Promise<QueryResult> {
    return this.request<QueryResult>('POST', '/api/query', {
      body: {
        query,
        model: options.model || 'haiku',
        top_k: options.top_k || 5,
        namespace: options.namespace,
        include_memories: options.include_memories ?? true,
      },
    });
  }
}

export default Seizn;
