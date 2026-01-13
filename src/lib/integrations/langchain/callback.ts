/**
 * Seizn LangChain Callback Handler
 *
 * A LangChain-compatible callback handler that sends traces to
 * Seizn's Flight Recorder for observability and debugging.
 *
 * Features:
 * - Automatic span/trace creation for LangChain operations
 * - Direct integration with Seizn Flight Recorder
 * - Token usage and cost tracking
 * - Support for chains, LLMs, retrievers, tools, and agents
 *
 * @example
 * ```typescript
 * import { SeizCallbackHandler } from '@seizn/langchain';
 *
 * const handler = new SeizCallbackHandler({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   userId: 'user-123',
 *   plan: 'pro',
 *   onTraceComplete: (trace) => console.log('Trace:', trace.traceId),
 * });
 *
 * const chain = new ConversationChain({
 *   llm: myLLM,
 *   callbacks: [handler],
 * });
 * ```
 *
 * @example Direct Flight Recorder integration
 * ```typescript
 * import { SeizFlightRecorderHandler } from '@seizn/langchain';
 *
 * // For server-side usage with direct Flight Recorder access
 * const handler = new SeizFlightRecorderHandler({
 *   userId: 'user-123',
 *   plan: 'pro',
 *   collectionId: 'my-docs',
 * });
 * ```
 */

import { randomUUID } from 'crypto';
import type {
  SeizCallbackConfig,
  SpanData,
  TraceResult,
} from './types';

const DEFAULT_BASE_URL = 'https://seizn.com/api';

/**
 * SeizCallbackHandler - LangChain BaseCallbackHandler implementation
 *
 * Captures LangChain execution events and sends them to Seizn's
 * Flight Recorder for observability, debugging, and cost tracking.
 */
export class SeizCallbackHandler {
  private readonly config: Required<Pick<SeizCallbackConfig, 'apiKey' | 'baseUrl' | 'userId'>> &
    SeizCallbackConfig;

  /** Current trace ID */
  private traceId: string | null = null;

  /** Request ID for the current run */
  private requestId: string | null = null;

  /** Trace start time */
  private traceStartTime: number | null = null;

  /** Current span stack */
  private spanStack: SpanData[] = [];

  /** All completed spans */
  private completedSpans: SpanData[] = [];

  /** Token usage tracking */
  private tokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  /** Error flag */
  private hasError = false;

  /** Error message */
  private errorMessage?: string;

  /** LangChain namespace identifier */
  lc_namespace = ['seizn', 'callbacks'];

  /** Handler name for identification */
  name = 'SeizCallbackHandler';

  constructor(config: SeizCallbackConfig) {
    if (!config.apiKey) {
      throw new Error('Seizn API key is required');
    }
    if (!config.userId) {
      throw new Error('User ID is required');
    }

    this.config = {
      ...config,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    };
  }

  // ============================================
  // Chain Callbacks
  // ============================================

  /**
   * Called at the start of a chain run
   */
  async handleChainStart(
    chain: { name?: string; lc_namespace?: string[] },
    inputs: Record<string, unknown>,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    // Initialize trace if this is the root chain
    if (!parentRunId) {
      this.initializeTrace(runId);
    }

    this.startSpan(
      `chain:${chain.name ?? 'unknown'}`,
      {
        runId,
        chainName: chain.name,
        inputs: this.sanitizeForLogging(inputs),
        tags,
        ...metadata,
      },
      parentRunId
    );

    this.log('debug', `Chain started: ${chain.name}`, { runId, parentRunId });
  }

  /**
   * Called at the end of a chain run
   */
  async handleChainEnd(
    outputs: Record<string, unknown>,
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    this.endSpan(runId, 'success', {
      outputs: this.sanitizeForLogging(outputs),
    });

    // Finalize trace if this is the root chain
    if (!parentRunId) {
      await this.finalizeTrace();
    }

    this.log('debug', 'Chain ended', { runId });
  }

