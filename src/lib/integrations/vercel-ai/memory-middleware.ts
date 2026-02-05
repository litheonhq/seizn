/**
 * Seizn Vercel AI SDK Memory Middleware
 *
 * Provides middleware for automatic context injection from Seizn memories
 * into Vercel AI SDK requests.
 *
 * @example
 * ```typescript
 * import { withSeizNMemory } from '@/lib/integrations/vercel-ai';
 * import { generateText } from 'ai';
 *
 * const middleware = withSeizNMemory({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   userId: 'user-123',
 * });
 *
 * // Use in API route
 * export async function POST(request: Request) {
 *   const enhancedRequest = await middleware(request);
 *   // Process with enriched context
 * }
 * ```
 */

import type { MemorySearchResult, SearchMode } from '@/lib/spring/types';

const DEFAULT_BASE_URL = 'https://www.seizn.com/api';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_CONTEXT_LIMIT = 5;
const DEFAULT_THRESHOLD = 0.7;

// ============================================
// Configuration Types
// ============================================

/**
 * Configuration for Seizn memory middleware
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
 * Middleware context provided to the handler
 */
export interface MiddlewareContext {
  /** Original request body */
  body: Record<string, unknown>;
  /** Retrieved memories for context */
  memories: MemoryContext[];
  /** User ID if available */
  userId?: string;
  /** Session ID if available */
  sessionId?: string;
  /** Formatted memory context string */
  formattedContext: string;
}

/**
 * Memory context item
 */
export interface MemoryContext {
  /** Memory ID */
  id: string;
  /** Memory content */
  content: string;
  /** Memory type */
  type: string;
  /** Relevance score */
  relevance: number;
  /** Tags */
  tags: string[];
}

/**
 * Middleware options for customization
 */
export interface MiddlewareOptions {
  /** Number of memories to retrieve (default: 5) */
  contextLimit?: number;
  /** Minimum similarity threshold (default: 0.7) */
  threshold?: number;
  /** Extract query from specific field in request body */
  queryField?: string;
  /** Custom context formatter */
  formatContext?: (memories: MemoryContext[]) => string;
  /** Memory types to filter */
  memoryTypes?: string[];
  /** Tags to filter */
  tags?: string[];
  /** Whether to inject context into system message */
  injectIntoSystem?: boolean;
  /** Custom system message template */
  systemTemplate?: string;
  /** Callback when memories are retrieved */
  onMemoriesRetrieved?: (memories: MemoryContext[]) => void;
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
}

// ============================================
// Middleware Factory
// ============================================

/**
 * Create middleware for automatic memory context injection.
 *
 * This middleware intercepts incoming requests, searches for relevant
 * memories based on the user's message, and enriches the request with
 * contextual information from the user's memory store.
 *
 * @param config - Base configuration for Seizn
 * @param options - Middleware-specific options
 * @returns Middleware function
 *
 * @example Basic Usage
 * ```typescript
 * const middleware = withSeizNMemory({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   userId: 'user-123',
 * });
 *
 * // In API route handler
 * export async function POST(request: Request) {
 *   const { body, memories, formattedContext } = await middleware(request);
 *
 *   // Use memories in your AI call
 *   const result = await generateText({
 *     model: openai('gpt-4'),
 *     system: `User context:\n${formattedContext}`,
 *     prompt: body.messages[body.messages.length - 1].content,
 *   });
 * }
 * ```
 *
 * @example With Custom Options
 * ```typescript
 * const middleware = withSeizNMemory(
 *   { apiKey, userId },
 *   {
 *     contextLimit: 10,
 *     threshold: 0.8,
 *     memoryTypes: ['preference', 'instruction'],
 *     formatContext: (memories) =>
 *       memories.map(m => `- ${m.content}`).join('\n'),
 *     onMemoriesRetrieved: (memories) =>
 *       console.log(`Retrieved ${memories.length} memories`),
 *   }
 * );
 * ```
 *
 * @example Auto-inject into System Message
 * ```typescript
 * const middleware = withSeizNMemory(
 *   { apiKey, userId },
 *   {
 *     injectIntoSystem: true,
 *     systemTemplate: `You are a helpful assistant.
 *
 * User Context:
 * {{memories}}
 *
 * Use this context to personalize your responses.`,
 *   }
 * );
 * ```
 */
