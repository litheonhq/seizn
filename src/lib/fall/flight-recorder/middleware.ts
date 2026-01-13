/**
 * Flight Recorder Middleware
 *
 * Express/Next.js middleware for automatic API request tracing.
 * Captures request/response data and creates traces automatically.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { startTrace, addEvent, finishTrace, getFlightRecorderConfig } from './recorder';
import type { TraceHandle, TraceStartParams, FlightRecorderConfig } from './types';

// ============================================
// Types
// ============================================

export interface TracingContext {
  handle: TraceHandle;
  requestId: string;
  startTime: number;
}

export interface TracingMiddlewareConfig {
  /** Flight recorder config */
  recorder?: FlightRecorderConfig;
  /** Extract user ID from request */
  getUserId?: (request: NextRequest) => Promise<string | null>;
  /** Extract API key ID from request */
  getApiKeyId?: (request: NextRequest) => Promise<string | null>;
  /** Extract plan from request */
  getPlan?: (request: NextRequest) => Promise<string>;
  /** Routes to exclude from tracing */
  excludeRoutes?: RegExp[];
  /** Only trace these routes */
  includeRoutes?: RegExp[];
  /** Whether to trace request body */
  traceRequestBody?: boolean;
  /** Whether to trace response body */
  traceResponseBody?: boolean;
  /** Maximum body size to trace (bytes) */
  maxBodySize?: number;
  /** Custom headers to capture */
  captureHeaders?: string[];
}

// ============================================
// Request Context Store (AsyncLocalStorage alternative)
// ============================================

const activeContexts = new Map<string, TracingContext>();

/**
 * Get the tracing context for a request
 */
export function getTracingContext(requestId: string): TracingContext | undefined {
  return activeContexts.get(requestId);
}

/**
 * Set the tracing context for a request
 */
export function setTracingContext(requestId: string, context: TracingContext): void {
  activeContexts.set(requestId, context);
}

/**
 * Remove the tracing context for a request
 */
export function clearTracingContext(requestId: string): void {
  activeContexts.delete(requestId);
}

// ============================================
// Middleware Implementation
// ============================================

const DEFAULT_MIDDLEWARE_CONFIG: TracingMiddlewareConfig = {
  excludeRoutes: [
    /^\/_next/,
    /^\/api\/health/,
    /^\/favicon\.ico/,
    /\.(css|js|png|jpg|svg|woff|woff2)$/,
  ],
  traceRequestBody: true,
  traceResponseBody: false,
  maxBodySize: 10000,
  captureHeaders: ['content-type', 'user-agent', 'x-request-id'],
};

/**
 * Create a tracing middleware for Next.js API routes
 */
