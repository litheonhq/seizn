/**
 * Seizn LangChain Adapter - Callback Handler
 *
 * LangChain callback handler that sends traces to Seizn for observability.
 * Tracks retriever, LLM, chain, and tool operations.
 *
 * @example
 * ```typescript
 * import { SeiznCallbackHandler } from '@seizn/langchain';
 * import { ChatOpenAI } from '@langchain/openai';
 *
 * const handler = new SeiznCallbackHandler({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   projectId: 'my-project',
 * });
 *
 * const llm = new ChatOpenAI({
 *   callbacks: [handler],
 * });
 * ```
 */

import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Serialized } from '@langchain/core/load/serializable';
import type { Document } from '@langchain/core/documents';
import type {
  LLMResult,
  ChainValues,
  AgentAction,
  AgentFinish,
} from '@langchain/core/outputs';
import type { BaseMessage } from '@langchain/core/messages';
import {
  SeiznClient,
  type SeiznConfig,
  generateTraceId,
  generateSpanId,
} from '@seizn/core';

/**
 * Trace event types
 */
export type TraceEventType =
  | 'retriever_start'
  | 'retriever_end'
  | 'retriever_error'
  | 'llm_start'
  | 'llm_end'
  | 'llm_error'
  | 'llm_new_token'
  | 'chain_start'
  | 'chain_end'
  | 'chain_error'
  | 'tool_start'
  | 'tool_end'
  | 'tool_error'
  | 'agent_action'
  | 'agent_finish'
  | 'text'
  | 'custom';

/**
 * Trace event data structure
 */
export interface TraceEvent {
  /** Event type */
  type: TraceEventType;
  /** Trace ID */
  traceId: string;
  /** Span ID */
  spanId: string;
  /** Parent span ID */
  parentSpanId?: string;
  /** Run ID from LangChain */
  runId: string;
  /** Parent run ID */
  parentRunId?: string;
  /** Event timestamp */
  timestamp: string;
  /** Event name/description */
  name: string;
  /** Event data payload */
  data: Record<string, unknown>;
  /** Duration in milliseconds (for end events) */
  durationMs?: number;
  /** Error information */
  error?: {
    message: string;
    stack?: string;
  };
  /** Tags for categorization */
  tags?: string[];
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Run tracking information
 */
interface RunInfo {
  spanId: string;
  startTime: number;
  type: string;
  name?: string;
  parentRunId?: string;
}

/**
 * Configuration for SeiznCallbackHandler
 */
export interface SeiznCallbackHandlerConfig {
  /** Seizn API key (required if client not provided) */
  apiKey?: string;
  /** Pre-configured SeiznClient */
  client?: SeiznClient;
  /** Project ID for trace grouping */
  projectId?: string;
  /** Session ID for conversation tracking */
  sessionId?: string;
  /** User ID for attribution */
  userId?: string;
  /** Additional tags for all traces */
  tags?: string[];
  /** Custom metadata for all traces */
  metadata?: Record<string, unknown>;
  /** Enable streaming token tracking (default: true) */
  trackTokens?: boolean;
  /** Batch events before sending (default: true) */
  batchEvents?: boolean;
  /** Batch flush interval in ms (default: 1000) */
  batchIntervalMs?: number;
  /** Maximum batch size (default: 100) */
  maxBatchSize?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** Additional Seizn client configuration */
  clientConfig?: Partial<SeiznConfig>;
}

/**
 * LangChain callback handler that sends traces to Seizn.
 *
 * This handler integrates with LangChain's callback system to capture
 * all operations (retriever, LLM, chain, tool, agent) and send them
 * to Seizn for observability and debugging.
 *
 * Features:
 * - Automatic trace propagation
 * - Token streaming capture
 * - Error tracking
 * - Batched event sending
 * - Hierarchical span tracking
 *
 * @example Basic usage
 * ```typescript
 * const handler = new SeiznCallbackHandler({
 *   apiKey: 'szn_live_...',
 *   projectId: 'my-rag-app',
 * });
 *
 * const chain = RunnableSequence.from([
 *   retriever,
 *   llm,
 * ]).withConfig({ callbacks: [handler] });
 * ```
 */
export class SeiznCallbackHandler extends BaseCallbackHandler {
  /** Handler name for LangChain */
  name = 'SeiznCallbackHandler';

