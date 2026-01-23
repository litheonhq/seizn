/**
 * Seizn OpenTelemetry Types
 *
 * Type definitions for OTEL integration.
 */

import type { Span as OTelSpan, SpanContext } from '@opentelemetry/api';

// ============================================
// OTEL Configuration
// ============================================

export interface OTelConfig {
  /** Enable OTEL export */
  enabled: boolean;
  /** OTLP endpoint URL */
  endpoint: string;
  /** Service name for traces */
  serviceName: string;
  /** Service version */
  serviceVersion?: string;
  /** Environment (development, staging, production) */
  environment?: string;
  /** Custom headers for OTLP requests */
  headers?: Record<string, string>;
  /** Batch export interval in ms (default: 5000) */
  batchInterval?: number;
  /** Maximum batch size (default: 512) */
  maxBatchSize?: number;
  /** Export timeout in ms (default: 30000) */
  exportTimeout?: number;
  /** Enable console logging for debugging */
  debug?: boolean;
}

// ============================================
// Span Conversion Types
// ============================================

export interface SeizinSpanData {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  startTimeUnixNano: bigint;
  endTimeUnixNano: bigint;
  durationMs: number;
  status: 'ok' | 'error' | 'unset';
  statusMessage?: string;
  attributes: Record<string, AttributeValue>;
  events: SpanEvent[];
  links: SpanLink[];
}

export type AttributeValue = string | number | boolean | string[] | number[] | boolean[];

export interface SpanEvent {
  name: string;
  timeUnixNano: bigint;
  attributes?: Record<string, AttributeValue>;
}

export interface SpanLink {
  traceId: string;
  spanId: string;
  attributes?: Record<string, AttributeValue>;
}

// ============================================
// Export Types
// ============================================

export interface ExportResult {
  success: boolean;
  exportedCount: number;
  failedCount: number;
  errors?: string[];
}

export interface BatchExportResult {
  batchId: string;
  success: boolean;
  spans: number;
  timestamp: string;
  duration: number;
  endpoint: string;
}

// ============================================
// Trace Context
// ============================================

export interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
  traceState?: string;
}

/**
 * W3C Trace Context headers
 */
export interface TraceparentHeader {
  version: string;
  traceId: string;
  parentId: string;
  traceFlags: string;
}

// ============================================
// Seizn to OTEL Mapping
// ============================================

export interface SeizinToOTelMapping {
  /** Map Seizn span names to OTEL span names */
  spanNameMapping: Record<string, string>;
  /** Map Seizn event types to OTEL event names */
  eventTypeMapping: Record<string, string>;
  /** Map Seizn attributes to OTEL semantic conventions */
  attributeMapping: Record<string, string>;
}

/**
 * Default mapping from Seizn spans to OTEL semantic conventions
 */
export const DEFAULT_SEIZN_TO_OTEL_MAPPING: SeizinToOTelMapping = {
  spanNameMapping: {
    embedding: 'seizn.embedding.create',
    vector_search: 'seizn.vector.search',
    keyword_search: 'seizn.keyword.search',
    rerank: 'seizn.rerank.execute',
    llm_generation: 'seizn.llm.generate',
    postprocess: 'seizn.postprocess',
    cache_lookup: 'seizn.cache.lookup',
    custom: 'seizn.custom',
  },
  eventTypeMapping: {
    embed: 'seizn.event.embed',
    candidates: 'seizn.event.candidates',
    rerank: 'seizn.event.rerank',
    context: 'seizn.event.context',
    compression: 'seizn.event.compression',
    answer_contract: 'seizn.event.answer_contract',
    feedback: 'seizn.event.feedback',
    error: 'seizn.event.error',
    llm: 'seizn.event.llm',
    cache_hit: 'seizn.event.cache_hit',
    custom: 'seizn.event.custom',
  },
  attributeMapping: {
    userId: 'enduser.id',
    apiKeyId: 'seizn.api_key.id',
    collectionId: 'seizn.collection.id',
    queryText: 'seizn.query.text',
    plan: 'seizn.user.plan',
    requestId: 'seizn.request.id',
    resultsCount: 'seizn.results.count',
    cost: 'seizn.cost.total',
  },
};