export function createTracingMiddleware(config: TracingMiddlewareConfig = {}) {
  const cfg = { ...DEFAULT_MIDDLEWARE_CONFIG, ...config };

  return async function tracingMiddleware(
    request: NextRequest,
    handler: () => Promise<NextResponse>
  ): Promise<NextResponse> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Check if route should be excluded
    if (cfg.excludeRoutes?.some((re) => re.test(path))) {
      return handler();
    }

    // Check if route should be included
    if (cfg.includeRoutes && !cfg.includeRoutes.some((re) => re.test(path))) {
      return handler();
    }

    // Extract request ID
    const requestId = request.headers.get('x-request-id') || randomUUID();

    // Extract user info
    const userId = cfg.getUserId
      ? await cfg.getUserId(request)
      : request.headers.get('x-user-id') || 'anonymous';

    const apiKeyId = cfg.getApiKeyId
      ? await cfg.getApiKeyId(request)
      : request.headers.get('x-api-key-id') || undefined;

    const plan = cfg.getPlan
      ? await cfg.getPlan(request)
      : request.headers.get('x-plan') || 'free';

    if (!userId) {
      // Can't trace without user ID
      return handler();
    }

    // Start trace
    const startParams: TraceStartParams = {
      requestId,
      userId,
      apiKeyId: apiKeyId || undefined,
      plan,
      source: 'api',
    };

    const startTime = Date.now();
    const handle = await startTrace(startParams, cfg.recorder);

    // Store context
    setTracingContext(requestId, { handle, requestId, startTime });

    // Capture request metadata
    const capturedHeaders: Record<string, string> = {};
    for (const header of cfg.captureHeaders || []) {
      const value = request.headers.get(header);
      if (value) {
        capturedHeaders[header] = value;
      }
    }

    addEvent(handle, 'custom', {
      event: 'request_start',
      method: request.method,
      path,
      query: Object.fromEntries(url.searchParams),
      headers: capturedHeaders,
    }, cfg.recorder);

    // Capture request body if configured
    if (cfg.traceRequestBody && request.body) {
      try {
        const clonedRequest = request.clone();
        const body = await clonedRequest.text();
        if (body && body.length <= (cfg.maxBodySize || 10000)) {
          addEvent(handle, 'custom', {
            event: 'request_body',
            body: tryParseJson(body),
          }, cfg.recorder);
        }
      } catch {
        // Ignore body parsing errors
      }
    }

    let response: NextResponse;
    let error: Error | null = null;

    try {
      response = await handler();
    } catch (err) {
      error = err as Error;
      response = NextResponse.json(
        { error: 'Internal Server Error' },
        { status: 500 }
      );
    }

    // Capture response metadata
    addEvent(handle, error ? 'error' : 'custom', {
      event: 'response_end',
      status: response.status,
      error: error?.message,
    }, cfg.recorder);

    // Finish trace
    const latencyMs = Date.now() - startTime;
    await finishTrace(handle, {
      timingsMs: { total: latencyMs },
      error: error?.message,
    }, cfg.recorder);

    // Cleanup context
    clearTracingContext(requestId);

    // Add request ID header to response
    const headers = new Headers(response.headers);
    headers.set('x-request-id', requestId);
    headers.set('x-trace-id', handle.traceId);

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

// ============================================
// Utility Functions
// ============================================

function tryParseJson(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

/**
 * Higher-order function to wrap an API route handler with tracing
 */
export function withTracing<T extends (...args: unknown[]) => Promise<NextResponse>>(
  handler: T,
  config?: TracingMiddlewareConfig
): T {
  const middleware = createTracingMiddleware(config);

  return (async (...args: Parameters<T>) => {
    const request = args[0] as NextRequest;
    return middleware(request, async () => handler(...args));
  }) as T;
}

/**
 * Extract trace handle from current request context
 */
export function getCurrentTraceHandle(requestId: string): TraceHandle | undefined {
  return getTracingContext(requestId)?.handle;
}

/**
 * Add a custom event to the current trace
 */
export function addTraceEvent(
  requestId: string,
  eventType: 'custom' | 'error',
  payload: Record<string, unknown>
): void {
  const context = getTracingContext(requestId);
  if (context?.handle) {
    addEvent(context.handle, eventType, payload, getFlightRecorderConfig());
  }
}

// ============================================
// Cost Calculation Utilities
// ============================================

export interface CostCalculationParams {
  embeddingTokens?: number;
  llmInputTokens?: number;
  llmOutputTokens?: number;
  rerankItems?: number;
  vectorSearchOps?: number;
}

const DEFAULT_COST_RATES = {
  embeddingPerToken: 0.00001, // $0.01 per 1000 tokens
  vectorSearchPerOp: 0.000001, // $0.001 per 1000 ops
  rerankPerItem: 0.00002, // $0.02 per 1000 items
  llmInputPerToken: 0.00003, // $0.03 per 1000 tokens (GPT-4 class)
  llmOutputPerToken: 0.00006, // $0.06 per 1000 tokens
};

/**
 * Calculate estimated cost for a trace
 */
export function calculateCost(
  params: CostCalculationParams,
  rates = DEFAULT_COST_RATES
): {
  embedding: number;
  vectorSearch: number;
  rerank: number;
  llm: number;
  total: number;
} {
  const embedding = (params.embeddingTokens || 0) * rates.embeddingPerToken;
  const vectorSearch = (params.vectorSearchOps || 0) * rates.vectorSearchPerOp;
  const rerank = (params.rerankItems || 0) * rates.rerankPerItem;
  const llmInput = (params.llmInputTokens || 0) * rates.llmInputPerToken;
  const llmOutput = (params.llmOutputTokens || 0) * rates.llmOutputPerToken;
  const llm = llmInput + llmOutput;

  return {
    embedding,
    vectorSearch,
    rerank,
    llm,
    total: embedding + vectorSearch + rerank + llm,
  };
}

// ============================================
// Span Helpers for Pipeline Stages
// ============================================

/**
 * Create a span wrapper for a pipeline stage
 */
export async function withSpan<T>(
  handle: TraceHandle,
  spanName: string,
  input: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<{ result: T; durationMs: number }> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  // Add span to handle
  const span = {
    name: spanName,
    startedAt,
    status: 'running' as const,
    input,
  };

  if (!handle.spans) {
    handle.spans = [];
  }
  handle.spans.push(span);

  try {
    const result = await fn();
    const durationMs = Date.now() - startMs;

    // Update span
    span.status = 'success' as const;
    Object.assign(span, {
      endedAt: new Date().toISOString(),
      durationMs,
      output: typeof result === 'object' ? summarizeOutput(result) : { value: result },
    });

    return { result, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startMs;

    // Update span with error
    span.status = 'error' as const;
    Object.assign(span, {
      endedAt: new Date().toISOString(),
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

/**
 * Summarize output for span storage (avoid storing large payloads)
 */
function summarizeOutput(output: unknown): Record<string, unknown> {
  if (!output || typeof output !== 'object') {
    return { value: output };
  }

  const obj = output as Record<string, unknown>;
  const summary: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      summary[key] = { _type: 'array', length: value.length };
    } else if (typeof value === 'object' && value !== null) {
      summary[key] = { _type: 'object', keys: Object.keys(value).length };
    } else {
      summary[key] = value;
    }
  }

  return summary;
}