  /** Seizn client instance */
  private readonly client: SeiznClient;

  /** Project ID */
  private readonly projectId?: string;

  /** Session ID */
  private readonly sessionId: string;

  /** User ID */
  private readonly userId?: string;

  /** Global tags */
  private readonly tags: string[];

  /** Global metadata */
  private readonly metadata: Record<string, unknown>;

  /** Track streaming tokens */
  private readonly trackTokens: boolean;

  /** Enable batching */
  private readonly batchEvents: boolean;

  /** Batch interval */
  private readonly batchIntervalMs: number;

  /** Max batch size */
  private readonly maxBatchSize: number;

  /** Debug mode */
  private readonly debug: boolean;

  /** Current trace ID */
  private traceId: string;

  /** Run tracking map */
  private runs = new Map<string, RunInfo>();

  /** Event batch queue */
  private eventQueue: TraceEvent[] = [];

  /** Batch timer */
  private batchTimer?: ReturnType<typeof setTimeout>;

  /**
   * Create a new SeiznCallbackHandler
   */
  constructor(config: SeiznCallbackHandlerConfig) {
    super();

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
        'SeiznCallbackHandler requires either an apiKey or a pre-configured client'
      );
    }

    // Store configuration
    this.projectId = config.projectId;
    this.sessionId = config.sessionId ?? generateTraceId();
    this.userId = config.userId;
    this.tags = config.tags ?? [];
    this.metadata = config.metadata ?? {};
    this.trackTokens = config.trackTokens ?? true;
    this.batchEvents = config.batchEvents ?? true;
    this.batchIntervalMs = config.batchIntervalMs ?? 1000;
    this.maxBatchSize = config.maxBatchSize ?? 100;
    this.debug = config.debug ?? false;

