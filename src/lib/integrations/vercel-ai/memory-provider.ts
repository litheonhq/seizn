/**
 * Seizn Vercel AI SDK Memory Tools
 *
 * Provides Vercel AI SDK compatible tools for memory operations.
 * These tools enable AI models to search, store, and manage user memories.
 *
 * @example
 * ```typescript
 * import { createSeizNMemoryTools } from '@/lib/integrations/vercel-ai';
 * import { generateText } from 'ai';
 *
 * const memoryTools = createSeizNMemoryTools({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   userId: 'user-123',
 * });
 *
 * const result = await generateText({
 *   model: openai('gpt-4'),
 *   tools: memoryTools,
 *   prompt: 'What do you remember about my preferences?',
 * });
 * ```
 */

import { tool, Tool } from 'ai';
import { z } from 'zod';
import type { MemoryType, Memory, MemorySearchResult, SearchMode } from '@/lib/spring/types';

// Type helper for tools with execute
type ExecutableTool<TParams extends z.ZodTypeAny, TResult> = Tool<TParams, TResult> & {
  execute: (params: z.infer<TParams>) => Promise<TResult>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createTool = tool as any;

const DEFAULT_BASE_URL = 'https://www.seizn.com/api';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_SEARCH_LIMIT = 5;
const DEFAULT_THRESHOLD = 0.7;

// ============================================
// Configuration Types
// ============================================

/**
 * Configuration for Seizn memory tools
 */
export interface SeizNConfig {
  /** Seizn API key */
  apiKey: string;
  /** Base URL for Seizn API (default: https://www.seizn.com/api) */
  baseUrl?: string;
  /** User ID for scoped memory operations */
  userId?: string;
  /** Memory namespace */
  namespace?: string;
  /** Session ID for session-scoped operations */
  sessionId?: string;
  /** Default search mode */
  searchMode?: SearchMode;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Internal resolved configuration
 */
interface ResolvedConfig {
  apiKey: string;
  baseUrl: string;
  userId?: string;
  namespace?: string;
  sessionId?: string;
  searchMode: SearchMode;
  timeout: number;
}

/**
 * Error type for Seizn API errors
 */
interface SeizNError {
  code: string;
  message: string;
  status?: number;
  details?: Record<string, unknown>;
}

// ============================================
// Tool Result Types
// ============================================

/**
 * Result from searchMemory tool
 */
export interface SearchMemoryResult {
  success: boolean;
  memories: Array<{
    id: string;
    content: string;
    type: MemoryType;
    tags: string[];
    similarity: number;
    createdAt: string;
  }>;
  count: number;
}

/**
 * Result from storeMemory tool
 */
export interface StoreMemoryResult {
  success: boolean;
  memoryId: string;
  message: string;
}

/**
 * Result from forgetMemory tool
 */
export interface ForgetMemoryResult {
  success: boolean;
  message: string;
}

// ============================================
// Memory Tools Factory
// ============================================

/**
 * Create Seizn memory tools for Vercel AI SDK.
 *
 * Returns a set of tools that enable AI models to:
 * - Search user memories for relevant information
 * - Store new memories (facts, preferences, instructions, episodes)
 * - Remove specific memories
 *
 * @param config - Configuration for the memory tools
 * @returns Object containing searchMemory, storeMemory, and forgetMemory tools
 *
 * @example Basic Usage
 * ```typescript
 * import { createSeizNMemoryTools } from '@/lib/integrations/vercel-ai';
 * import { generateText } from 'ai';
 *
 * const tools = createSeizNMemoryTools({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   userId: 'user-123',
 *   namespace: 'my-app',
 * });
 *
 * const result = await generateText({
 *   model: openai('gpt-4'),
 *   tools,
 *   prompt: 'Remember that I prefer dark mode',
 * });
 * ```
 *
 * @example With Streaming
 * ```typescript
 * import { streamText } from 'ai';
 *
 * const stream = await streamText({
 *   model: openai('gpt-4'),
 *   tools: createSeizNMemoryTools({ apiKey, userId }),
 *   prompt: 'What do you know about my coding preferences?',
 * });
 *
 * for await (const chunk of stream.textStream) {
 *   process.stdout.write(chunk);
 * }
 * ```
 */
export function createSeizNMemoryTools(config: SeizNConfig) {
  const resolvedConfig: ResolvedConfig = {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    userId: config.userId,
    namespace: config.namespace,
    sessionId: config.sessionId,
    searchMode: config.searchMode ?? 'hybrid',
    timeout: config.timeout ?? DEFAULT_TIMEOUT,
  };

  if (!resolvedConfig.apiKey) {
    throw new Error('Seizn API key is required');
  }

  return {
    /**
     * Search user memories for relevant information.
     *
     * This tool allows the AI to search through stored memories
     * to find context relevant to the current conversation.
     */
    searchMemory: createTool({
      description:
        'Search user memories for relevant information. Use this to recall facts, preferences, past instructions, or experiences the user has shared.',
      parameters: z.object({
        query: z
          .string()
          .describe('The search query to find relevant memories'),
        limit: z
          .number()
          .optional()
          .describe('Maximum number of memories to return (default: 5)'),
        types: z
          .array(z.string())
          .optional()
          .describe(
            'Filter by memory types: fact, preference, instruction, episode, relationship, conversation'
          ),
      }),
      execute: async (params: { query: string; limit?: number; types?: string[] }) => {
        return searchMemories(resolvedConfig, params);
      },
    }),

    /**
     * Store new information in user memory.
     *
     * This tool allows the AI to save important information
     * that the user shares during conversation.
     */
    storeMemory: createTool({
      description:
        'Store new information in user memory. Use this to remember facts, preferences, instructions, or important experiences the user mentions.',
      parameters: z.object({
        content: z
          .string()
          .describe('The information to store in memory'),
        type: z
          .enum(['fact', 'preference', 'instruction', 'episode'])
          .describe(
            'Type of memory: fact (objective info), preference (likes/dislikes), instruction (rules/guidelines), episode (events/experiences)'
          ),
        tags: z
          .array(z.string())
          .optional()
          .describe('Tags to categorize the memory for easier retrieval'),
      }),
      execute: async (params: { content: string; type: 'fact' | 'preference' | 'instruction' | 'episode'; tags?: string[] }) => {
        return storeMemory(resolvedConfig, params);
      },
    }),

    /**
     * Remove a specific memory.
     *
     * This tool allows the AI to delete memories when
     * the user requests to forget something.
     */
    forgetMemory: createTool({
      description:
        'Remove a specific memory by its ID. Use this when the user wants to forget or delete specific information.',
      parameters: z.object({
        memoryId: z
          .string()
          .describe('The ID of the memory to delete'),
      }),
      execute: async (params: { memoryId: string }) => {
        return forgetMemory(resolvedConfig, params);
      },
    }),
  };
}

// ============================================
// Tool Implementation Functions
// ============================================

/**
 * Search memories implementation
 */
async function searchMemories(
  config: ResolvedConfig,
  params: { query: string; limit?: number; types?: string[] }
): Promise<SearchMemoryResult> {
  const searchParams = new URLSearchParams({
    query: params.query,
    limit: String(params.limit ?? DEFAULT_SEARCH_LIMIT),
    threshold: String(DEFAULT_THRESHOLD),
    mode: config.searchMode,
  });

  if (config.namespace) {
    searchParams.set('namespace', config.namespace);
  }

  if (config.sessionId) {
    searchParams.set('session_id', config.sessionId);
  }

  if (params.types?.length) {
    searchParams.set('memory_types', params.types.join(','));
  }

  const url = `${config.baseUrl}/memories?${searchParams}`;

  try {
    const response = await makeRequest<{
      success: boolean;
      results: MemorySearchResult[];
    }>(url, config);

    return {
      success: true,
      memories: (response.results ?? []).map((m) => ({
        id: m.id,
        content: m.content,
        type: m.memoryType,
        tags: m.tags,
        similarity: m.similarity ?? m.combinedScore ?? 0,
        createdAt: m.createdAt,
      })),
      count: response.results?.length ?? 0,
    };
  } catch {
    return {
      success: false,
      memories: [],
      count: 0,
    };
  }
}

/**
 * Store memory implementation
 */
async function storeMemory(
  config: ResolvedConfig,
  params: { content: string; type: 'fact' | 'preference' | 'instruction' | 'episode'; tags?: string[] }
): Promise<StoreMemoryResult> {
  const url = `${config.baseUrl}/memories`;

  // Map 'episode' to 'experience' for API compatibility
  const memoryType: MemoryType = params.type === 'episode' ? 'experience' : params.type;

  try {
    const response = await makeRequest<{
      success: boolean;
      memory: Memory;
    }>(
      url,
      config,
      {
        method: 'POST',
        body: {
          content: params.content,
          memory_type: memoryType,
          tags: params.tags ?? [],
          namespace: config.namespace,
          scope: config.sessionId ? 'session' : 'user',
          session_id: config.sessionId,
          source: 'vercel-ai',
        },
      }
    );

    return {
      success: true,
      memoryId: response.memory.id,
      message: `Successfully stored ${params.type}: "${params.content.slice(0, 50)}${params.content.length > 50 ? '...' : ''}"`,
    };
  } catch (error) {
    const seiznError = error as SeizNError;
    return {
      success: false,
      memoryId: '',
      message: `Failed to store memory: ${seiznError.message ?? 'Unknown error'}`,
    };
  }
}

/**
 * Forget memory implementation
 */
async function forgetMemory(
  config: ResolvedConfig,
  params: { memoryId: string }
): Promise<ForgetMemoryResult> {
  const url = `${config.baseUrl}/memories?ids=${params.memoryId}`;

  try {
    const response = await makeRequest<{
      success: boolean;
      deleted: number;
    }>(url, config, { method: 'DELETE' });

    if (response.deleted > 0) {
      return {
        success: true,
        message: `Successfully deleted memory ${params.memoryId}`,
      };
    } else {
      return {
        success: false,
        message: `Memory ${params.memoryId} not found`,
      };
    }
  } catch (error) {
    const seiznError = error as SeizNError;
    return {
      success: false,
      message: `Failed to delete memory: ${seiznError.message ?? 'Unknown error'}`,
    };
  }
}

// ============================================
// HTTP Request Helper
// ============================================

/**
 * Make HTTP request to Seizn API
 */
async function makeRequest<T>(
  url: string,
  config: ResolvedConfig,
  options?: {
    method?: string;
    body?: unknown;
  }
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  try {
    const response = await fetch(url, {
      method: options?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
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
        message: `Request timed out after ${config.timeout}ms`,
      } as SeizNError;
    }

    throw error;
  }
}

// ============================================
// Additional Tool Factories
// ============================================

/**
 * Create a minimal set of memory tools (search only).
 *
 * Use this when you only want read-only memory access.
 *
 * @param config - Configuration for the memory tools
 * @returns Object containing only the searchMemory tool
 *
 * @example
 * ```typescript
 * const readOnlyTools = createReadOnlyMemoryTools({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   userId: 'user-123',
 * });
 * ```
 */
export function createReadOnlyMemoryTools(config: SeizNConfig) {
  const allTools = createSeizNMemoryTools(config);
  return {
    searchMemory: allTools.searchMemory,
  };
}

/**
 * Create memory tools with custom tool names.
 *
 * Use this when you need to customize tool names for your application.
 *
 * @param config - Configuration for the memory tools
 * @param names - Custom names for each tool
 * @returns Object containing renamed memory tools
 *
 * @example
 * ```typescript
 * const tools = createNamedMemoryTools(
 *   { apiKey, userId },
 *   {
 *     search: 'recall',
 *     store: 'remember',
 *     forget: 'forget',
 *   }
 * );
 * ```
 */
export function createNamedMemoryTools(
  config: SeizNConfig,
  names: { search?: string; store?: string; forget?: string }
) {
  const tools = createSeizNMemoryTools(config);
  const result: Record<string, typeof tools.searchMemory | typeof tools.storeMemory | typeof tools.forgetMemory> = {};

  if (names.search) {
    result[names.search] = tools.searchMemory;
  } else {
    result.searchMemory = tools.searchMemory;
  }

  if (names.store) {
    result[names.store] = tools.storeMemory;
  } else {
    result.storeMemory = tools.storeMemory;
  }

  if (names.forget) {
    result[names.forget] = tools.forgetMemory;
  } else {
    result.forgetMemory = tools.forgetMemory;
  }

  return result;
}
