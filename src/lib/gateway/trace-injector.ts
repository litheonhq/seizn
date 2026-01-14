/**
 * Trace Injector
 *
 * Handles trace context injection and propagation for the Gateway.
 * Integrates with W3C Trace Context standard for distributed tracing.
 */

import { randomUUID } from 'crypto';
import type {
  TraceInjection,
  GatewaySpan,
  GatewayLog,
  ProxyRequest,
  ProxyResponse,
  VectorDBProvider,
  ProxyOperation,
} from './types';

// Sampling rate for traces (default 10%)
const SAMPLING_RATE = parseFloat(process.env.SEIZN_GATEWAY_TRACE_SAMPLING ?? '0.1');

/**
 * Generate a new trace ID (UUID format)
 */
export function generateTraceId(): string {
  return randomUUID();
}

/**
 * Generate a new span ID (16 hex chars)
 */
export function generateSpanId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

/**
 * Determine if a trace should be sampled
 */
export function shouldSample(traceId: string, rate: number = SAMPLING_RATE): boolean {
  // Use trace ID hash for consistent sampling decision
  const hash = traceId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return (hash % 100) / 100 < rate;
}

/**
 * Create a new trace injection context
 */
export function createTraceInjection(options?: {
  traceId?: string;
  parentSpanId?: string;
  userId?: string;
  projectId?: string;
  environment?: string;
}): TraceInjection {
  const traceId = options?.traceId ?? generateTraceId();
  const spanId = generateSpanId();

  return {
    traceId,
    spanId,
    parentSpanId: options?.parentSpanId,
    timestamp: new Date().toISOString(),
    userId: options?.userId,
    projectId: options?.projectId,
    environment: options?.environment ?? process.env.NODE_ENV ?? 'development',
    baggage: {},
  };
}

/**
 * Create a child trace from parent context
 */
export function createChildTrace(parent: TraceInjection): TraceInjection {
  return {
    traceId: parent.traceId,
    spanId: generateSpanId(),
    parentSpanId: parent.spanId,
    timestamp: new Date().toISOString(),
    userId: parent.userId,
    projectId: parent.projectId,
    environment: parent.environment,
    baggage: { ...parent.baggage },
  };
}

/**
 * Extract trace context from HTTP headers (W3C Trace Context format)
 */
export function extractTraceFromHeaders(
  headers: Record<string, string | undefined>
): TraceInjection | null {
  const traceparent = headers['traceparent'] || headers['Traceparent'];

  if (!traceparent) {
    return null;
  }

  // W3C format: 00-<trace-id>-<parent-id>-<flags>
  const parts = traceparent.split('-');

  if (parts.length !== 4) {
    return null;
  }

  const [, rawTraceId, parentSpanId] = parts;

  // Convert 32 hex char trace-id back to UUID format if needed
  const traceId =
    rawTraceId.length === 32
      ? `${rawTraceId.slice(0, 8)}-${rawTraceId.slice(8, 12)}-${rawTraceId.slice(12, 16)}-${rawTraceId.slice(16, 20)}-${rawTraceId.slice(20)}`
      : rawTraceId;

  // Parse baggage header
  const baggage: Record<string, string> = {};
  const baggageHeader = headers['baggage'] || headers['Baggage'];

  if (baggageHeader) {
    baggageHeader.split(',').forEach((item) => {
      const [key, value] = item.trim().split('=');
      if (key && value) {
        baggage[key] = decodeURIComponent(value);
      }
    });
  }

  return {
    traceId,
    spanId: generateSpanId(),
    parentSpanId,
    timestamp: new Date().toISOString(),
    userId: baggage['seizn.user_id'],
    projectId: baggage['seizn.project_id'],
    environment: baggage['seizn.environment'],
    baggage,
  };
}

/**
 * Inject trace context into HTTP headers (W3C Trace Context format)
 */
export function injectTraceToHeaders(
  trace: TraceInjection,
  sampled: boolean = true
): Record<string, string> {
  const flags = sampled ? '01' : '00';
  // W3C format requires trace-id as 32 hex chars (no dashes)
  const normalizedTraceId = trace.traceId.replace(/-/g, '');
  const traceparent = `00-${normalizedTraceId}-${trace.spanId}-${flags}`;

  const headers: Record<string, string> = {
    traceparent,
  };

  // Build baggage
  const baggageItems: string[] = [];

  if (trace.userId) {
    baggageItems.push(`seizn.user_id=${encodeURIComponent(trace.userId)}`);
  }
  if (trace.projectId) {
    baggageItems.push(`seizn.project_id=${encodeURIComponent(trace.projectId)}`);
  }
  if (trace.environment) {
    baggageItems.push(`seizn.environment=${encodeURIComponent(trace.environment)}`);
  }

  // Add custom baggage
  if (trace.baggage) {
    for (const [key, value] of Object.entries(trace.baggage)) {
      if (!key.startsWith('seizn.')) {
        baggageItems.push(`${key}=${encodeURIComponent(value)}`);
      }
    }
  }

  if (baggageItems.length > 0) {
    headers['baggage'] = baggageItems.join(',');
  }

  return headers;
}