  /**
   * Called when a chain errors
   */
  async handleChainError(
    error: Error,
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    this.hasError = true;
    this.errorMessage = error.message;

    this.endSpan(runId, 'error', undefined, error.message);

    // Finalize trace if this is the root chain
    if (!parentRunId) {
      await this.finalizeTrace();
    }

    this.config.onError?.(error);
    this.log('error', `Chain error: ${error.message}`, { runId });
  }

  // ============================================
  // LLM Callbacks
  // ============================================

  /**
   * Called at the start of an LLM run
   */
  async handleLLMStart(
    llm: { name?: string },
    prompts: string[],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    // Initialize trace if needed
    if (!this.traceId) {
      this.initializeTrace(runId);
    }

    this.startSpan(
      `llm:${llm.name ?? 'unknown'}`,
      {
        runId,
        llmName: llm.name,
        promptCount: prompts.length,
        promptPreview: prompts[0]?.slice(0, 200),
        tags,
        ...extraParams,
        ...metadata,
      },
      parentRunId
    );

    this.log('debug', `LLM started: ${llm.name}`, { runId, promptCount: prompts.length });
  }

  /**
   * Called at the end of an LLM run
   */
  async handleLLMEnd(
    output: {
      generations: Array<Array<{ text: string }>>;
      llmOutput?: {
        tokenUsage?: {
          promptTokens?: number;
          completionTokens?: number;
          totalTokens?: number;
        };
      };
    },
    runId: string
  ): Promise<void> {
    // Track token usage
    if (output.llmOutput?.tokenUsage) {
      this.tokenUsage.promptTokens += output.llmOutput.tokenUsage.promptTokens ?? 0;
      this.tokenUsage.completionTokens += output.llmOutput.tokenUsage.completionTokens ?? 0;
      this.tokenUsage.totalTokens += output.llmOutput.tokenUsage.totalTokens ?? 0;
    }

    this.endSpan(runId, 'success', {
      generationCount: output.generations.length,
      outputPreview: output.generations[0]?.[0]?.text?.slice(0, 200),
      tokenUsage: output.llmOutput?.tokenUsage,
    });

    this.log('debug', 'LLM ended', { runId, tokenUsage: output.llmOutput?.tokenUsage });
  }

  /**
   * Called when an LLM errors
   */
  async handleLLMError(error: Error, runId: string): Promise<void> {
    this.hasError = true;
    this.errorMessage = error.message;

    this.endSpan(runId, 'error', undefined, error.message);

    this.config.onError?.(error);
    this.log('error', `LLM error: ${error.message}`, { runId });
  }

  /**
   * Called when LLM generates new tokens (streaming)
   */
  async handleLLMNewToken(token: string, runId: string): Promise<void> {
    // Optionally track streaming tokens
    this.log('debug', 'LLM token', { runId, tokenLength: token.length });
  }

  // ============================================
  // Retriever Callbacks
  // ============================================

  /**
   * Called at the start of a retriever run
   */
  async handleRetrieverStart(
    retriever: { name?: string },
    query: string,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    // Initialize trace if needed
    if (!this.traceId) {
      this.initializeTrace(runId);
    }

    this.startSpan(
      `retriever:${retriever.name ?? 'unknown'}`,
      {
        runId,
        retrieverName: retriever.name,
        queryPreview: query.slice(0, 200),
        queryLength: query.length,
        tags,
        ...metadata,
      },
      parentRunId
    );

    this.log('debug', `Retriever started: ${retriever.name}`, { runId, queryLength: query.length });
  }

  /**
   * Called at the end of a retriever run
   */
  async handleRetrieverEnd(
    documents: Array<{ pageContent: string; metadata: Record<string, unknown> }>,
    runId: string
  ): Promise<void> {
    this.endSpan(runId, 'success', {
      documentCount: documents.length,
      documentIds: documents.map((d) => d.metadata.chunkId ?? d.metadata.id).slice(0, 10),
    });

    this.log('debug', 'Retriever ended', { runId, documentCount: documents.length });
  }

