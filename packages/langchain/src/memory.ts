/**
 * Seizn LangChain Adapter - Memory
 *
 * LangChain memory implementation that persists to Seizn Spring Memory API.
 * Enables conversation history persistence across sessions.
 *
 * @example
 * ```typescript
 * import { SeiznMemory } from '@seizn/langchain';
 * import { ConversationChain } from 'langchain/chains';
 *
 * const memory = new SeiznMemory({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   sessionId: 'user-123-session',
 * });
 *
 * const chain = new ConversationChain({
 *   llm,
 *   memory,
 * });
 * ```
 */

import { BaseChatMemory, type BaseChatMemoryInput } from 'langchain/memory';
import {
  type InputValues,
  type OutputValues,
  type MemoryVariables,
} from '@langchain/core/memory';
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
  FunctionMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { ChatMessageHistory } from 'langchain/stores/message/in_memory';
import {
  SeiznClient,
  type SeiznConfig,
  generateTraceId,
} from '@seizn/core';

/**
 * Memory entry type for Seizn Spring API
 */
export type MemoryType =
  | 'fact'
  | 'preference'
  | 'experience'
  | 'relationship'
  | 'instruction';

/**
 * Memory entry structure
 */
export interface MemoryEntry {
  /** Unique entry ID */
  id: string;
  /** Memory type */
  type: MemoryType;
  /** Content of the memory */
  content: string;
  /** Associated metadata */
  metadata?: Record<string, unknown>;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Session ID */
  sessionId?: string;
  /** User ID */
  userId?: string;
  /** Importance score (0-1) */
  importance?: number;
  /** Embedding vector (optional) */
  embedding?: number[];
}

/**
 * Chat message structure for persistence
 */
export interface ChatMessage {
  /** Message role */
  role: 'human' | 'ai' | 'system' | 'function' | 'tool';
  /** Message content */
  content: string;
  /** Additional data */
  additionalKwargs?: Record<string, unknown>;
  /** Timestamp */
  timestamp: string;
  /** Message ID */
  id?: string;
}

/**
 * Configuration for SeiznMemory
 */
export interface SeiznMemoryConfig extends BaseChatMemoryInput {
  /** Seizn API key (required if client not provided) */
  apiKey?: string;
  /** Pre-configured SeiznClient */
  client?: SeiznClient;
  /** Session ID for conversation tracking */
  sessionId?: string;
  /** User ID for attribution */
  userId?: string;
  /** Memory input key (default: 'input') */
  inputKey?: string;
  /** Memory output key (default: 'output') */
  outputKey?: string;
  /** Human message prefix (default: 'Human') */
  humanPrefix?: string;
  /** AI message prefix (default: 'AI') */
  aiPrefix?: string;
  /** Memory variable name (default: 'history') */
  memoryKey?: string;
  /** Return messages as objects (default: true) */
  returnMessages?: boolean;
  /** Maximum number of messages to keep (default: unlimited) */
  maxMessages?: number;
  /** Window size for sliding window (messages to keep, default: unlimited) */
  windowSize?: number;
  /** Auto-save on each message (default: true) */
  autoSave?: boolean;
  /** Save interval in ms for batching (default: 0 = immediate) */
  saveIntervalMs?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Additional Seizn client configuration */
  clientConfig?: Partial<SeiznConfig>;
}

/**
 * Spring Memory API response
 */
interface SpringMemoryResponse {
  memories: MemoryEntry[];
  messages?: ChatMessage[];
  sessionId: string;
  totalCount: number;
}

/**
 * LangChain memory implementation that persists to Seizn Spring Memory API.
 *
 * This memory class integrates with LangChain's memory system while
 * persisting conversation history to Seizn's cloud storage, enabling:
 * - Cross-session memory persistence
 * - Multi-device conversation continuity
 * - Analytics and observability
 * - Memory search and retrieval
 *
 * @example Basic usage
 * ```typescript
 * const memory = new SeiznMemory({
 *   apiKey: 'szn_live_...',
 *   sessionId: 'user-session-123',
 * });
 *
 * // Load existing history
 * await memory.loadMemoryVariables({});
 *
 * // Add messages
 * await memory.saveContext(
 *   { input: 'Hello!' },
 *   { output: 'Hi! How can I help?' }
 * );
 * ```
 *
 * @example With sliding window
 * ```typescript
 * const memory = new SeiznMemory({
 *   apiKey: '...',
 *   sessionId: 'session-123',
 *   windowSize: 10, // Keep last 10 messages
 * });
 * ```
 */
export class SeiznMemory extends BaseChatMemory {
  /** Seizn client instance */
  private readonly client: SeiznClient;