/**
 * Create a span for gateway operation
 */
export function createGatewaySpan(
  trace: TraceInjection,
  operation: ProxyOperation,
  provider: VectorDBProvider
): GatewaySpan {
  return {
    traceId: trace.traceId,
    spanId: trace.spanId,
    parentSpanId: trace.parentSpanId,
    operationName: `gateway.${operation}`,
    service: 'seizn-gateway',
    startTime: new Date().toISOString(),
    status: 'ok',
    tags: {
      'gateway.provider': provider,
      'gateway.operation': operation,
      ...(trace.userId && { 'seizn.user_id': trace.userId }),
      ...(trace.projectId && { 'seizn.project_id': trace.projectId }),
      'seizn.environment': trace.environment || 'development',
    },
    logs: [],
  };
}

/**
 * Add a tag to a span
 */
export function addSpanTag(
  span: GatewaySpan,
  key: string,
  value: string | number | boolean
): void {
  span.tags[key] = value;
}

/**
 * Add a log entry to a span
 */
export function addSpanLog(
  span: GatewaySpan,
  level: GatewayLog['level'],
  message: string,
  fields?: Record<string, unknown>
): void {
  span.logs.push({
    timestamp: new Date().toISOString(),
    level,
    message,
    fields,
  });
}

/**
 * Finish a span and calculate duration
 */
export function finishSpan(
  span: GatewaySpan,
  status: 'ok' | 'error' = 'ok'
): GatewaySpan {
  const endTime = new Date();
  const startTime = new Date(span.startTime);

  return {
    ...span,
    endTime: endTime.toISOString(),
    durationMs: endTime.getTime() - startTime.getTime(),
    status,
  };
}

/**
 * TraceInjector class for managing trace lifecycle
 */
export class TraceInjector {
  private trace: TraceInjection;
  private spans: GatewaySpan[] = [];
  private currentSpan: GatewaySpan | null = null;

  constructor(options?: {
    traceId?: string;
    parentSpanId?: string;
    userId?: string;
    projectId?: string;
    environment?: string;
  }) {
    this.trace = createTraceInjection(options);
  }

  /**
   * Get the current trace context
   */
  getTrace(): TraceInjection {
    return { ...this.trace };
  }

  /**
   * Get the trace ID
   */
  get traceId(): string {
    return this.trace.traceId;
  }

  /**
   * Get the current span ID
   */
  get spanId(): string {
    return this.currentSpan?.spanId || this.trace.spanId;
  }

  /**
   * Start a new span
   */
  startSpan(operation: ProxyOperation, provider: VectorDBProvider): GatewaySpan {
    this.currentSpan = createGatewaySpan(this.trace, operation, provider);
    return this.currentSpan;
  }

  /**
   * Add tag to current span
   */
  tag(key: string, value: string | number | boolean): void {
    if (this.currentSpan) {
      addSpanTag(this.currentSpan, key, value);
    }
  }

  /**
   * Log to current span
   */
  log(level: GatewayLog['level'], message: string, fields?: Record<string, unknown>): void {
    if (this.currentSpan) {
      addSpanLog(this.currentSpan, level, message, fields);
    }
  }

  /**
   * Finish current span
   */
  finish(status: 'ok' | 'error' = 'ok'): GatewaySpan | null {
    if (!this.currentSpan) {
      return null;
    }

    const finished = finishSpan(this.currentSpan, status);
    this.spans.push(finished);
    this.currentSpan = null;
    return finished;
  }

  /**
   * Get all finished spans
   */
  getSpans(): GatewaySpan[] {
    return [...this.spans];
  }

  /**
   * Inject trace into request
   */
  injectIntoRequest(request: ProxyRequest): ProxyRequest & { trace: TraceInjection } {
    return {
      ...request,
      trace: this.getTrace(),
    };
  }

  /**
   * Wrap response with trace info
   */
  wrapResponse(
    response: Omit<ProxyResponse, 'traceId' | 'spanId' | 'timestamp'>
  ): ProxyResponse {
    return {
      ...response,
      traceId: this.traceId,
      spanId: this.spanId,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get headers for outgoing requests
   */
  getHeaders(): Record<string, string> {
    return injectTraceToHeaders(this.trace);
  }

  /**
   * Create from incoming headers
   */
  static fromHeaders(headers: Record<string, string | undefined>): TraceInjector {
    const extracted = extractTraceFromHeaders(headers);

    if (extracted) {
      return new TraceInjector({
        traceId: extracted.traceId,
        parentSpanId: extracted.parentSpanId,
        userId: extracted.userId,
        projectId: extracted.projectId,
        environment: extracted.environment,
      });
    }

    return new TraceInjector();
  }
}
