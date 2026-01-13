/**
 * Seizn LangChain Callback Handler
 *
 * A LangChain-compatible callback handler that sends traces to
 * Seizn's Flight Recorder for observability and debugging.
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
 */

import { randomUUID } from 'crypto';
import type {
  SeizCallbackConfig,
  SpanData,
  TraceResult,
  SeizError,
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

    const span = this.startSpan(
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
