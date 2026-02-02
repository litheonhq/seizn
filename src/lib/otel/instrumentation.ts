/**
 * OpenTelemetry Active Tracing Instrumentation
 *
 * Utilities for creating and managing spans in API routes and services.
 *
 * @module otel/instrumentation
 */

import {
  trace,
  context,
  SpanKind,
  SpanStatusCode,
  type Span,
  type Tracer,
  type Context,
  type SpanOptions,
} from '@opentelemetry/api';
import { getOTelConfig, isOTelEnabled } from './config';
import {
  GenAIAttributes,
  buildGenAIAttributes,
  buildEmbeddingAttributes,
  buildRerankAttributes,
  buildVectorSearchAttributes,
  mapModelToSystem,
  mapSpanToOperation,
  type GenAIOperationType,
  type GenAISystem,
} from './genai-conventions';
import { extractTraceContext, generateTraceId, generateSpanId } from './converter';

// ============================================
// Tracer Instance
// ============================================

let _tracer: Tracer | null = null;

/**
 * Get or create the Seizn tracer instance
 */
export function getTracer(): Tracer {
  if (!_tracer) {
    const config = getOTelConfig();
    _tracer = trace.getTracer(
      config.serviceName,
      config.serviceVersion || '1.0.0'
    );
  }
  return _tracer;
}

// ============================================
// Span Creation Utilities
// ============================================

export interface SpanParams {
  name: string;
  kind?: SpanKind;
  attributes?: Record<string, string | number | boolean | string[]>;
  parentContext?: Context;
}

/**
 * Create a new span with optional parent context
 */
export function createSpan(params: SpanParams): Span {
  const tracer = getTracer();
  const options: SpanOptions = {
    kind: params.kind || SpanKind.INTERNAL,
    attributes: params.attributes,
  };

  if (params.parentContext) {
    return tracer.startSpan(params.name, options, params.parentContext);
  }

  return tracer.startSpan(params.name, options);
}

/**
 * Execute a function within a span context
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: Omit<SpanParams, 'name'>
): Promise<T> {
  if (!isOTelEnabled()) {
    // Create a no-op span when OTEL is disabled
    const noopSpan = trace.getTracer('noop').startSpan(name);
    try {
      return await fn(noopSpan);
    } finally {
      noopSpan.end();
    }
  }

  const span = createSpan({ name, ...options });

  try {
    const result = await context.with(trace.setSpan(context.active(), span), () =>
      fn(span)
    );
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    span.recordException(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Synchronous version of withSpan
 */
