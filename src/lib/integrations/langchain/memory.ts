/**
 * Seizn LangChain Memory
 *
 * A LangChain-compatible chat memory implementation backed by Seizn's
 * Spring Memory API. Provides persistent, semantic memory storage
 * across sessions.
 *
 * @example
 * ```typescript
 * import { SeizMemory } from '@seizn/langchain';
 * import { ConversationChain } from 'langchain/chains';
 *
 * const memory = new SeizMemory({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   namespace: 'my-app',
 *   userId: 'user-123',
 *   sessionId: 'session-456',
 * });
 *
 * const chain = new ConversationChain({
 *   llm: myLLM,
 *   memory,
 * });
 * ```
 */

import type {
  SeizMemoryConfig,
  SeizMemoryVariables,
  ChatMessage,
  SaveContextInput,
  SeizError,
} from './types';
import type { Memory, MemorySearchResult } from '@/lib/spring/types';

const DEFAULT_BASE_URL = 'https://www.seizn.com/api';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_K = 5;
const DEFAULT_THRESHOLD = 0.7;

/**
 * SeizMemory - LangChain BaseChatMemory implementation
 *
 * Provides persistent memory storage using Seizn's Spring Memory API.
 * Supports semantic search for relevant context retrieval.
 */
export class SeizMemory {
  private readonly config: Required<
    Pick<SeizMemoryConfig, 'apiKey' | 'baseUrl' | 'namespace' | 'timeout'>
  > & SeizMemoryConfig;

  /** Memory key for LangChain */
  memoryKey = 'history';

  /** Input keys for LangChain */
  inputKey: string;

  /** Output keys for LangChain */
  outputKey: string;

  /** Return messages as list vs string */
  returnMessages: boolean;

  /** Chat history buffer */
  private chatHistory: ChatMessage[] = [];

  /** LangChain namespace identifier */
  lc_namespace = ['seizn', 'memory'];

  constructor(config: SeizMemoryConfig) {
    if (!config.apiKey) {
      throw new Error('Seizn API key is required');
    }

    this.config = {
      ...config,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      namespace: config.namespace ?? 'default',
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
    };

    this.inputKey = config.inputKey ?? 'input';
    this.outputKey = config.outputKey ?? 'output';
    this.returnMessages = config.returnMessages ?? false;
  }

  /**
   * Get memory keys for LangChain
   */
  get memoryKeys(): string[] {
    return [this.memoryKey];
  }

  /**
   * Load memory variables for the current context.
   * Retrieves relevant memories based on the input.
   *
   * @param values - Input values containing the query
   * @returns Memory variables including chat history and relevant memories
   */
  async loadMemoryVariables(
    values: Record<string, unknown>
  ): Promise<SeizMemoryVariables> {
    const input = values[this.inputKey] as string | undefined;

    // Build chat history
    let history: string | ChatMessage[];

    if (this.returnMessages) {
      history = [...this.chatHistory];
    } else {
      history = this.formatChatHistory();
    }

    // If no input, just return the chat history
    if (!input) {
      return { history };
    }

    // Search for relevant memories
    const memories = await this.searchMemories(input);

    return {
      history,
      memories,
    };
  }

