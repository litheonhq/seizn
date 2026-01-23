/**
 * Seizn to OTEL Span Converter
 *
 * Converts Seizn trace data to OpenTelemetry span format.
 */

import type {
  SeizinSpanData,
  AttributeValue,
  SpanEvent,
  TraceContext,
} from './types';
import type {
  StoredTrace,
  Span as SeizinSpan,
  RetrievalEvent,
} from '../fall/flight-recorder/types';
import { DEFAULT_SEIZN_TO_OTEL_MAPPING } from './types';

// ============================================
// ID Generation
// ============================================

/**
 * Generate a valid OTEL trace ID (32 hex characters)
 */
export function generateTraceId(input?: string): string {
  if (input) {
    // If input is a UUID, convert to hex without dashes
    const hex = input.replace(/-/g, '');
    if (hex.length >= 32) {
      return hex.slice(0, 32).toLowerCase();
    }
    // Pad with zeros if needed
    return hex.padEnd(32, '0').toLowerCase();
  }
  // Generate random trace ID
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a valid OTEL span ID (16 hex characters)
 */
export function generateSpanId(input?: string): string {
  if (input) {
    const hex = input.replace(/-/g, '');
    if (hex.length >= 16) {
      return hex.slice(0, 16).toLowerCase();
    }
    return hex.padEnd(16, '0').toLowerCase();
  }
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============================================
// Conversion Functions
// ============================================

/**
 * Convert a Seizin StoredTrace to OTEL span data
 */
export function convertStoredTraceToOTel(
  storedTrace: StoredTrace,
  serviceName: string = 'seizn'
): SeizinSpanData[] {
  const spans: SeizinSpanData[] = [];
  const traceId = generateTraceId(storedTrace.trace.traceId);
  const rootSpanId = generateSpanId();

  // Create root span for the entire trace
  const startTime = new Date(storedTrace.trace.startedAt).getTime();
  const endTime = storedTrace.trace.endedAt
    ? new Date(storedTrace.trace.endedAt).getTime()
    : startTime + (storedTrace.trace.totalDurationMs || 0);

  const rootSpan: SeizinSpanData = {
    traceId,
    spanId: rootSpanId,
    operationName: 'seizn.retrieval',
    serviceName,
    startTimeUnixNano: BigInt(startTime * 1_000_000),
    endTimeUnixNano: BigInt(endTime * 1_000_000),
    durationMs: storedTrace.trace.totalDurationMs || 0,
    status: storedTrace.error ? 'error' : 'ok',
    statusMessage: storedTrace.error,
    attributes: buildRootAttributes(storedTrace),
    events: convertEventsToOTel(storedTrace.trace.events, startTime),
    links: [],
  };

  spans.push(rootSpan);

  // Convert child spans
  for (const seiznSpan of storedTrace.trace.spans) {
    const childSpan = convertSeizinSpanToOTel(
      seiznSpan,
      traceId,
      rootSpanId,
      serviceName
    );
    spans.push(childSpan);
  }

  return spans;
}

/**
 * Convert a single Seizn Span to OTEL span data
 */
export function convertSeizinSpanToOTel(
  seiznSpan: SeizinSpan,
  traceId: string,
  parentSpanId: string,
  serviceName: string
): SeizinSpanData {
  const startTime = new Date(seiznSpan.startedAt).getTime();
  const endTime = seiznSpan.endedAt
    ? new Date(seiznSpan.endedAt).getTime()
    : startTime + (seiznSpan.durationMs || 0);

  const otelSpanName =
    DEFAULT_SEIZN_TO_OTEL_MAPPING.spanNameMapping[seiznSpan.name] ||
    `seizn.${seiznSpan.name}`;

  return {
    traceId,
    spanId: generateSpanId(),
    parentSpanId,
    operationName: otelSpanName,
    serviceName,
    startTimeUnixNano: BigInt(startTime * 1_000_000),
    endTimeUnixNano: BigInt(endTime * 1_000_000),
    durationMs: seiznSpan.durationMs || 0,
    status: seiznSpan.status === 'error' ? 'error' : 'ok',
    statusMessage: seiznSpan.error,
    attributes: buildSpanAttributes(seiznSpan),
    events: [],
    links: [],
  };
}

/**
 * Build root span attributes from StoredTrace
 */
function buildRootAttributes(trace: StoredTrace): Record<string, AttributeValue> {
  const attrs: Record<string, AttributeValue> = {
    'seizn.trace.id': trace.id,
    'seizn.request.id': trace.requestId,
    'enduser.id': trace.userId,
    'seizn.user.plan': trace.plan,
    'seizn.sampled': trace.sampled,
    'seizn.results.count': trace.resultsCount,
  };

  if (trace.apiKeyId) {
    attrs['seizn.api_key.id'] = trace.apiKeyId;
  }

  if (trace.collectionId) {
    attrs['seizn.collection.id'] = trace.collectionId;
  }

  if (trace.collectionIds && trace.collectionIds.length > 0) {
    attrs['seizn.collection.ids'] = trace.collectionIds;
  }

  if (trace.queryText) {
    // Truncate query text to avoid large attributes
    attrs['seizn.query.text'] = trace.queryText.slice(0, 256);
  }

  if (trace.autopilotReason) {
    attrs['seizn.autopilot.reason'] = trace.autopilotReason;
  }

  if (trace.experimentId) {
    attrs['seizn.experiment.id'] = trace.experimentId;
  }

  if (trace.armId) {
    attrs['seizn.experiment.arm_id'] = trace.armId;
  }

  // Add cost attributes
  if (trace.trace.cost) {
    attrs['seizn.cost.total'] = trace.trace.cost.total;
    if (trace.trace.cost.embedding) {
      attrs['seizn.cost.embedding'] = trace.trace.cost.embedding;
    }
    if (trace.trace.cost.rerank) {
      attrs['seizn.cost.rerank'] = trace.trace.cost.rerank;
    }
    if (trace.trace.cost.llm) {
      attrs['seizn.cost.llm'] = trace.trace.cost.llm;
    }
  }

  // Add timing attributes
  if (trace.timingsMs) {
    for (const [key, value] of Object.entries(trace.timingsMs)) {
      attrs[`seizn.timing.${key}_ms`] = value;
    }
  }

  // Add config attributes
  if (trace.effectiveConfig) {
    if (trace.effectiveConfig.searchType) {
      attrs['seizn.config.search_type'] = trace.effectiveConfig.searchType;
    }
    if (trace.effectiveConfig.embeddingModel) {
      attrs['seizn.config.embedding_model'] = trace.effectiveConfig.embeddingModel;
    }
    if (trace.effectiveConfig.rerankEnabled !== undefined) {
      attrs['seizn.config.rerank_enabled'] = trace.effectiveConfig.rerankEnabled;
    }
    if (trace.effectiveConfig.rerankModel) {
      attrs['seizn.config.rerank_model'] = trace.effectiveConfig.rerankModel;
    }
    if (trace.effectiveConfig.topK !== undefined) {
      attrs['seizn.config.top_k'] = trace.effectiveConfig.topK;
    }
  }

  return attrs;
}

/**
 * Build span attributes from SeizinSpan
 */
function buildSpanAttributes(span: SeizinSpan): Record<string, AttributeValue> {
  const attrs: Record<string, AttributeValue> = {
    'seizn.span.name': span.name,
    'seizn.span.status': span.status,
  };

  if (span.durationMs !== undefined) {
    attrs['seizn.span.duration_ms'] = span.durationMs;
  }

  if (span.error) {
    attrs['seizn.span.error'] = span.error;
  }

  // Add input/output metadata (not full content to avoid large attributes)
  if (span.input) {
    attrs['seizn.span.has_input'] = true;
    const inputKeys = Object.keys(span.input);
    if (inputKeys.length > 0) {
      attrs['seizn.span.input_keys'] = inputKeys.slice(0, 10);
    }
  }

  if (span.output) {
    attrs['seizn.span.has_output'] = true;
    const outputKeys = Object.keys(span.output);
    if (outputKeys.length > 0) {
      attrs['seizn.span.output_keys'] = outputKeys.slice(0, 10);
    }
  }

  // Add metadata
  if (span.metadata) {
    for (const [key, value] of Object.entries(span.metadata)) {
      if (isValidAttributeValue(value)) {
        attrs[`seizn.span.metadata.${key}`] = value as AttributeValue;
      }
    }
  }

  return attrs;
}

/**
 * Convert Seizn events to OTEL span events
 */
function convertEventsToOTel(
  events: RetrievalEvent[],
  traceStartTime: number
): SpanEvent[] {
  return events.map((event) => {
    const eventTime = new Date(event.ts).getTime();
    const otelEventName =
      DEFAULT_SEIZN_TO_OTEL_MAPPING.eventTypeMapping[event.type] ||
      `seizn.event.${event.type}`;

    const attrs: Record<string, AttributeValue> = {
      'seizn.event.type': event.type,
    };

    if (event.piiMasked) {
      attrs['seizn.event.pii_masked'] = true;
    }

    if (event.durationMs !== undefined) {
      attrs['seizn.event.duration_ms'] = event.durationMs;
    }

    // Add safe payload attributes
    if (event.payload) {
      for (const [key, value] of Object.entries(event.payload)) {
        if (isValidAttributeValue(value)) {
          attrs[`seizn.event.payload.${key}`] = value as AttributeValue;
        }
      }
    }

    return {
      name: otelEventName,
      timeUnixNano: BigInt(eventTime * 1_000_000),
      attributes: attrs,
    };
  });
}

/**
 * Check if a value is a valid OTEL attribute value
 */
function isValidAttributeValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return false;
    const firstType = typeof value[0];
    return (
      (firstType === 'string' || firstType === 'number' || firstType === 'boolean') &&
      value.every((item) => typeof item === firstType)
    );
  }

  return false;
}