  /**
   * Called when a retriever errors
   */
  async handleRetrieverError(error: Error, runId: string): Promise<void> {
    this.hasError = true;
    this.errorMessage = error.message;

    this.endSpan(runId, 'error', undefined, error.message);

    this.config.onError?.(error);
    this.log('error', `Retriever error: ${error.message}`, { runId });
  }

  // ============================================
  // Tool Callbacks
  // ============================================

  /**
   * Called at the start of a tool run
   */
  async handleToolStart(
    tool: { name?: string },
    input: string,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    this.startSpan(
      `tool:${tool.name ?? 'unknown'}`,
      {
        runId,
        toolName: tool.name,
        inputPreview: input.slice(0, 200),
        inputLength: input.length,
        tags,
        ...metadata,
      },
      parentRunId
    );

    this.log('debug', `Tool started: ${tool.name}`, { runId });
  }

  /**
   * Called at the end of a tool run
   */
  async handleToolEnd(output: string, runId: string): Promise<void> {
    this.endSpan(runId, 'success', {
      outputPreview: output.slice(0, 200),
      outputLength: output.length,
    });

    this.log('debug', 'Tool ended', { runId, outputLength: output.length });
  }

  /**
   * Called when a tool errors
   */
  async handleToolError(error: Error, runId: string): Promise<void> {
    this.hasError = true;
    this.errorMessage = error.message;

    this.endSpan(runId, 'error', undefined, error.message);

    this.config.onError?.(error);
    this.log('error', `Tool error: ${error.message}`, { runId });
  }

  // ============================================
  // Agent Callbacks
  // ============================================

  /**
   * Called when an agent takes an action
   */
  async handleAgentAction(
    action: { tool: string; toolInput: string; log: string },
    runId: string
  ): Promise<void> {
    this.startSpan(
      `agent_action:${action.tool}`,
      {
        runId,
        tool: action.tool,
        toolInput: action.toolInput.slice(0, 200),
        log: action.log.slice(0, 200),
      },
      undefined
    );

    this.log('debug', `Agent action: ${action.tool}`, { runId });
  }