export function withSeizNMemory(
  config: SeizNConfig,
  options?: MiddlewareOptions
) {
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

  const contextLimit = options?.contextLimit ?? DEFAULT_CONTEXT_LIMIT;
  const threshold = options?.threshold ?? DEFAULT_THRESHOLD;
  const queryField = options?.queryField ?? 'messages';
  const formatContext = options?.formatContext ?? defaultContextFormatter;

  /**
   * Middleware function that processes requests and injects memory context.
   *
   * @param request - The incoming Request object
   * @param context - Optional additional context
   * @returns MiddlewareContext with enriched data
   */
  return async function middleware(
    request: Request,
    context?: Record<string, unknown>
  ): Promise<MiddlewareContext> {
    // Parse request body
    let body: Record<string, unknown>;
    try {
      body = await request.clone().json();
    } catch {
      body = {};
    }

    // Extract query from request
    const query = extractQuery(body, queryField);

    // If no query, return empty context
    if (!query) {
      return {
        body,
        memories: [],
        userId: resolvedConfig.userId,
        sessionId: resolvedConfig.sessionId,
        formattedContext: '',
      };
    }

    // Search for relevant memories
    const memories = await searchMemories(resolvedConfig, {
      query,
      limit: contextLimit,
      threshold,
      memoryTypes: options?.memoryTypes,
      tags: options?.tags,
    });

    // Call callback if provided
    if (options?.onMemoriesRetrieved) {
      options.onMemoriesRetrieved(memories);
    }

    // Format context
    const formattedContext = formatContext(memories);

    // Optionally inject into system message
    if (options?.injectIntoSystem && memories.length > 0) {
      body = injectIntoSystemMessage(body, formattedContext, options.systemTemplate);
    }

    return {
      body,
      memories,
      userId: resolvedConfig.userId,
      sessionId: resolvedConfig.sessionId,
      formattedContext,
    };
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Extract the query string from the request body
 */
function extractQuery(body: Record<string, unknown>, queryField: string): string {
  // Handle Vercel AI SDK message format
  if (queryField === 'messages' && Array.isArray(body.messages)) {
    const messages = body.messages as Array<{ role: string; content: string }>;

    // Get the last user message
    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === 'user');

    return lastUserMessage?.content ?? '';
  }

  // Handle direct query field
  const value = body[queryField];
  if (typeof value === 'string') {
    return value;
  }

  // Handle prompt field as fallback
  if (typeof body.prompt === 'string') {
    return body.prompt;
  }

  return '';
}

/**
 * Default context formatter
 */
function defaultContextFormatter(memories: MemoryContext[]): string {
  if (memories.length === 0) {
    return '';
  }

  const lines = memories.map((m) => {
    const typeLabel = m.type.charAt(0).toUpperCase() + m.type.slice(1);
    return `[${typeLabel}] ${m.content}`;
  });

  return `Relevant user memories:\n${lines.join('\n')}`;
}

/**
 * Inject memory context into system message
 */
function injectIntoSystemMessage(
  body: Record<string, unknown>,
  formattedContext: string,
  template?: string
): Record<string, unknown> {
  const messages = body.messages as Array<{ role: string; content: string }> | undefined;

  if (!messages || !Array.isArray(messages)) {
    return body;
  }

  // Find existing system message or create one
  const systemIndex = messages.findIndex((m) => m.role === 'system');

  if (template) {
    // Use custom template
    const newContent = template.replace('{{memories}}', formattedContext);

    if (systemIndex >= 0) {
      // Append to existing system message
      messages[systemIndex] = {
        ...messages[systemIndex],
        content: newContent,
      };
    } else {
      // Add new system message at the beginning
      messages.unshift({
        role: 'system',
        content: newContent,
      });
    }
  } else {
    // Simple append to system message
    if (systemIndex >= 0) {
      messages[systemIndex] = {
        ...messages[systemIndex],
        content: `${messages[systemIndex].content}\n\n${formattedContext}`,
      };
    } else {
      // Add new system message
      messages.unshift({
        role: 'system',
        content: formattedContext,
      });
    }
  }

  return {
    ...body,
    messages,
  };
}

/**
 * Search memories from Seizn API
 */
async function searchMemories(
  config: ResolvedConfig,
  params: {
    query: string;
    limit: number;
    threshold: number;
    memoryTypes?: string[];
    tags?: string[];
  }
): Promise<MemoryContext[]> {
  const searchParams = new URLSearchParams({
    query: params.query,
    limit: String(params.limit),
    threshold: String(params.threshold),
    mode: config.searchMode,
  });

  if (config.namespace) {
    searchParams.set('namespace', config.namespace);
  }

  if (config.sessionId) {
    searchParams.set('session_id', config.sessionId);
  }

  if (params.memoryTypes?.length) {
    searchParams.set('memory_types', params.memoryTypes.join(','));
  }

  if (params.tags?.length) {
    searchParams.set('tags', params.tags.join(','));
  }

  const url = `${config.baseUrl}/memories?${searchParams}`;

  try {
    const response = await makeRequest<{
      success: boolean;
      results: MemorySearchResult[];
    }>(url, config);

    return (response.results ?? []).map((m) => ({
      id: m.id,
      content: m.content,
      type: m.memoryType,
      relevance: m.similarity ?? m.combinedScore ?? 0,
      tags: m.tags,
    }));
  } catch {
    // Return empty array on error to not break the request
    return [];
  }
}

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
// Additional Middleware Utilities
// ============================================

/**
 * Create a context-only middleware that doesn't modify the request.
 *
 * Use this when you want to retrieve memories but handle injection yourself.
 *
 * @param config - Configuration for Seizn
 * @param options - Middleware options
 * @returns Function that retrieves context for a query
 *
 * @example
 * ```typescript
 * const getContext = createContextRetriever({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   userId: 'user-123',
 * });
 *
 * const { memories, formattedContext } = await getContext('user preferences');
 * ```
 */
export function createContextRetriever(
  config: SeizNConfig,
  options?: Pick<MiddlewareOptions, 'contextLimit' | 'threshold' | 'formatContext' | 'memoryTypes' | 'tags'>
) {
  const resolvedConfig: ResolvedConfig = {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    userId: config.userId,
    namespace: config.namespace,
    sessionId: config.sessionId,
    searchMode: config.searchMode ?? 'hybrid',
    timeout: config.timeout ?? DEFAULT_TIMEOUT,
  };

  const contextLimit = options?.contextLimit ?? DEFAULT_CONTEXT_LIMIT;
  const threshold = options?.threshold ?? DEFAULT_THRESHOLD;
  const formatContext = options?.formatContext ?? defaultContextFormatter;

  /**
   * Retrieve context for a given query.
   *
   * @param query - The search query
   * @returns Object containing memories and formatted context
   */
  return async function getContext(query: string): Promise<{
    memories: MemoryContext[];
    formattedContext: string;
  }> {
    const memories = await searchMemories(resolvedConfig, {
      query,
      limit: contextLimit,
      threshold,
      memoryTypes: options?.memoryTypes,
      tags: options?.tags,
    });

    return {
      memories,
      formattedContext: formatContext(memories),
    };
  };
}

/**
 * Create a simple wrapper for Next.js API routes.
 *
 * @param config - Configuration for Seizn
 * @param options - Middleware options
 * @returns Wrapped handler function
 *
 * @example
 * ```typescript
 * import { withMemoryContext } from '@/lib/integrations/vercel-ai';
 *
 * export const POST = withMemoryContext(
 *   { apiKey, userId },
 *   async (request, context) => {
 *     const { body, memories, formattedContext } = context;
 *
 *     // Your AI logic here
 *     return new Response('OK');
 *   }
 * );
 * ```
 */
export function withMemoryContext(
  config: SeizNConfig,
  handler: (request: Request, context: MiddlewareContext) => Promise<Response>,
  options?: MiddlewareOptions
): (request: Request) => Promise<Response> {
  const middleware = withSeizNMemory(config, options);

  return async function wrappedHandler(request: Request): Promise<Response> {
    const context = await middleware(request);
    return handler(request, context);
  };
}