  /** Session ID */
  private readonly sessionId: string;

  /** User ID */
  private readonly userId?: string;

  /** Input key */
  private readonly inputKey: string;

  /** Output key */
  private readonly outputKey: string;

  /** Human prefix */
  private readonly humanPrefix: string;

  /** AI prefix */
  private readonly aiPrefix: string;

  /** Memory variable key */
  private readonly memoryKey: string;

  /** Return messages as objects */
  readonly returnMessages: boolean;

  /** Maximum messages to keep */
  private readonly maxMessages?: number;

  /** Sliding window size */
  private readonly windowSize?: number;

  /** Auto-save flag */
  private readonly autoSave: boolean;

  /** Save interval */
  private readonly saveIntervalMs: number;

  /** Debug mode */
  private readonly debug: boolean;

  /** Pending messages for batched saving */
  private pendingMessages: BaseMessage[] = [];

  /** Save timer */
  private saveTimer?: ReturnType<typeof setTimeout>;

  /** Loaded flag */
  private loaded = false;

  /**
   * Create a new SeiznMemory instance
   */
  constructor(config: SeiznMemoryConfig = {}) {
    super({
      chatHistory: config.chatHistory ?? new ChatMessageHistory(),
      returnMessages: config.returnMessages ?? true,
      inputKey: config.inputKey ?? 'input',
      outputKey: config.outputKey ?? 'output',
    });

    // Initialize client
    if (config.client) {
      this.client = config.client;
    } else if (config.apiKey) {
      this.client = new SeiznClient({
        apiKey: config.apiKey,
        ...config.clientConfig,
      });
    } else {
      throw new Error(
        'SeiznMemory requires either an apiKey or a pre-configured client'
      );
    }

    // Store configuration
    this.sessionId = config.sessionId ?? generateTraceId();
    this.userId = config.userId;
    this.inputKey = config.inputKey ?? 'input';
    this.outputKey = config.outputKey ?? 'output';
    this.humanPrefix = config.humanPrefix ?? 'Human';
    this.aiPrefix = config.aiPrefix ?? 'AI';
    this.memoryKey = config.memoryKey ?? 'history';
    this.returnMessages = config.returnMessages ?? true;
    this.maxMessages = config.maxMessages;
    this.windowSize = config.windowSize;
    this.autoSave = config.autoSave ?? true;
    this.saveIntervalMs = config.saveIntervalMs ?? 0;
    this.debug = config.debug ?? false;
  }

  /**
   * Memory keys for LangChain
   */
  get memoryKeys(): string[] {
    return [this.memoryKey];
  }

  /**
   * Load memory variables (conversation history)
   */
  async loadMemoryVariables(_values: InputValues): Promise<MemoryVariables> {
    // Load from Seizn if not already loaded
    if (!this.loaded) {
      await this.loadFromSeizn();
      this.loaded = true;
    }

    // Get messages from chat history
    const messages = await this.chatHistory.getMessages();

    // Apply window if configured
    let resultMessages = messages;
    if (this.windowSize && messages.length > this.windowSize) {
      resultMessages = messages.slice(-this.windowSize);
    }

    if (this.returnMessages) {
      return { [this.memoryKey]: resultMessages };
    }

    // Convert to string format
    const buffer = this.getBufferString(resultMessages);
    return { [this.memoryKey]: buffer };
  }

  /**
   * Save context from a conversation turn
   */
  async saveContext(
    inputValues: InputValues,
    outputValues: OutputValues
  ): Promise<void> {
    // Extract input and output
    const input = inputValues[this.inputKey];
    const output = outputValues[this.outputKey];

    // Create messages
    const humanMessage = new HumanMessage(String(input));
    const aiMessage = new AIMessage(String(output));

    // Add to chat history
    await this.chatHistory.addMessage(humanMessage);
    await this.chatHistory.addMessage(aiMessage);

    // Enforce max messages if configured
    if (this.maxMessages) {
      await this.trimMessages();
    }

    // Save to Seizn
    if (this.autoSave) {
      if (this.saveIntervalMs > 0) {
        // Batch saving
        this.pendingMessages.push(humanMessage, aiMessage);
        this.scheduleSave();
      } else {
        // Immediate saving
        await this.saveToSeizn([humanMessage, aiMessage]);
      }
    }
  }

  /**
   * Clear all memory
   */
  async clear(): Promise<void> {
    await this.chatHistory.clear();
    this.pendingMessages = [];

    // Clear from Seizn
    await this.clearFromSeizn();
  }