  /**
   * Called when an agent finishes
   */
  async handleAgentEnd(
    finish: { returnValues: Record<string, unknown>; log: string },
    runId: string
  ): Promise<void> {
    this.endSpan(runId, 'success', {
      returnValues: this.sanitizeForLogging(finish.returnValues),
      log: finish.log.slice(0, 200),
    });

    this.log('debug', 'Agent ended', { runId });
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Get the current trace result
   */
  getTraceResult(): TraceResult | null {
    if (!this.traceId || !this.requestId || !this.traceStartTime) {
      return null;
    }

    const totalDurationMs = Date.now() - this.traceStartTime;

    return {
      traceId: this.traceId,
      requestId: this.requestId,
      totalDurationMs,
      spans: this.completedSpans,
      tokenUsage: this.tokenUsage.totalTokens > 0 ? this.tokenUsage : undefined,
      estimatedCost: this.estimateCost(),
      hasError: this.hasError,
      error: this.errorMessage,
    };
  }

  /**
   * Reset the handler state
   */
  reset(): void {
    this.traceId = null;
    this.requestId = null;
    this.traceStartTime = null;
    this.spanStack = [];
    this.completedSpans = [];
    this.tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    this.hasError = false;
    this.errorMessage = undefined;
  }

  /**
   * Get handler configuration
   */
  getConfig(): SeizCallbackConfig {
    return { ...this.config };
  }

  // ============================================
  // Private Methods
  // ============================================

  private initializeTrace(runId: string): void {
    this.reset();
    this.traceId = randomUUID();
    this.requestId = runId;
    this.traceStartTime = Date.now();

    this.log('info', 'Trace initialized', { traceId: this.traceId, requestId: runId });
  }

  private startSpan(
    name: string,
    metadata: Record<string, unknown>,
    parentRunId?: string
  ): SpanData {
    const span: SpanData = {
      name,
      startTime: Date.now(),
      status: 'running',
      input: metadata,
      children: [],
      metadata: {
        ...this.config.metadata,
        parentRunId,
      },
    };

    // Find parent span and add as child
    if (parentRunId) {
      const parentSpan = this.findSpan(parentRunId);
      if (parentSpan) {
        parentSpan.children.push(span);
      }
    }

    this.spanStack.push(span);
    return span;
  }

  private endSpan(
    runId: string,
    status: 'success' | 'error',
    output?: Record<string, unknown>,
    error?: string
  ): void {
    const span = this.spanStack.pop();
    if (!span) return;

    span.endTime = Date.now();
    span.durationMs = span.endTime - span.startTime;
    span.status = status;
    span.output = output;
    span.error = error;

    // Add to completed spans if it's a root span
    if (this.spanStack.length === 0 || !span.metadata?.parentRunId) {
      this.completedSpans.push(span);
    }
  }

  private findSpan(runId: string): SpanData | undefined {
    const search = (spans: SpanData[]): SpanData | undefined => {
      for (const span of spans) {
        if ((span.metadata as Record<string, unknown>)?.runId === runId) {
          return span;
        }
        const found = search(span.children);
        if (found) return found;
      }
      return undefined;
    };

    return search([...this.spanStack, ...this.completedSpans]);
  }

  private async finalizeTrace(): Promise<void> {
    const trace = this.getTraceResult();
    if (!trace) return;

    // Send trace to Flight Recorder
    try {
      await this.sendToFlightRecorder(trace);
    } catch (error) {
      this.log('error', 'Failed to send trace to Flight Recorder', { error });
    }

    // Call completion callback
    this.config.onTraceComplete?.(trace);

    this.log('info', 'Trace finalized', {
      traceId: trace.traceId,
      totalDurationMs: trace.totalDurationMs,
      hasError: trace.hasError,
    });
  }

  private async sendToFlightRecorder(trace: TraceResult): Promise<void> {
    const url = `${this.config.baseUrl}/fall/traces`;

    const body = {
      traceId: trace.traceId,
      requestId: trace.requestId,
      userId: this.config.userId,
      plan: this.config.plan ?? 'free',
      collectionId: this.config.collectionId,
      source: 'langchain',
      trace: {
        traceId: trace.traceId,
        startedAt: new Date(this.traceStartTime!).toISOString(),
        endedAt: new Date().toISOString(),
        totalDurationMs: trace.totalDurationMs,
        spans: trace.spans,
        events: [],
        cost: trace.estimatedCost ? { total: trace.estimatedCost } : undefined,
      },
      timingsMs: { total: trace.totalDurationMs },
      resultsCount: 0,
      error: trace.error,
    };

    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  private estimateCost(): number | undefined {
    if (this.tokenUsage.totalTokens === 0) {
      return undefined;
    }

    // Rough cost estimation (GPT-4 rates as baseline)
    const inputCost = (this.tokenUsage.promptTokens / 1000) * 0.03;
    const outputCost = (this.tokenUsage.completionTokens / 1000) * 0.06;

    return Math.round((inputCost + outputCost) * 10000) / 10000;
  }

  private sanitizeForLogging(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string' && value.length > 500) {
        result[key] = value.slice(0, 500) + '...';
      } else if (Array.isArray(value)) {
        result[key] = value.length > 10 ? value.slice(0, 10) : value;
      } else if (typeof value === 'object' && value !== null) {
        result[key] = '[Object]';
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: Record<string, unknown>
  ): void {
    if (!this.config.verbose && level === 'debug') {
      return;
    }

    const logFn = console[level] || console.log;
    logFn(`[SeizCallbackHandler] ${message}`, data ?? '');
  }
}

/**
 * Create a SeizCallbackHandler instance
 */
export function createSeizCallbackHandler(config: SeizCallbackConfig): SeizCallbackHandler {
  return new SeizCallbackHandler(config);
}

/**
 * Create a callback handler with verbose logging
 */
export function createVerboseCallbackHandler(
  config: Omit<SeizCallbackConfig, 'verbose'>
): SeizCallbackHandler {
  return new SeizCallbackHandler({
    ...config,
    verbose: true,
  });
}

// ============================================
// Flight Recorder Direct Integration Handler
// ============================================

/**
 * Configuration for direct Flight Recorder integration
 */
export interface FlightRecorderHandlerConfig {
  /** User ID for trace attribution */
  userId: string;
  /** User plan tier */
  plan?: string;
  /** Collection ID (if applicable) */
  collectionId?: string;
  /** Multiple collection IDs for federated search */
  collectionIds?: string[];
  /** Enable verbose logging */
  verbose?: boolean;
  /** Custom metadata to include in traces */
  metadata?: Record<string, unknown>;
  /** Callback for trace completion */
  onTraceComplete?: (traceId: string, durationMs: number) => void;
  /** Callback for errors */
  onError?: (error: Error, runId: string) => void;
}

/**
 * SeizFlightRecorderHandler - Direct Flight Recorder Integration
 *
 * This handler integrates directly with Seizn's Flight Recorder
 * for server-side applications. Unlike SeizCallbackHandler which
 * sends traces via API, this handler uses the Flight Recorder
 * module directly for lower latency and richer tracing.
 *
 * @example
 * ```typescript
 * import { SeizFlightRecorderHandler } from '@/lib/integrations/langchain';
 *
 * const handler = new SeizFlightRecorderHandler({
 *   userId: 'user-123',
 *   plan: 'pro',
 *   collectionId: 'my-docs',
 * });
 *
 * // Use with LangChain
 * const chain = new RetrievalQAChain({
 *   llm: myLLM,
 *   retriever: myRetriever,
 *   callbacks: [handler],
 * });
 *
 * const result = await chain.invoke({ query: 'What is RAG?' });
 * ```
 */
export class SeizFlightRecorderHandler {
  private readonly config: FlightRecorderHandlerConfig;

  /** Current trace handle */
  private traceHandle: {
    traceId: string;
    requestId: string;
    startedAtMs: number;
    sampled: boolean;
    events: Array<{
      type: string;
      ts: string;
      payload: Record<string, unknown>;
    }>;
    spans: SpanData[];
    base: {
      userId: string;
      plan: string;
      collectionId?: string;
      collectionIds?: string[];
      queryText?: string;
    };
  } | null = null;

  /** Active spans by run ID */
  private activeSpans = new Map<string, SpanData>();

  /** Token usage tracking */
  private tokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  /** Retrieval results tracking */
  private retrievalResults: Array<{
    documentId: string;
    similarity: number;
    text: string;
  }> = [];

  /** Error tracking */
  private hasError = false;
  private errorMessage?: string;

  /** LangChain namespace identifier */
  lc_namespace = ['seizn', 'flight-recorder'];

  /** Handler name */
  name = 'SeizFlightRecorderHandler';

  constructor(config: FlightRecorderHandlerConfig) {
    if (!config.userId) {
      throw new Error('User ID is required');
    }

    this.config = {
      ...config,
      plan: config.plan ?? 'free',
    };
  }

  // ============================================
  // Chain Callbacks
  // ============================================

  async handleChainStart(
    chain: { name?: string },
    inputs: Record<string, unknown>,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    // Initialize trace if this is the root chain
    if (!parentRunId) {
      this.initializeTrace(runId, inputs);
    }

    const span = this.createSpan(
      runId,
      `chain:${chain.name ?? 'unknown'}`,
      { inputs: this.truncate(inputs), tags, ...metadata },
      parentRunId
    );

    this.activeSpans.set(runId, span);
    this.log('debug', `Chain started: ${chain.name}`, { runId, parentRunId });
  }

  async handleChainEnd(
    outputs: Record<string, unknown>,
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    this.endSpan(runId, { outputs: this.truncate(outputs) });

    // Finalize trace if this is the root chain
    if (!parentRunId) {
      await this.finalizeTrace();
    }

    this.log('debug', 'Chain ended', { runId });
  }

  async handleChainError(
    error: Error,
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    this.hasError = true;
    this.errorMessage = error.message;

    this.endSpan(runId, undefined, error.message);

    if (!parentRunId) {
      await this.finalizeTrace();
    }

    this.config.onError?.(error, runId);
    this.log('error', `Chain error: ${error.message}`, { runId });
  }

  // ============================================
  // LLM Callbacks
  // ============================================

  async handleLLMStart(
    llm: { name?: string },
    prompts: string[],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!this.traceHandle) {
      this.initializeTrace(runId, { prompts });
    }

    const span = this.createSpan(
      runId,
      `llm:${llm.name ?? 'unknown'}`,
      {
        llmName: llm.name,
        promptCount: prompts.length,
        promptPreview: prompts[0]?.slice(0, 200),
        tags,
        ...extraParams,
        ...metadata,
      },
      parentRunId
    );

    this.activeSpans.set(runId, span);

    // Record LLM event for Flight Recorder
    this.addEvent('llm', {
      operation: 'start',
      model: llm.name,
      promptCount: prompts.length,
      ...extraParams,
    });

    this.log('debug', `LLM started: ${llm.name}`, { runId, promptCount: prompts.length });
  }

  async handleLLMEnd(
    output: {
      generations: Array<Array<{ text: string }>>;
      llmOutput?: {
        tokenUsage?: {
          promptTokens?: number;
          completionTokens?: number;
          totalTokens?: number;
        };
      };
    },
    runId: string
  ): Promise<void> {
    // Track token usage
    if (output.llmOutput?.tokenUsage) {
      this.tokenUsage.promptTokens += output.llmOutput.tokenUsage.promptTokens ?? 0;
      this.tokenUsage.completionTokens += output.llmOutput.tokenUsage.completionTokens ?? 0;
      this.tokenUsage.totalTokens += output.llmOutput.tokenUsage.totalTokens ?? 0;
    }

    this.endSpan(runId, {
      generationCount: output.generations.length,
      tokenUsage: output.llmOutput?.tokenUsage,
    });

    // Record LLM completion event
    this.addEvent('llm', {
      operation: 'end',
      generationCount: output.generations.length,
      tokenUsage: output.llmOutput?.tokenUsage,
    });

    this.log('debug', 'LLM ended', { runId, tokenUsage: output.llmOutput?.tokenUsage });
  }

  async handleLLMError(error: Error, runId: string): Promise<void> {
    this.hasError = true;
    this.errorMessage = error.message;

    this.endSpan(runId, undefined, error.message);

    this.addEvent('error', {
      source: 'llm',
      message: error.message,
    });

    this.config.onError?.(error, runId);
    this.log('error', `LLM error: ${error.message}`, { runId });
  }

  async handleLLMNewToken(token: string, runId: string): Promise<void> {
    // Token streaming - no action needed for tracing
    this.log('debug', 'LLM token', { runId, tokenLength: token.length });
  }

  // ============================================
  // Retriever Callbacks (Flight Recorder Integration)
  // ============================================

  async handleRetrieverStart(
    retriever: { name?: string },
    query: string,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!this.traceHandle) {
      this.initializeTrace(runId, { query });
    }

    // Update query text in trace
    if (this.traceHandle) {
      this.traceHandle.base.queryText = query;
    }

    const span = this.createSpan(
      runId,
      `retriever:${retriever.name ?? 'unknown'}`,
      {
        retrieverName: retriever.name,
        queryPreview: query.slice(0, 200),
        queryLength: query.length,
        tags,
        ...metadata,
      },
      parentRunId
    );

    this.activeSpans.set(runId, span);

    // Record retrieval start event for Flight Recorder
    this.addEvent('embed', {
      queryLength: query.length,
      retrieverName: retriever.name,
    });

    this.log('debug', `Retriever started: ${retriever.name}`, { runId, queryLength: query.length });
  }