    // Initialize trace ID
    this.traceId = generateTraceId();
  }

  // ============================================
  // Retriever Callbacks
  // ============================================

  /**
   * Called when retriever starts
   */
  async handleRetrieverStart(
    retriever: Serialized,
    query: string,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const spanId = generateSpanId();
    const parentSpan = parentRunId ? this.runs.get(parentRunId) : undefined;

    this.runs.set(runId, {
      spanId,
      startTime: Date.now(),
      type: 'retriever',
      name: retriever.id?.join('/') ?? 'retriever',
      parentRunId,
    });

    await this.emitEvent({
      type: 'retriever_start',
      traceId: this.traceId,
      spanId,
      parentSpanId: parentSpan?.spanId,
      runId,
      parentRunId,
      timestamp: new Date().toISOString(),
      name: 'retriever_start',
      data: {
        retriever: retriever.id,
        query,
      },
      tags: [...this.tags, ...(tags ?? [])],
      metadata: { ...this.metadata, ...metadata },
    });
  }

  /**
   * Called when retriever ends
   */
  async handleRetrieverEnd(
    documents: Document[],
    runId: string
  ): Promise<void> {
    const runInfo = this.runs.get(runId);
    if (!runInfo) return;

    const durationMs = Date.now() - runInfo.startTime;
    const parentSpan = runInfo.parentRunId
      ? this.runs.get(runInfo.parentRunId)
      : undefined;

    await this.emitEvent({
      type: 'retriever_end',
      traceId: this.traceId,
      spanId: runInfo.spanId,
      parentSpanId: parentSpan?.spanId,
      runId,
      parentRunId: runInfo.parentRunId,
      timestamp: new Date().toISOString(),
      name: 'retriever_end',
      data: {
        documentCount: documents.length,
        documents: documents.map((doc) => ({
          pageContent:
            doc.pageContent.substring(0, 200) +
            (doc.pageContent.length > 200 ? '...' : ''),
          metadata: doc.metadata,
        })),
      },
      durationMs,
      tags: this.tags,
      metadata: this.metadata,
    });

    this.runs.delete(runId);
  }

  /**
   * Called when retriever errors
   */
  async handleRetrieverError(
    error: Error,
    runId: string
  ): Promise<void> {
    const runInfo = this.runs.get(runId);
    if (!runInfo) return;

    const durationMs = Date.now() - runInfo.startTime;
    const parentSpan = runInfo.parentRunId
      ? this.runs.get(runInfo.parentRunId)
      : undefined;

    await this.emitEvent({
      type: 'retriever_error',
      traceId: this.traceId,
      spanId: runInfo.spanId,
      parentSpanId: parentSpan?.spanId,
      runId,
      parentRunId: runInfo.parentRunId,
      timestamp: new Date().toISOString(),
      name: 'retriever_error',
      data: {},
      durationMs,
      error: {
        message: error.message,
        stack: error.stack,
      },
      tags: this.tags,
      metadata: this.metadata,
    });

    this.runs.delete(runId);
  }

  // ============================================
  // LLM Callbacks
  // ============================================

  /**
   * Called when LLM starts
   */
  async handleLLMStart(
    llm: Serialized,
    prompts: string[],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const spanId = generateSpanId();
    const parentSpan = parentRunId ? this.runs.get(parentRunId) : undefined;

    this.runs.set(runId, {
      spanId,
      startTime: Date.now(),
      type: 'llm',
      name: llm.id?.join('/') ?? 'llm',
      parentRunId,
    });

    await this.emitEvent({
      type: 'llm_start',
      traceId: this.traceId,
      spanId,
      parentSpanId: parentSpan?.spanId,
      runId,
      parentRunId,
      timestamp: new Date().toISOString(),
      name: 'llm_start',
      data: {
        llm: llm.id,
        promptCount: prompts.length,
        prompts: prompts.map((p) =>
          p.substring(0, 500) + (p.length > 500 ? '...' : '')
        ),
        extraParams,
      },
      tags: [...this.tags, ...(tags ?? [])],
      metadata: { ...this.metadata, ...metadata },
    });
  }

  /**
   * Called when LLM ends
   */
  async handleLLMEnd(
    output: LLMResult,
    runId: string
  ): Promise<void> {
    const runInfo = this.runs.get(runId);
    if (!runInfo) return;

    const durationMs = Date.now() - runInfo.startTime;
    const parentSpan = runInfo.parentRunId
      ? this.runs.get(runInfo.parentRunId)
      : undefined;

    await this.emitEvent({
      type: 'llm_end',
      traceId: this.traceId,
      spanId: runInfo.spanId,
      parentSpanId: parentSpan?.spanId,
      runId,
      parentRunId: runInfo.parentRunId,
      timestamp: new Date().toISOString(),
      name: 'llm_end',
      data: {
        generations: output.generations.map((gen) =>
          gen.map((g) => ({
            text:
              g.text.substring(0, 500) + (g.text.length > 500 ? '...' : ''),
            generationInfo: g.generationInfo,
          }))
        ),
        llmOutput: output.llmOutput,
      },
      durationMs,
      tags: this.tags,
      metadata: this.metadata,
    });

    this.runs.delete(runId);
  }

  /**
   * Called when LLM errors
   */
  async handleLLMError(
    error: Error,
    runId: string
  ): Promise<void> {
    const runInfo = this.runs.get(runId);
    if (!runInfo) return;

    const durationMs = Date.now() - runInfo.startTime;
    const parentSpan = runInfo.parentRunId
      ? this.runs.get(runInfo.parentRunId)
      : undefined;

    await this.emitEvent({
      type: 'llm_error',
      traceId: this.traceId,
      spanId: runInfo.spanId,
      parentSpanId: parentSpan?.spanId,
      runId,
      parentRunId: runInfo.parentRunId,
      timestamp: new Date().toISOString(),
      name: 'llm_error',
      data: {},
      durationMs,
      error: {
        message: error.message,
        stack: error.stack,
      },
      tags: this.tags,
      metadata: this.metadata,
    });

    this.runs.delete(runId);
  }

  /**
   * Called for each new token during streaming
   */
  async handleLLMNewToken(
    token: string,
    idx: { prompt: number; completion: number },
    runId: string
  ): Promise<void> {
    if (!this.trackTokens) return;

    const runInfo = this.runs.get(runId);
    if (!runInfo) return;

    // For streaming, we emit lightweight token events
    await this.emitEvent({
      type: 'llm_new_token',
      traceId: this.traceId,
      spanId: runInfo.spanId,
      runId,
      parentRunId: runInfo.parentRunId,
      timestamp: new Date().toISOString(),
      name: 'llm_new_token',
      data: {
        token,
        idx,
      },
      tags: this.tags,
    });
  }

  // ============================================
  // Chain Callbacks
  // ============================================

  /**
   * Called when chain starts
   */
  async handleChainStart(
    chain: Serialized,
    inputs: ChainValues,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const spanId = generateSpanId();
    const parentSpan = parentRunId ? this.runs.get(parentRunId) : undefined;

    this.runs.set(runId, {
      spanId,
      startTime: Date.now(),
      type: 'chain',
      name: chain.id?.join('/') ?? 'chain',
      parentRunId,
    });

    // Start new trace for top-level chains
    if (!parentRunId) {
      this.traceId = generateTraceId();
    }

    await this.emitEvent({
      type: 'chain_start',
      traceId: this.traceId,
      spanId,
      parentSpanId: parentSpan?.spanId,
      runId,
      parentRunId,
      timestamp: new Date().toISOString(),
      name: 'chain_start',
      data: {
        chain: chain.id,
        inputs: this.sanitizeInputs(inputs),
      },
      tags: [...this.tags, ...(tags ?? [])],
      metadata: { ...this.metadata, ...metadata },
    });
  }

  /**
   * Called when chain ends
   */
  async handleChainEnd(
    outputs: ChainValues,
    runId: string
  ): Promise<void> {
    const runInfo = this.runs.get(runId);
    if (!runInfo) return;

    const durationMs = Date.now() - runInfo.startTime;
    const parentSpan = runInfo.parentRunId
      ? this.runs.get(runInfo.parentRunId)
      : undefined;

    await this.emitEvent({
      type: 'chain_end',
      traceId: this.traceId,
      spanId: runInfo.spanId,
      parentSpanId: parentSpan?.spanId,
      runId,
      parentRunId: runInfo.parentRunId,
      timestamp: new Date().toISOString(),
      name: 'chain_end',
      data: {
        outputs: this.sanitizeInputs(outputs),
      },
      durationMs,
      tags: this.tags,
      metadata: this.metadata,
    });

    this.runs.delete(runId);
  }

  /**
   * Called when chain errors
   */
  async handleChainError(
    error: Error,
    runId: string
  ): Promise<void> {
    const runInfo = this.runs.get(runId);
    if (!runInfo) return;

    const durationMs = Date.now() - runInfo.startTime;
    const parentSpan = runInfo.parentRunId
      ? this.runs.get(runInfo.parentRunId)
      : undefined;

    await this.emitEvent({
      type: 'chain_error',
      traceId: this.traceId,
      spanId: runInfo.spanId,
      parentSpanId: parentSpan?.spanId,
      runId,
      parentRunId: runInfo.parentRunId,
      timestamp: new Date().toISOString(),
      name: 'chain_error',
      data: {},
      durationMs,
      error: {
        message: error.message,
        stack: error.stack,
      },
      tags: this.tags,
      metadata: this.metadata,
    });

    this.runs.delete(runId);
  }

  // ============================================
  // Tool Callbacks
  // ============================================

  /**
   * Called when tool starts
   */
  async handleToolStart(
    tool: Serialized,
    input: string,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const spanId = generateSpanId();
    const parentSpan = parentRunId ? this.runs.get(parentRunId) : undefined;

    this.runs.set(runId, {
      spanId,
      startTime: Date.now(),
      type: 'tool',
      name: tool.id?.join('/') ?? 'tool',
      parentRunId,
    });

    await this.emitEvent({
      type: 'tool_start',
      traceId: this.traceId,
      spanId,
      parentSpanId: parentSpan?.spanId,
      runId,
      parentRunId,
      timestamp: new Date().toISOString(),
      name: 'tool_start',
      data: {
        tool: tool.id,
        input:
          input.substring(0, 500) + (input.length > 500 ? '...' : ''),
      },
      tags: [...this.tags, ...(tags ?? [])],
      metadata: { ...this.metadata, ...metadata },
    });
  }

  /**
   * Called when tool ends
   */
  async handleToolEnd(
    output: string,
    runId: string
  ): Promise<void> {
    const runInfo = this.runs.get(runId);
    if (!runInfo) return;

    const durationMs = Date.now() - runInfo.startTime;
    const parentSpan = runInfo.parentRunId
      ? this.runs.get(runInfo.parentRunId)
      : undefined;

    await this.emitEvent({
      type: 'tool_end',
      traceId: this.traceId,
      spanId: runInfo.spanId,
      parentSpanId: parentSpan?.spanId,
      runId,
      parentRunId: runInfo.parentRunId,
      timestamp: new Date().toISOString(),
      name: 'tool_end',
      data: {
        output:
          output.substring(0, 500) + (output.length > 500 ? '...' : ''),
      },
      durationMs,
      tags: this.tags,
      metadata: this.metadata,
    });

    this.runs.delete(runId);
  }

  /**
   * Called when tool errors
   */
  async handleToolError(
    error: Error,
    runId: string
  ): Promise<void> {
    const runInfo = this.runs.get(runId);
    if (!runInfo) return;

    const durationMs = Date.now() - runInfo.startTime;
    const parentSpan = runInfo.parentRunId
      ? this.runs.get(runInfo.parentRunId)
      : undefined;

    await this.emitEvent({
      type: 'tool_error',
      traceId: this.traceId,
      spanId: runInfo.spanId,
      parentSpanId: parentSpan?.spanId,
      runId,
      parentRunId: runInfo.parentRunId,
      timestamp: new Date().toISOString(),
      name: 'tool_error',
      data: {},
      durationMs,
      error: {
        message: error.message,
        stack: error.stack,
      },
      tags: this.tags,
      metadata: this.metadata,
    });

    this.runs.delete(runId);
  }

  // ============================================
  // Agent Callbacks
  // ============================================

  /**
   * Called when agent takes an action
   */
  async handleAgentAction(
    action: AgentAction,
    runId: string
  ): Promise<void> {
    const runInfo = this.runs.get(runId);

    await this.emitEvent({
      type: 'agent_action',
      traceId: this.traceId,
      spanId: runInfo?.spanId ?? generateSpanId(),
      runId,
      parentRunId: runInfo?.parentRunId,
      timestamp: new Date().toISOString(),
      name: 'agent_action',
      data: {
        tool: action.tool,
        toolInput: action.toolInput,
        log: action.log,
      },
      tags: this.tags,
      metadata: this.metadata,
    });
  }

  /**
   * Called when agent finishes
   */
  async handleAgentEnd(
    finish: AgentFinish,
    runId: string
  ): Promise<void> {
    const runInfo = this.runs.get(runId);

    await this.emitEvent({
      type: 'agent_finish',
      traceId: this.traceId,
      spanId: runInfo?.spanId ?? generateSpanId(),
      runId,
      parentRunId: runInfo?.parentRunId,
      timestamp: new Date().toISOString(),
      name: 'agent_finish',
      data: {
        returnValues: finish.returnValues,
        log: finish.log,
      },
      tags: this.tags,
      metadata: this.metadata,
    });
  }

  // ============================================
  // Chat Model Callbacks
  // ============================================

  /**
   * Called when chat model starts
   */
  async handleChatModelStart(
    llm: Serialized,
    messages: BaseMessage[][],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const spanId = generateSpanId();
    const parentSpan = parentRunId ? this.runs.get(parentRunId) : undefined;

    this.runs.set(runId, {
      spanId,
      startTime: Date.now(),
      type: 'chat_model',
      name: llm.id?.join('/') ?? 'chat_model',
      parentRunId,
    });

    await this.emitEvent({
      type: 'llm_start',
      traceId: this.traceId,
      spanId,
      parentSpanId: parentSpan?.spanId,
      runId,
      parentRunId,
      timestamp: new Date().toISOString(),
      name: 'chat_model_start',
      data: {
        llm: llm.id,
        messageCount: messages.reduce((acc, m) => acc + m.length, 0),
        messages: messages.map((batch) =>
          batch.map((msg) => ({
            type: msg._getType(),
            content:
              typeof msg.content === 'string'
                ? msg.content.substring(0, 500) +
                  (msg.content.length > 500 ? '...' : '')
                : '[complex content]',
          }))
        ),
        extraParams,
      },
      tags: [...this.tags, ...(tags ?? [])],
      metadata: { ...this.metadata, ...metadata },
    });
  }

  // ============================================
  // Custom Event Methods
  // ============================================

  /**
   * Emit a custom text event
   */
  async handleText(text: string, runId: string): Promise<void> {
    const runInfo = this.runs.get(runId);

    await this.emitEvent({
      type: 'text',
      traceId: this.traceId,
      spanId: runInfo?.spanId ?? generateSpanId(),
      runId,
      parentRunId: runInfo?.parentRunId,
      timestamp: new Date().toISOString(),
      name: 'text',
      data: {
        text: text.substring(0, 1000) + (text.length > 1000 ? '...' : ''),
      },
      tags: this.tags,
    });
  }

  /**
   * Log a custom event
   */
  async logCustomEvent(
    eventName: string,
    data: Record<string, unknown>,
    runId?: string
  ): Promise<void> {
    const runInfo = runId ? this.runs.get(runId) : undefined;

    await this.emitEvent({
      type: 'custom',
      traceId: this.traceId,
      spanId: runInfo?.spanId ?? generateSpanId(),
      runId: runId ?? 'custom',
      parentRunId: runInfo?.parentRunId,
      timestamp: new Date().toISOString(),
      name: eventName,
      data,
      tags: this.tags,
      metadata: this.metadata,
    });
  }

  // ============================================
  // Internal Methods
  // ============================================

  /**
   * Emit a trace event (batched or immediate)
   */
  private async emitEvent(event: TraceEvent): Promise<void> {
    this.log('Event:', event.type, event.name);

    if (this.batchEvents) {
      this.eventQueue.push(event);

      // Check if we should flush
      if (this.eventQueue.length >= this.maxBatchSize) {
        await this.flush();
      } else if (!this.batchTimer) {
        // Start batch timer
        this.batchTimer = setTimeout(() => {
          this.flush().catch((err) => this.log('Flush error:', err));
        }, this.batchIntervalMs);
      }
    } else {
      await this.sendEvent(event);
    }
  }

  /**
   * Send a single event to Seizn
   */
  private async sendEvent(event: TraceEvent): Promise<void> {
    try {
      // TODO: Implement actual API call to Seizn trace endpoint
      // await this.client.trace(event);

      // For now, log in debug mode
      this.log('Sending event:', event);
    } catch (error) {
      this.log('Error sending event:', error);
    }
  }

  /**
   * Send a batch of events to Seizn
   */
  private async sendBatch(events: TraceEvent[]): Promise<void> {
    try {
      // TODO: Implement actual API call to Seizn batch trace endpoint
      // await this.client.traceBatch(events);

      this.log(`Sending batch of ${events.length} events`);
    } catch (error) {
      this.log('Error sending batch:', error);
    }
  }

  /**
   * Flush pending events
   */
  async flush(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }

    if (this.eventQueue.length === 0) return;

    const events = [...this.eventQueue];
    this.eventQueue = [];

    await this.sendBatch(events);
  }

  /**
   * Sanitize inputs to prevent sensitive data leakage
   */
  private sanitizeInputs(inputs: ChainValues): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(inputs)) {
      if (typeof value === 'string') {
        // Truncate long strings
        sanitized[key] =
          value.substring(0, 500) + (value.length > 500 ? '...' : '');
      } else if (Array.isArray(value)) {
        sanitized[key] = `[Array(${value.length})]`;
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = '[Object]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Debug logging
   */
  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[SeiznCallback]', ...args);
    }
  }

  /**
   * Get current trace ID
   */
  getTraceId(): string {
    return this.traceId;
  }

  /**
   * Set trace ID (for distributed tracing)
   */
  setTraceId(traceId: string): void {
    this.traceId = traceId;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }
}

/**
 * Create a SeiznCallbackHandler with the given configuration.
 *
 * @param config - Handler configuration
 * @returns Configured SeiznCallbackHandler
 */
export function createSeiznCallbackHandler(
  config: SeiznCallbackHandlerConfig
): SeiznCallbackHandler {
  return new SeiznCallbackHandler(config);
}
