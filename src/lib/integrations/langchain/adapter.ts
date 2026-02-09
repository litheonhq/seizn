/**
 * Seizn LangChain Adapter
 *
 * Provides LangChain-compatible memory tools that connect to Seizn's
 * memory layer. Drop-in replacement for LangMem or LangGraph's built-in memory.
 *
 * @example
 * ```typescript
 * import { SeizNMemoryTool, SeizNSearchTool } from '@/lib/integrations/langchain';
 *
 * const tools = [
 *   new SeizNMemoryTool({ apiKey: 'szn_...', userId: 'user-123' }),
 *   new SeizNSearchTool({ apiKey: 'szn_...', userId: 'user-123' }),
 * ];
 *
 * // Use with LangGraph agent
 * const agent = createReactAgent({ llm, tools });
 * ```
 */

// ============================================
// Types
// ============================================

export interface SeizNLangChainConfig {
  apiKey: string;
  baseUrl?: string;
  userId: string;
  namespace?: string;
  sessionId?: string;
}

interface ToolInput {
  [key: string]: unknown;
}

// ============================================
// Tool Definitions (LangChain-compatible schema)
// ============================================

/**
 * LangChain tool for storing memories in Seizn.
 *
 * Compatible with LangChain's StructuredTool / BaseTool interface.
 */
export class SeizNMemoryTool {
  name = 'seizn_store_memory';
  description = 'Store a fact, preference, or instruction in the user\'s long-term memory. Use this when the user shares information worth remembering across sessions.';

  schema = {
    type: 'object' as const,
    properties: {
      content: { type: 'string', description: 'The memory content to store' },
      type: {
        type: 'string',
        enum: ['fact', 'preference', 'experience', 'instruction'],
        description: 'Type of memory',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional tags for categorization',
      },
    },
    required: ['content'],
  };

  private config: SeizNLangChainConfig;

  constructor(config: SeizNLangChainConfig) {
    this.config = config;
  }

  async call(input: ToolInput): Promise<string> {
    const baseUrl = this.config.baseUrl || 'https://www.seizn.com/api';

    try {
      const response = await fetch(`${baseUrl}/v1/memories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          content: input.content,
          memory_type: input.type || 'fact',
          tags: input.tags || [],
          namespace: this.config.namespace,
          source: 'langchain',
        }),
      });

      if (!response.ok) {
        return `Error storing memory: ${response.status}`;
      }

      const data = await response.json();
      return data.data?.deduplicated
        ? 'Memory already exists (deduplicated).'
        : `Memory stored successfully (ID: ${data.data?.memory?.id}).`;
    } catch (error) {
      return `Error: ${(error as Error).message}`;
    }
  }
}

/**
 * LangChain tool for searching Seizn memories.
 */
export class SeizNSearchTool {
  name = 'seizn_search_memory';
  description = 'Search the user\'s long-term memory for relevant information. Use this to recall past conversations, preferences, or facts about the user.';

  schema = {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', description: 'Maximum results (default: 5)' },
    },
    required: ['query'],
  };

  private config: SeizNLangChainConfig;

  constructor(config: SeizNLangChainConfig) {
    this.config = config;
  }

  async call(input: ToolInput): Promise<string> {
    const baseUrl = this.config.baseUrl || 'https://www.seizn.com/api';
    const limit = (input.limit as number) || 5;

    try {
      const params = new URLSearchParams({
        query: input.query as string,
        limit: String(limit),
        mode: 'hybrid',
      });

      if (this.config.namespace) {
        params.set('namespace', this.config.namespace);
      }

      const response = await fetch(`${baseUrl}/v1/memories?${params}`, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      });

      if (!response.ok) {
        return `Error searching memory: ${response.status}`;
      }

      const data = await response.json();
      const results = data.data?.results || [];

      if (results.length === 0) {
        return 'No relevant memories found.';
      }

      return results
        .map((r: { content: string; memory_type: string; similarity: number }) =>
          `[${r.memory_type}] ${r.content} (relevance: ${(r.similarity * 100).toFixed(0)}%)`
        )
        .join('\n');
    } catch (error) {
      return `Error: ${(error as Error).message}`;
    }
  }
}

/**
 * Create LangChain-compatible tools for Seizn integration.
 *
 * Returns an array of tools that can be used with any LangChain agent.
 */
export function createLangChainTools(
  config: SeizNLangChainConfig
): [SeizNMemoryTool, SeizNSearchTool] {
  return [
    new SeizNMemoryTool(config),
    new SeizNSearchTool(config),
  ];
}

/**
 * LangGraph BaseStore-compatible memory backend.
 *
 * Allows using Seizn as the storage backend for LangGraph's
 * built-in memory system. Implements the minimum interface
 * for LangGraph's BaseStore.
 */
export class SeizNLangGraphStore {
  private config: SeizNLangChainConfig;

  constructor(config: SeizNLangChainConfig) {
    this.config = config;
  }

  /**
   * Get a value by namespace and key.
   */
  async get(namespace: string[], key: string): Promise<{ value: unknown } | null> {
    const baseUrl = this.config.baseUrl || 'https://www.seizn.com/api';
    const ns = namespace.join('/');

    try {
      const params = new URLSearchParams({
        query: key,
        limit: '1',
        namespace: ns,
        mode: 'keyword',
      });

      const response = await fetch(`${baseUrl}/v1/memories?${params}`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });

      if (!response.ok) return null;
      const data = await response.json();
      const results = data.data?.results || [];
      return results.length > 0 ? { value: results[0].content } : null;
    } catch {
      return null;
    }
  }

  /**
   * Put a value by namespace and key.
   */
  async put(namespace: string[], key: string, value: unknown): Promise<void> {
    const baseUrl = this.config.baseUrl || 'https://www.seizn.com/api';
    const ns = namespace.join('/');

    try {
      await fetch(`${baseUrl}/v1/memories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          content: typeof value === 'string' ? value : JSON.stringify(value),
          namespace: ns,
          tags: [key, ...namespace],
          source: 'langgraph_store',
        }),
      });
    } catch {
      // Swallow errors for compatibility
    }
  }

  /**
   * Search across a namespace.
   */
  async search(
    namespace: string[],
    query: string,
    limit: number = 10
  ): Promise<Array<{ key: string; value: unknown; score: number }>> {
    const baseUrl = this.config.baseUrl || 'https://www.seizn.com/api';
    const ns = namespace.join('/');

    try {
      const params = new URLSearchParams({
        query,
        limit: String(limit),
        namespace: ns,
        mode: 'hybrid',
      });

      const response = await fetch(`${baseUrl}/v1/memories?${params}`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });

      if (!response.ok) return [];
      const data = await response.json();
      const results = data.data?.results || [];

      return results.map((r: { id: string; content: string; similarity: number }) => ({
        key: r.id,
        value: r.content,
        score: r.similarity,
      }));
    } catch {
      return [];
    }
  }
}

/**
 * Create a LangGraph-compatible store backed by Seizn.
 */
export function createLangGraphStore(
  config: SeizNLangChainConfig
): SeizNLangGraphStore {
  return new SeizNLangGraphStore(config);
}