// ============================================
// Trace Context
// ============================================

/**
 * Parse traceparent header (W3C format)
 * Format: {version}-{trace-id}-{parent-id}-{trace-flags}
 */
export function parseTraceparent(header: string): TraceContext | null {
  const parts = header.split('-');
  if (parts.length !== 4) {
    return null;
  }

  const [version, traceId, spanId, traceFlags] = parts;

  // Validate format
  if (version !== '00' || traceId.length !== 32 || spanId.length !== 16) {
    return null;
  }

  return {
    traceId,
    spanId,
    traceFlags: parseInt(traceFlags, 16),
  };
}

/**
 * Create traceparent header from context
 */
export function createTraceparent(context: TraceContext): string {
  const flags = context.traceFlags.toString(16).padStart(2, '0');
  return `00-${context.traceId}-${context.spanId}-${flags}`;
}

/**
 * Extract trace context from request headers
 */
export function extractTraceContext(headers: Headers): TraceContext | null {
  const traceparent = headers.get('traceparent');
  if (!traceparent) {
    return null;
  }

  const context = parseTraceparent(traceparent);
  if (!context) {
    return null;
  }

  // Add tracestate if present
  const tracestate = headers.get('tracestate');
  if (tracestate) {
    context.traceState = tracestate;
  }

  return context;
}