  async handleRetrieverEnd(
    documents: Array<{ pageContent: string; metadata: Record<string, unknown> }>,
    runId: string
  ): Promise<void> {
    // Track retrieval results
    this.retrievalResults = documents.map((doc, idx) => ({
      documentId: String(doc.metadata.chunkId ?? doc.metadata.id ?? `doc-${idx}`),
      similarity: doc.metadata.similarity as number ?? 0,
      text: doc.pageContent.slice(0, 200),
    }));

    this.endSpan(runId, {
      documentCount: documents.length,
      documentIds: this.retrievalResults.map((r) => r.documentId).slice(0, 10),
    });

    // Record candidates event for Flight Recorder
    this.addEvent('candidates', {
      count: documents.length,
      documentIds: this.retrievalResults.map((r) => r.documentId),
      scores: this.retrievalResults.map((r) => r.similarity),
    });

    // Record context event
    this.addEvent('context', {
      chunks: this.retrievalResults.slice(0, 5).map((r) => ({
        id: r.documentId,
        textPreview: r.text,
        score: r.similarity,
      })),
    });

    this.log('debug', 'Retriever ended', { runId, documentCount: documents.length });
  }

  async handleRetrieverError(error: Error, runId: string): Promise<void> {
    this.hasError = true;
    this.errorMessage = error.message;

    this.endSpan(runId, undefined, error.message);

    this.addEvent('error', {
      source: 'retriever',
      message: error.message,
    });

    this.config.onError?.(error, runId);
    this.log('error', `Retriever error: ${error.message}`, { runId });
  }

