/**
 * Seizn Core - Trace Context
 *
 * Unified tracing across all seasons:
 * - Generate trace/span IDs
 * - Propagate context across service boundaries
 * - Sampling decisions
 */

import { randomUUID } from 'crypto';
import type { TraceContext, TraceSpan, TraceLog } from './types';

// Sampling rate (10% by default, configurable via env)
const SAMPLING_RATE = parseFloat(process.env.SEIZN_TRACE_SAMPLING_RATE ?? '0.1');

/**
 * Generate a new trace ID (UUID v4)
 */
export function generateTraceId(): string {
  return randomUUID();
}

/**
 * Generate a new span ID (shorter, 16 hex chars)
 */
export function generateSpanId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

/**
 * Make sampling decision based on rate
 */
export function shouldSample(traceId: string): boolean {
  // Use trace ID hash for consistent sampling
  const hash = traceId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return (hash % 100) / 100 < SAMPLING_RATE;
}

/**
 * Create a new trace context for a request
 */
export function createTraceContext(options?: {
  traceId?: string;
  parentSpanId?: string;
  sampled?: boolean;
  baggage?: Record<string, string>;
}): TraceContext {
  const traceId = options?.traceId ?? generateTraceId();
  const sampled = options?.sampled ?? shouldSample(traceId);

  return {
    traceId,
    spanId: generateSpanId(),
    parentSpanId: options?.parentSpanId,
    sampled,
    baggage: options?.baggage ?? {},
  };
}

/**
 * Create a child span from parent context
 */
export function createChildContext(parent: TraceContext): TraceContext {
  return {
    traceId: parent.traceId,
    spanId: generateSpanId(),
    parentSpanId: parent.spanId,
    sampled: parent.sampled,
    baggage: { ...parent.baggage },
  };
}

/**
 * Extract trace context from HTTP headers (W3C Trace Context format)
 */
export function extractFromHeaders(headers: Record<string, string | undefined>): TraceContext | null {
  const traceparent = headers['traceparent'];

  if (!traceparent) {
    return null;
  }

  // Format: 00-<trace-id>-<parent-id>-<flags>
  const parts = traceparent.split('-');

  if (parts.length !== 4) {
    return null;
  }

  const [, rawTraceId, parentSpanId, flags] = parts;
  const sampled = (parseInt(flags, 16) & 0x01) === 1;

  // Convert 32 hex char trace-id back to UUID format
  const traceId = rawTraceId.length === 32
    ? `${rawTraceId.slice(0, 8)}-${rawTraceId.slice(8, 12)}-${rawTraceId.slice(12, 16)}-${rawTraceId.slice(16, 20)}-${rawTraceId.slice(20)}`
    : rawTraceId;

  // Parse baggage header
  const baggage: Record<string, string> = {};
  const baggageHeader = headers['baggage'];

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
    sampled,
    baggage,
  };
}

/**
 * Inject trace context into HTTP headers (W3C Trace Context format)
 */
export function injectToHeaders(ctx: TraceContext): Record<string, string> {
  const flags = ctx.sampled ? '01' : '00';
  // W3C format requires trace-id as 32 hex chars (no dashes)
  const normalizedTraceId = ctx.traceId.replace(/-/g, '');
  const traceparent = `00-${normalizedTraceId}-${ctx.spanId}-${flags}`;

  const headers: Record<string, string> = {
    traceparent,
  };

  // Inject baggage
  if (Object.keys(ctx.baggage).length > 0) {
    headers['baggage'] = Object.entries(ctx.baggage)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join(',');
  }

  return headers;
}

/**
 * Create a span for an operation
 */
export function createSpan(
  ctx: TraceContext,
  operationName: string,
  service: TraceSpan['service']
): TraceSpan {
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    parentSpanId: ctx.parentSpanId,
    operationName,
    service,
    startTime: new Date().toISOString(),
    status: 'ok',
    tags: {},
    logs: [],
  };
}

/**
 * Add a tag to a span
 */
export function addSpanTag(
  span: TraceSpan,
  key: string,
  value: string | number | boolean
): void {
  span.tags[key] = value;
}

/**
 * Add a log entry to a span
 */
export function addSpanLog(
  span: TraceSpan,
  level: TraceLog['level'],
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
 * Finish a span
 */
export function finishSpan(
  span: TraceSpan,
  status: TraceSpan['status'] = 'ok'
): TraceSpan {
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
 * Add Seizn-specific baggage
 */
export function addSeiznBaggage(
  ctx: TraceContext,
  data: {
    userId?: string;
    projectId?: string;
    environment?: string;
    season?: string;
  }
): TraceContext {
  return {
    ...ctx,
    baggage: {
      ...ctx.baggage,
      ...(data.userId && { 'seizn.user_id': data.userId }),
      ...(data.projectId && { 'seizn.project_id': data.projectId }),
      ...(data.environment && { 'seizn.environment': data.environment }),
      ...(data.season && { 'seizn.season': data.season }),
    },
  };
}