  /**
   * Save context after a conversation turn.
   * Stores both the human input and AI response as memories.
   *
   * @param inputValues - Input values containing human message
   * @param outputValues - Output values containing AI response
   */
  async saveContext(
    inputValues: Record<string, unknown>,
    outputValues: Record<string, unknown>
  ): Promise<void> {
    const input = inputValues[this.inputKey] as string;
    const output = outputValues[this.outputKey] as string;

    if (!input || !output) {
      return;
    }

    // Add to local chat history
    this.chatHistory.push(
      { role: 'human', content: input },
      { role: 'ai', content: output }
    );

    // Save conversation to Seizn Memory
    await this.saveConversation({
      input,
      output,
      metadata: {
        sessionId: this.config.sessionId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Clear all memories for the current session/user.
   */
  async clear(): Promise<void> {
    this.chatHistory = [];

    // Clear remote memories for this session
    if (this.config.sessionId) {
      await this.clearSessionMemories();
    }
  }

  /**
   * Add a memory directly
   */
  async addMemory(
    content: string,
    options?: {
      memoryType?: 'fact' | 'preference' | 'experience' | 'conversation';
      tags?: string[];
      importance?: number;
    }
  ): Promise<Memory> {
    return this.request<{ memory: Memory }>('/memories', {
      method: 'POST',
      body: {
        content,
        memory_type: options?.memoryType ?? 'conversation',
        tags: options?.tags,
        namespace: this.config.namespace,
        scope: this.config.sessionId ? 'session' : 'user',
        session_id: this.config.sessionId,
        source: 'langchain',
      },
    }).then((res) => res.memory);
  }

  /**
   * Search memories by query
   */
  async searchMemories(
    query: string,
    options?: {
      k?: number;
      threshold?: number;
      tags?: string[];
    }
  ): Promise<Memory[]> {
    const params = new URLSearchParams({
      query,
      limit: String(options?.k ?? this.config.k ?? DEFAULT_K),
      threshold: String(options?.threshold ?? this.config.threshold ?? DEFAULT_THRESHOLD),
      namespace: this.config.namespace,
      mode: this.config.searchMode ?? 'hybrid',
    });

    if (options?.tags?.length) {
      params.set('tags', options.tags.join(','));
    }

    if (this.config.sessionId) {
      params.set('session_id', this.config.sessionId);
    }

    const response = await this.request<{ results: MemorySearchResult[] }>(
      `/memories?${params}`
    );

    return response.results;
  }

  /**
   * Delete specific memories by ID
   */
  async deleteMemories(ids: string[]): Promise<number> {
    const response = await this.request<{ deleted: number }>(
      `/memories?ids=${ids.join(',')}`,
      { method: 'DELETE' }
    );

    return response.deleted;
  }

  /**
   * Get chat history as formatted string
   */
  formatChatHistory(): string {
    const humanPrefix = this.config.humanPrefix ?? 'Human';
    const aiPrefix = this.config.aiPrefix ?? 'AI';

    return this.chatHistory
      .map((msg) => {
        const prefix = msg.role === 'human' ? humanPrefix : aiPrefix;
        return `${prefix}: ${msg.content}`;
      })
      .join('\n');
  }

  /**
   * Get raw chat history
   */
  getChatHistory(): ChatMessage[] {
    return [...this.chatHistory];
  }

  /**
   * Set chat history directly
   */
  setChatHistory(messages: ChatMessage[]): void {
    this.chatHistory = [...messages];
  }

  /**
   * Add a message to chat history
   */
  addMessage(message: ChatMessage): void {
    this.chatHistory.push(message);
  }

  /**
   * Get memory configuration
   */
  getConfig(): SeizMemoryConfig {
    return { ...this.config };
  }

  /**
   * Create a new memory instance with updated configuration
   */
  withConfig(config: Partial<SeizMemoryConfig>): SeizMemory {
    const newMemory = new SeizMemory({
      ...this.config,
      ...config,
    });
    newMemory.chatHistory = [...this.chatHistory];
    return newMemory;
  }

  // ============================================
  // Private Methods
  // ============================================

  private async saveConversation(data: SaveContextInput): Promise<void> {
    // Save as a conversation memory with both turns
    const conversationContent = [
      `User: ${data.input}`,
      `Assistant: ${data.output}`,
    ].join('\n');

    await this.request('/memories', {
      method: 'POST',
      body: {
        content: conversationContent,
        memory_type: 'conversation',
        namespace: this.config.namespace,
        scope: this.config.sessionId ? 'session' : 'user',
        session_id: this.config.sessionId,
        source: 'langchain',
        tags: ['conversation'],
      },
    });
  }

  private async clearSessionMemories(): Promise<void> {
    // Get all memories for this session
    const params = new URLSearchParams({
      namespace: this.config.namespace,
      session_id: this.config.sessionId!,
      limit: '1000',
    });

    const response = await this.request<{ results: Memory[] }>(
      `/memories?${params}`
    );

    if (response.results.length > 0) {
      const ids = response.results.map((m) => m.id);
      await this.deleteMemories(ids);
    }
  }

  private async request<T>(
    path: string,
    options?: {
      method?: string;
      body?: unknown;
    }
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const method = options?.method ?? 'GET';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method,
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
        const error: SeizError = {
          code: errorData.code ?? 'REQUEST_FAILED',
          message: errorData.error ?? errorData.message ?? `Request failed with status ${response.status}`,
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
 * Create a SeizMemory instance
 */
export function createSeizMemory(config: SeizMemoryConfig): SeizMemory {
  return new SeizMemory(config);
}

/**
 * Create a session-scoped memory instance
 */
export function createSessionMemory(
  config: Omit<SeizMemoryConfig, 'sessionId'> & { sessionId: string }
): SeizMemory {
  return new SeizMemory(config);
}

/**
 * Create a user-scoped memory instance (persistent across sessions)
 */
export function createUserMemory(
  config: Omit<SeizMemoryConfig, 'sessionId'>
): SeizMemory {
  return new SeizMemory({
    ...config,
    sessionId: undefined,
  });
}