  // ============================================
  // Tool Callbacks
  // ============================================

  async handleToolStart(
    tool: { name?: string },
    input: string,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const span = this.createSpan(
      runId,
      `tool:${tool.name ?? 'unknown'}`,
      {
        toolName: tool.name,
        inputPreview: input.slice(0, 200),
        inputLength: input.length,
        tags,
        ...metadata,
      },
      parentRunId
    );

    this.activeSpans.set(runId, span);
    this.log('debug', `Tool started: ${tool.name}`, { runId });
  }

  async handleToolEnd(output: string, runId: string): Promise<void> {
    this.endSpan(runId, {
      outputPreview: output.slice(0, 200),
      outputLength: output.length,
    });

    this.log('debug', 'Tool ended', { runId, outputLength: output.length });
  }

  async handleToolError(error: Error, runId: string): Promise<void> {
    this.hasError = true;
    this.errorMessage = error.message;

    this.endSpan(runId, undefined, error.message);

    this.config.onError?.(error, runId);
    this.log('error', `Tool error: ${error.message}`, { runId });
  }

  // ============================================
  // Agent Callbacks
  // ============================================

  async handleAgentAction(
    action: { tool: string; toolInput: string; log: string },
    runId: string
  ): Promise<void> {
    const span = this.createSpan(
      runId,
      `agent_action:${action.tool}`,
      {
        tool: action.tool,
        toolInput: action.toolInput.slice(0, 200),
        log: action.log.slice(0, 200),
      }
    );

    this.activeSpans.set(runId, span);
    this.log('debug', `Agent action: ${action.tool}`, { runId });
  }