  /**
   * Get buffer string from messages
   */
  private getBufferString(messages: BaseMessage[]): string {
    return messages
      .map((msg) => {
        const prefix =
          msg._getType() === 'human' ? this.humanPrefix : this.aiPrefix;
        return `${prefix}: ${msg.content}`;
      })
      .join('\n');
  }

  /**
   * Trim messages to max limit
   */
  private async trimMessages(): Promise<void> {
    if (!this.maxMessages) return;

    const messages = await this.chatHistory.getMessages();
    if (messages.length > this.maxMessages) {
      // Clear and re-add trimmed messages
      await this.chatHistory.clear();
      const trimmed = messages.slice(-this.maxMessages);
      for (const msg of trimmed) {
        await this.chatHistory.addMessage(msg);
      }
    }
  }

  /**
   * Schedule batched save
   */
  private scheduleSave(): void {
    if (this.saveTimer) return;

    this.saveTimer = setTimeout(async () => {
      const messages = [...this.pendingMessages];
      this.pendingMessages = [];
      this.saveTimer = undefined;

      if (messages.length > 0) {
        await this.saveToSeizn(messages);
      }
    }, this.saveIntervalMs);
  }

  /**
   * Force save pending messages
   */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }

    if (this.pendingMessages.length > 0) {
      const messages = [...this.pendingMessages];
      this.pendingMessages = [];
      await this.saveToSeizn(messages);
    }
  }

  // ============================================
  // Seizn API Integration
  // ============================================

  /**
   * Load conversation history from Seizn
   */
  private async loadFromSeizn(): Promise<void> {
    try {
      this.log('Loading memory from Seizn...');

      // TODO: Implement actual API call to Seizn Spring Memory
      // const response = await this.client.getMemories({
      //   sessionId: this.sessionId,
      //   type: 'conversation',
      // });

      // For now, simulate API response structure
      const response: SpringMemoryResponse = {
        memories: [],
        messages: [],
        sessionId: this.sessionId,
        totalCount: 0,
      };

      // Convert stored messages to LangChain messages
      if (response.messages && response.messages.length > 0) {
        for (const msg of response.messages) {
          const lcMessage = this.chatMessageToLangChain(msg);
          await this.chatHistory.addMessage(lcMessage);
        }

        this.log(`Loaded ${response.messages.length} messages from Seizn`);
      }
    } catch (error) {
      this.log('Error loading from Seizn:', error);
      // Continue with empty history on error
    }
  }

  /**
   * Save messages to Seizn
   */
  private async saveToSeizn(messages: BaseMessage[]): Promise<void> {
    try {
      this.log(`Saving ${messages.length} messages to Seizn...`);

      // Convert LangChain messages to API format
      const chatMessages = messages.map((msg) =>
        this.langChainToChatMessage(msg)
      );

      // TODO: Implement actual API call to Seizn Spring Memory
      // await this.client.saveMemories({
      //   sessionId: this.sessionId,
      //   userId: this.userId,
      //   messages: chatMessages,
      // });

      this.log(`Saved ${chatMessages.length} messages`);
    } catch (error) {
      this.log('Error saving to Seizn:', error);
    }
  }

  /**
   * Clear memory from Seizn
   */
  private async clearFromSeizn(): Promise<void> {
    try {
      this.log('Clearing memory from Seizn...');

      // TODO: Implement actual API call to Seizn Spring Memory
      // await this.client.clearMemories({
      //   sessionId: this.sessionId,
      // });

      this.log('Memory cleared');
    } catch (error) {
      this.log('Error clearing from Seizn:', error);
    }
  }

  /**
   * Convert LangChain message to chat message format
   */
  private langChainToChatMessage(message: BaseMessage): ChatMessage {
    let role: ChatMessage['role'] = 'human';

    const messageType = message._getType();
    switch (messageType) {
      case 'human':
        role = 'human';
        break;
      case 'ai':
        role = 'ai';
        break;
      case 'system':
        role = 'system';
        break;
      case 'function':
        role = 'function';
        break;
      case 'tool':
        role = 'tool';
        break;
      default:
        role = 'human';
    }

    return {
      role,
      content: String(message.content),
      additionalKwargs: message.additional_kwargs,
      timestamp: new Date().toISOString(),
      id: message.id,
    };
  }

  /**
   * Convert chat message to LangChain message
   */
  private chatMessageToLangChain(msg: ChatMessage): BaseMessage {
    const kwargs = {
      content: msg.content,
      additional_kwargs: msg.additionalKwargs ?? {},
    };

    switch (msg.role) {
      case 'human':
        return new HumanMessage(kwargs);
      case 'ai':
        return new AIMessage(kwargs);
      case 'system':
        return new SystemMessage(kwargs);
      case 'function':
        return new FunctionMessage({
          ...kwargs,
          name: (msg.additionalKwargs?.name as string) ?? 'function',
        });
      case 'tool':
        return new ToolMessage({
          ...kwargs,
          tool_call_id:
            (msg.additionalKwargs?.tool_call_id as string) ?? 'tool',
        });
      default:
        return new HumanMessage(kwargs);
    }
  }

  /**
   * Debug logging
   */
  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[SeiznMemory]', ...args);
    }
  }

  // ============================================
  // Memory Entry Methods (Spring API)
  // ============================================

  /**
   * Save a memory entry to Seizn Spring Memory
   *
   * @param content - Memory content
   * @param type - Memory type
   * @param metadata - Additional metadata
   *
   * @example
   * ```typescript
   * await memory.saveMemoryEntry(
   *   'User prefers dark mode',
   *   'preference',
   *   { category: 'ui' }
   * );
   * ```
   */
  async saveMemoryEntry(
    content: string,
    type: MemoryType = 'fact',
    metadata?: Record<string, unknown>
  ): Promise<MemoryEntry> {
    this.log(`Saving memory entry: ${type}`);

    // TODO: Implement actual API call
    // return await this.client.createMemory({
    //   content,
    //   type,
    //   metadata,
    //   sessionId: this.sessionId,
    //   userId: this.userId,
    // });

    // Placeholder response
    return {
      id: generateTraceId(),
      type,
      content,
      metadata,
      sessionId: this.sessionId,
      userId: this.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Search memories by content
   *
   * @param query - Search query
   * @param options - Search options
   * @returns Matching memory entries
   */
  async searchMemories(
    query: string,
    options?: {
      type?: MemoryType;
      limit?: number;
      minScore?: number;
    }
  ): Promise<MemoryEntry[]> {
    this.log(`Searching memories: ${query}`);

    // TODO: Implement actual API call
    // return await this.client.searchMemories({
    //   query,
    //   sessionId: this.sessionId,
    //   userId: this.userId,
    //   type: options?.type,
    //   limit: options?.limit ?? 10,
    //   minScore: options?.minScore,
    // });

    // Placeholder response
    return [];
  }

  /**
   * Get all memories for the current session
   *
   * @param type - Filter by memory type
   * @returns Memory entries
   */
  async getMemories(type?: MemoryType): Promise<MemoryEntry[]> {
    this.log(`Getting memories: ${type ?? 'all'}`);

    // TODO: Implement actual API call
    // return await this.client.getMemories({
    //   sessionId: this.sessionId,
    //   userId: this.userId,
    //   type,
    // });

    // Placeholder response
    return [];
  }

  /**
   * Delete a memory entry
   *
   * @param memoryId - ID of the memory to delete
   */
  async deleteMemory(memoryId: string): Promise<void> {
    this.log(`Deleting memory: ${memoryId}`);

    // TODO: Implement actual API call
    // await this.client.deleteMemory(memoryId);
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Get the session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get the user ID
   */
  getUserId(): string | undefined {
    return this.userId;
  }

  /**
   * Get message count
   */
  async getMessageCount(): Promise<number> {
    const messages = await this.chatHistory.getMessages();
    return messages.length;
  }

  /**
   * Create a new session (returns new memory instance)
   */
  newSession(sessionId?: string): SeiznMemory {
    return new SeiznMemory({
      client: this.client,
      sessionId: sessionId ?? generateTraceId(),
      userId: this.userId,
      inputKey: this.inputKey,
      outputKey: this.outputKey,
      humanPrefix: this.humanPrefix,
      aiPrefix: this.aiPrefix,
      memoryKey: this.memoryKey,
      returnMessages: this.returnMessages,
      maxMessages: this.maxMessages,
      windowSize: this.windowSize,
      autoSave: this.autoSave,
      saveIntervalMs: this.saveIntervalMs,
      debug: this.debug,
    });
  }
}

/**
 * Create a SeiznMemory instance with the given configuration.
 *
 * @param config - Memory configuration
 * @returns Configured SeiznMemory instance
 */
export function createSeiznMemory(config: SeiznMemoryConfig): SeiznMemory {
  return new SeiznMemory(config);
}

/**
 * Create a session-scoped memory instance.
 * Convenience function for creating memory with a specific session.
 *
 * @param apiKey - Seizn API key
 * @param sessionId - Session identifier
 * @param options - Additional options
 * @returns Configured SeiznMemory instance
 */
export function createSessionMemory(
  apiKey: string,
  sessionId: string,
  options?: Partial<SeiznMemoryConfig>
): SeiznMemory {
  return new SeiznMemory({
    apiKey,
    sessionId,
    ...options,
  });
}