export function withSpanSync<T>(
  name: string,
  fn: (span: Span) => T,
  options?: Omit<SpanParams, 'name'>
): T {
  if (!isOTelEnabled()) {
    const noopSpan = trace.getTracer('noop').startSpan(name);
    try {
      return fn(noopSpan);
    } finally {
      noopSpan.end();
    }
  }

  const span = createSpan({ name, ...options });

  try {
    const result = context.with(trace.setSpan(context.active(), span), () =>
      fn(span)
    );
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    span.recordException(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    span.end();
  }
}

// ============================================
// GenAI-Specific Span Creators
// ============================================

export interface LLMSpanParams {
  model: string;
  operation?: GenAIOperationType;
  inputTokens?: number;
  outputTokens?: number;
  maxTokens?: number;
  temperature?: number;
  additionalAttributes?: Record<string, string | number | boolean>;
}

/**
 * Create a span for LLM operations (chat, completion)
 */
export async function withLLMSpan<T>(
  name: string,
  params: LLMSpanParams,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const attributes = {
    ...buildGenAIAttributes({
      operation: params.operation || 'chat',
      system: mapModelToSystem(params.model),
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
    }),
    ...params.additionalAttributes,
  };

  return withSpan(name, fn, {
    kind: SpanKind.CLIENT,
    attributes,
  });
}

export interface EmbeddingSpanParams {
  model: string;
  dimensions?: number;
  inputCount?: number;
  inputType?: 'document' | 'query';
  additionalAttributes?: Record<string, string | number | boolean>;
}

/**
 * Create a span for embedding operations
 */
export async function withEmbeddingSpan<T>(
  name: string,
  params: EmbeddingSpanParams,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const attributes = {
    ...buildEmbeddingAttributes({
      model: params.model,
      dimensions: params.dimensions,
      inputCount: params.inputCount,
      inputType: params.inputType,
    }),
    ...params.additionalAttributes,
  };

  return withSpan(name, fn, {
    kind: SpanKind.CLIENT,
    attributes,
  });
}

export interface RerankSpanParams {
  model: string;
  query?: string;
  topN?: number;
  documentsCount?: number;
  additionalAttributes?: Record<string, string | number | boolean>;
}

/**
 * Create a span for rerank operations
 */
export async function withRerankSpan<T>(
  name: string,
  params: RerankSpanParams,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const attributes = {
    ...buildRerankAttributes({
      model: params.model,
      query: params.query,
      topN: params.topN,
      documentsCount: params.documentsCount,
    }),
    ...params.additionalAttributes,
  };

  return withSpan(name, fn, {
    kind: SpanKind.CLIENT,
    attributes,
  });
}

export interface VectorSearchSpanParams {
  collectionName?: string;
  dimensions?: number;
  metric?: 'cosine' | 'euclidean' | 'dot_product';
  resultsCount?: number;
  additionalAttributes?: Record<string, string | number | boolean>;
}

/**
 * Create a span for vector search operations
 */
export async function withVectorSearchSpan<T>(
  name: string,
  params: VectorSearchSpanParams,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const attributes = {
    ...buildVectorSearchAttributes({
      collectionName: params.collectionName,
      dimensions: params.dimensions,
      metric: params.metric,
      resultsCount: params.resultsCount,
    }),
    ...params.additionalAttributes,
  };

  return withSpan(name, fn, {
    kind: SpanKind.CLIENT,
    attributes,
  });
}

// ============================================
// Memory Operations Instrumentation
// ============================================

export interface MemorySpanParams {
  operation: 'add' | 'search' | 'delete' | 'extract';
  userId?: string;
  collectionId?: string;
  contentLength?: number;
  resultsCount?: number;
  additionalAttributes?: Record<string, string | number | boolean>;
}

/**
 * Create a span for Seizn memory operations
 */
export async function withMemorySpan<T>(
  params: MemorySpanParams,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const operationName = `seizn.memory.${params.operation}`;

  const attributes: Record<string, string | number | boolean> = {
    [GenAIAttributes.OPERATION_NAME]: `memory.${params.operation}`,
    [GenAIAttributes.SYSTEM]: 'seizn',
    'seizn.memory.operation': params.operation,
  };

  if (params.userId) {
    attributes['enduser.id'] = params.userId;
  }

  if (params.collectionId) {
    attributes['seizn.collection.id'] = params.collectionId;
  }

  if (params.contentLength !== undefined) {
    attributes['seizn.content.length'] = params.contentLength;
  }

  if (params.resultsCount !== undefined) {
    attributes['seizn.results.count'] = params.resultsCount;
  }

  return withSpan(operationName, fn, {
    kind: SpanKind.SERVER,
    attributes: { ...attributes, ...params.additionalAttributes },
  });
}

// ============================================
// Tool Call Instrumentation
// ============================================

export interface ToolCallSpanParams {
  toolName: string;
  toolArgs?: Record<string, unknown>;
  userId?: string;
  additionalAttributes?: Record<string, string | number | boolean>;
}

/**
 * Create a span for tool call operations
 */
export async function withToolCallSpan<T>(
  params: ToolCallSpanParams,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const operationName = `seizn.tool.${params.toolName}`;

  const attributes: Record<string, string | number | boolean> = {
    [GenAIAttributes.OPERATION_NAME]: 'tool.call',
    [GenAIAttributes.SYSTEM]: 'seizn',
    'tool.name': params.toolName,
  };

  if (params.toolArgs) {
    // Only include safe argument keys, not values
    attributes['tool.args.keys'] = Object.keys(params.toolArgs).join(',');
  }

  if (params.userId) {
    attributes['enduser.id'] = params.userId;
  }

  return withSpan(operationName, fn, {
    kind: SpanKind.SERVER,
    attributes: { ...attributes, ...params.additionalAttributes },
  });
}

// ============================================
// HTTP Request Instrumentation
// ============================================

export interface HTTPSpanParams {
  method: string;
  url: string;
  route?: string;
  statusCode?: number;
  userId?: string;
  apiKeyId?: string;
  additionalAttributes?: Record<string, string | number | boolean>;
}

/**
 * Create HTTP span attributes following semantic conventions
 */
export function buildHTTPAttributes(
  params: HTTPSpanParams
): Record<string, string | number> {
  const attrs: Record<string, string | number> = {
    'http.request.method': params.method.toUpperCase(),
    'url.full': params.url,
  };

  if (params.route) {
    attrs['http.route'] = params.route;
  }

  if (params.statusCode !== undefined) {
    attrs['http.response.status_code'] = params.statusCode;
  }

  if (params.userId) {
    attrs['enduser.id'] = params.userId;
  }

  if (params.apiKeyId) {
    attrs['seizn.api_key.id'] = params.apiKeyId;
  }

  return attrs;
}

/**
 * Create a span for HTTP request handling
 */
export async function withHTTPSpan<T>(
  params: HTTPSpanParams,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const operationName = `HTTP ${params.method.toUpperCase()} ${params.route || params.url}`;

  const attributes = {
    ...buildHTTPAttributes(params),
    ...params.additionalAttributes,
  };

  return withSpan(operationName, fn, {
    kind: SpanKind.SERVER,
    attributes,
  });
}

// ============================================
// Context Propagation
// ============================================

/**
 * Extract trace context from incoming request headers
 * and return the active context for child spans
 */
export function extractContextFromHeaders(headers: Headers): Context {
  const traceContext = extractTraceContext(headers);

  if (!traceContext) {
    return context.active();
  }

  // Create a span context from the extracted trace context
  const spanContext = {
    traceId: traceContext.traceId,
    spanId: traceContext.spanId,
    traceFlags: traceContext.traceFlags,
    isRemote: true,
  };

  // This creates a context with the remote span context set
  const parentSpan = trace.wrapSpanContext(spanContext);
  return trace.setSpan(context.active(), parentSpan);
}

/**
 * Inject trace context into outgoing request headers
 */
export function injectContextToHeaders(headers: Headers): Headers {
  const span = trace.getActiveSpan();
  if (!span) {
    return headers;
  }

  const spanContext = span.spanContext();
  const traceparent = `00-${spanContext.traceId}-${spanContext.spanId}-${spanContext.traceFlags.toString(16).padStart(2, '0')}`;

  headers.set('traceparent', traceparent);

  return headers;
}

// ============================================
// Span Event Recording
// ============================================

/**
 * Record a GenAI prompt event on the active span
 */
export function recordPromptEvent(
  span: Span,
  prompt: string,
  role?: 'user' | 'system' | 'assistant'
): void {
  span.addEvent('gen_ai.prompt', {
    [GenAIAttributes.PROMPT]: prompt.slice(0, 1000), // Truncate for safety
    'gen_ai.prompt.role': role || 'user',
  });
}

/**
 * Record a GenAI completion event on the active span
 */
export function recordCompletionEvent(
  span: Span,
  completion: string,
  finishReason?: string
): void {
  span.addEvent('gen_ai.completion', {
    [GenAIAttributes.COMPLETION]: completion.slice(0, 1000), // Truncate for safety
    ...(finishReason && { 'gen_ai.finish_reason': finishReason }),
  });
}

/**
 * Record usage information on the span
 */
export function recordUsage(
  span: Span,
  inputTokens: number,
  outputTokens: number
): void {
  span.setAttributes({
    [GenAIAttributes.USAGE_INPUT_TOKENS]: inputTokens,
    [GenAIAttributes.USAGE_OUTPUT_TOKENS]: outputTokens,
    [GenAIAttributes.USAGE_TOTAL_TOKENS]: inputTokens + outputTokens,
  });
}

// ============================================
// Export for index.ts
// ============================================

export {
  GenAIAttributes,
  type GenAIOperationType,
  type GenAISystem,
};