  async handleAgentEnd(
    finish: { returnValues: Record<string, unknown>; log: string },
    runId: string
  ): Promise<void> {
    this.endSpan(runId, {
      returnValues: this.truncate(finish.returnValues),
      log: finish.log.slice(0, 200),
    });

    this.log('debug', 'Agent ended', { runId });
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Get current trace ID
   */
  getTraceId(): string | null {
    return this.traceHandle?.traceId ?? null;
  }

  /**
   * Get token usage statistics
   */
  getTokenUsage(): {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } {
    return { ...this.tokenUsage };
  }

  /**
   * Get retrieval results
   */
  getRetrievalResults(): Array<{
    documentId: string;
    similarity: number;
    text: string;
  }> {
    return [...this.retrievalResults];
  }

  /**
   * Reset handler state for new trace
   */
  reset(): void {
    this.traceHandle = null;
    this.activeSpans.clear();
    this.tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    this.retrievalResults = [];
    this.hasError = false;
    this.errorMessage = undefined;
  }

  /**
   * Add a custom event to the trace
   */
  addCustomEvent(name: string, payload: Record<string, unknown>): void {
    this.addEvent('custom', { name, ...payload });
  }

  /**
   * Add feedback for the current trace
   */
  addFeedback(feedback: {
    rating?: number;
    comment?: string;
    tags?: string[];
  }): void {
    this.addEvent('feedback', feedback);
  }

  // ============================================
  // Private Methods
  // ============================================

  private initializeTrace(
    runId: string,
    inputs: Record<string, unknown>
  ): void {
    this.reset();

    const traceId = randomUUID();
    const requestId = runId;

    this.traceHandle = {
      traceId,
      requestId,
      startedAtMs: Date.now(),
      sampled: true, // Always sample for LangChain integration
      events: [],
      spans: [],
      base: {
        userId: this.config.userId,
        plan: this.config.plan ?? 'free',
        collectionId: this.config.collectionId,
        collectionIds: this.config.collectionIds,
        queryText: inputs.query as string ?? inputs.input as string,
      },
    };

    this.log('info', 'Trace initialized', { traceId, requestId });
  }

  private createSpan(
    runId: string,
    name: string,
    input: Record<string, unknown>,
    parentRunId?: string
  ): SpanData {
    const span: SpanData = {
      name,
      startTime: Date.now(),
      status: 'running',
      input,
      parentId: parentRunId,
      children: [],
      metadata: {
        ...this.config.metadata,
        runId,
      },
    };

    if (this.traceHandle) {
      this.traceHandle.spans.push(span);
    }

    return span;
  }

  private endSpan(
    runId: string,
    output?: Record<string, unknown>,
    error?: string
  ): void {
    const span = this.activeSpans.get(runId);
    if (!span) return;

    span.endTime = Date.now();
    span.durationMs = span.endTime - span.startTime;
    span.status = error ? 'error' : 'success';
    span.output = output;
    span.error = error;

    this.activeSpans.delete(runId);
  }

  private addEvent(
    type: string,
    payload: Record<string, unknown>
  ): void {
    if (!this.traceHandle) return;

    this.traceHandle.events.push({
      type,
      ts: new Date().toISOString(),
      payload,
    });
  }

  private async finalizeTrace(): Promise<void> {
    if (!this.traceHandle) return;

    const totalDurationMs = Date.now() - this.traceHandle.startedAtMs;

    // Calculate cost estimate
    const costEstimate = this.estimateCost();

    this.log('info', 'Trace finalized', {
      traceId: this.traceHandle.traceId,
      totalDurationMs,
      hasError: this.hasError,
      tokenUsage: this.tokenUsage,
      retrievalCount: this.retrievalResults.length,
      costEstimate,
    });

    // Call completion callback
    this.config.onTraceComplete?.(this.traceHandle.traceId, totalDurationMs);

    // Note: In a full implementation, this would save to the database
    // via the Flight Recorder store. For now, the trace data is available
    // through the callback for external handling.
  }

  private estimateCost(): number {
    if (this.tokenUsage.totalTokens === 0) {
      return 0;
    }

    // Rough cost estimation (GPT-4 rates as baseline)
    const inputCost = (this.tokenUsage.promptTokens / 1000) * 0.03;
    const outputCost = (this.tokenUsage.completionTokens / 1000) * 0.06;

    return Math.round((inputCost + outputCost) * 10000) / 10000;
  }

  private truncate(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string' && value.length > 500) {
        result[key] = value.slice(0, 500) + '...';
      } else if (Array.isArray(value)) {
        result[key] = value.length > 10 ? value.slice(0, 10) : value;
      } else if (typeof value === 'object' && value !== null) {
        result[key] = '[Object]';
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: Record<string, unknown>
  ): void {
    if (!this.config.verbose && level === 'debug') {
      return;
    }

    const logFn = console[level] || console.log;
    logFn(`[SeizFlightRecorderHandler] ${message}`, data ?? '');
  }
}

/**
 * Create a Flight Recorder callback handler
 */
export function createFlightRecorderHandler(
  config: FlightRecorderHandlerConfig
): SeizFlightRecorderHandler {
  return new SeizFlightRecorderHandler(config);
}
