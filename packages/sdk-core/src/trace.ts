/**
 * Seizn Core SDK - Trace Context Module
 *
 * Distributed tracing support for observability.
 * Compatible with OpenTelemetry and W3C Trace Context.
 */

import type { TraceContext, Span, SpanEvent } from './types';

/**
 * Generate a random trace ID (32 hex chars)
 */
export function generateTraceId(): string {
  return generateHexString(32);
}

/**
 * Generate a random span ID (16 hex chars)
 */
export function generateSpanId(): string {
  return generateHexString(16);
}

/**
 * Generate random hex string
 */
function generateHexString(length: number): string {
  const bytes = new Uint8Array(length / 2);

  // Use crypto.getRandomValues if available (browser/Node 18+)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Fallback to Math.random (less secure but works everywhere)
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Create a new trace context
 */
export function createTraceContext(options?: {
  parentContext?: TraceContext;
  sampled?: boolean;
  baggage?: Record<string, string>;
}): TraceContext {
  const traceId = options?.parentContext?.traceId ?? generateTraceId();
  const parentSpanId = options?.parentContext?.spanId;

  return {
    traceId,
    spanId: generateSpanId(),
    parentSpanId,
    sampled: options?.sampled ?? true,
    baggage: {
      ...options?.parentContext?.baggage,
      ...options?.baggage,
    },
  };
}

/**
 * Parse W3C traceparent header
 * Format: 00-{traceId}-{spanId}-{flags}
 */
export function parseTraceparent(header: string): TraceContext | null {
  const parts = header.split('-');
  if (parts.length !== 4) {
    return null;
  }

  const [version, traceId, spanId, flags] = parts;

  // Validate version
  if (version !== '00') {
    return null;
  }

  // Validate trace ID (32 hex chars, not all zeros)
  if (!/^[a-f0-9]{32}$/.test(traceId) || /^0+$/.test(traceId)) {
    return null;
  }

  // Validate span ID (16 hex chars, not all zeros)
  if (!/^[a-f0-9]{16}$/.test(spanId) || /^0+$/.test(spanId)) {
    return null;
  }

  // Validate flags (2 hex chars)
  if (!/^[a-f0-9]{2}$/.test(flags)) {
    return null;
  }

  const sampled = (parseInt(flags, 16) & 0x01) === 1;

  return {
    traceId,
    spanId,
    sampled,
  };
}

/**
 * Format trace context as W3C traceparent header
 */
export function formatTraceparent(context: TraceContext): string {
  const flags = context.sampled ? '01' : '00';
  return `00-${context.traceId}-${context.spanId}-${flags}`;
}

/**
 * Parse W3C tracestate header
 */
export function parseTracestate(header: string): Record<string, string> {
  const state: Record<string, string> = {};

  const pairs = header.split(',');
  for (const pair of pairs) {
    const trimmed = pair.trim();
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex);
      const value = trimmed.slice(eqIndex + 1);
      state[key] = value;
    }
  }

  return state;
}

/**
 * Format tracestate header
 */
export function formatTracestate(state: Record<string, string>): string {
  return Object.entries(state)
    .map(([key, value]) => `${key}=${value}`)
    .join(',');
}

/**
 * Trace context manager for managing current context
 */
export class TraceContextManager {
  private currentContext: TraceContext | null = null;
  private spans: Map<string, Span> = new Map();

  /**
   * Set current trace context
   */
  setContext(context: TraceContext): void {
    this.currentContext = context;
  }

  /**
   * Get current trace context
   */
  getContext(): TraceContext | null {
    return this.currentContext;
  }

  /**
   * Clear current context
   */
  clearContext(): void {
    this.currentContext = null;
  }

  /**
   * Start a new span
   */
  startSpan(name: string, attributes?: Record<string, unknown>): Span {
    const span: Span = {
      name,
      startTime: Date.now(),
      attributes,
      events: [],
      status: 'unset',
    };

    const spanId = generateSpanId();
    this.spans.set(spanId, span);

    return span;
  }

  /**
   * End a span
   */
  endSpan(span: Span, status: 'ok' | 'error' = 'ok'): void {
    span.endTime = Date.now();
    span.status = status;
  }

  /**
   * Add event to span
   */
  addEvent(
    span: Span,
    name: string,
    attributes?: Record<string, unknown>
  ): void {
    const event: SpanEvent = {
      name,
      timestamp: Date.now(),
      attributes,
    };

    span.events = span.events ?? [];
    span.events.push(event);
  }

  /**
   * Get headers for outgoing requests
   */
  getTraceHeaders(): Record<string, string> {
    if (!this.currentContext) {
      return {};
    }

    const headers: Record<string, string> = {
      traceparent: formatTraceparent(this.currentContext),
    };

    if (this.currentContext.baggage) {
      headers.baggage = Object.entries(this.currentContext.baggage)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join(',');
    }

    return headers;
  }

  /**
   * Extract context from incoming headers
   */
  extractContext(headers: Record<string, string>): TraceContext | null {
    const traceparent = headers.traceparent || headers['x-trace-id'];
    if (!traceparent) {
      return null;
    }

    const context = parseTraceparent(traceparent);
    if (!context) {
      return null;
    }

    // Parse baggage if present
    const baggageHeader = headers.baggage;
    if (baggageHeader) {
      context.baggage = {};
      const pairs = baggageHeader.split(',');
      for (const pair of pairs) {
        const eqIndex = pair.indexOf('=');
        if (eqIndex > 0) {
          const key = pair.slice(0, eqIndex).trim();
          const value = decodeURIComponent(pair.slice(eqIndex + 1).trim());
          context.baggage[key] = value;
        }
      }
    }

    return context;
  }
}

/**
 * Global trace context manager instance
 */
export const traceManager = new TraceContextManager();

/**
 * Execute function within a trace context
 */
export async function withTrace<T>(
  name: string,
  fn: (context: TraceContext) => Promise<T>,
  options?: {
    parentContext?: TraceContext;
    attributes?: Record<string, unknown>;
  }
): Promise<T> {
  const context = createTraceContext({
    parentContext: options?.parentContext ?? traceManager.getContext() ?? undefined,
  });

  const previousContext = traceManager.getContext();
  traceManager.setContext(context);

  const span = traceManager.startSpan(name, options?.attributes);

  try {
    const result = await fn(context);
    traceManager.endSpan(span, 'ok');
    return result;
  } catch (error) {
    traceManager.endSpan(span, 'error');
    traceManager.addEvent(span, 'exception', {
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    if (previousContext) {
      traceManager.setContext(previousContext);
    } else {
      traceManager.clearContext();
    }
  }
}
