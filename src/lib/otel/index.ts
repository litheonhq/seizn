/**
 * Seizn OpenTelemetry Export Module
 *
 * Exports Seizn traces to OTLP-compatible observability backends.
 *
 * Usage:
 * ```typescript
 * import { exportTraceToOTLP, queueTraceForExport, isOTelEnabled } from '@/lib/otel';
 *
 * // Check if OTEL export is enabled
 * if (isOTelEnabled()) {
 *   // Export a trace immediately
 *   await exportTraceToOTLP(storedTrace);
 *
 *   // Or queue for batched export
 *   queueTraceForExport(storedTrace);
 * }
 * ```
 *
 * Environment Variables:
 * - OTEL_EXPORTER_ENABLED: Set to 'true' to enable export
 * - OTEL_EXPORTER_OTLP_ENDPOINT: OTLP endpoint URL (default: http://localhost:4318/v1/traces)
 * - OTEL_SERVICE_NAME: Service name in traces (default: seizn)
 * - OTEL_SERVICE_VERSION: Service version
 * - OTEL_ENVIRONMENT: Environment name (development, staging, production)
 * - OTEL_EXPORTER_OTLP_HEADERS: Custom headers (format: key1=value1,key2=value2)
 * - OTEL_BATCH_INTERVAL: Batch export interval in ms (default: 5000)
 * - OTEL_MAX_BATCH_SIZE: Max batch size (default: 512)
 * - OTEL_EXPORT_TIMEOUT: Export timeout in ms (default: 30000)
 * - OTEL_DEBUG: Enable debug logging
 */

// Configuration
export {
  loadOTelConfig,
  resetOTelConfig,
  setOTelConfig,
  isOTelEnabled,
  validateOTelConfig,
  getOTelConfig,
} from './config';

// Exporter
export {
  OTLPExporter,
  getOTLPExporter,
  resetOTLPExporter,
  exportTraceToOTLP,
  queueTraceForExport,
} from './exporter';

// Converter
export {
  convertStoredTraceToOTel,
  convertSeizinSpanToOTel,
  generateTraceId,
  generateSpanId,
  parseTraceparent,
  createTraceparent,
  extractTraceContext,
} from './converter';

// Types
export type {
  OTelConfig,
  SeizinSpanData,
  AttributeValue,
  SpanEvent,
  SpanLink,
  ExportResult,
  BatchExportResult,
  TraceContext,
  TraceparentHeader,
  SeizinToOTelMapping,
} from './types';

export { DEFAULT_SEIZN_TO_OTEL_MAPPING } from './types';

// GenAI Semantic Conventions
export {
  GenAIAttributes,
  LLMAttributes,
  EmbeddingAttributes,
  RerankAttributes,
  VectorDBAttributes,
  mapModelToSystem,
  mapSpanToOperation,
  buildGenAIAttributes,
  buildEmbeddingAttributes,
  buildRerankAttributes,
  buildVectorSearchAttributes,
} from './genai-conventions';

export type {
  GenAIOperationType,
  GenAISystem,
  GenAISpanAttributes,
} from './genai-conventions';

// Active Tracing / Instrumentation
export {
  getTracer,
  createSpan,
  withSpan,
  withSpanSync,
  withLLMSpan,
  withEmbeddingSpan,
  withRerankSpan,
  withVectorSearchSpan,
  withMemorySpan,
  withToolCallSpan,
  withHTTPSpan,
  buildHTTPAttributes,
  extractContextFromHeaders,
  injectContextToHeaders,
  recordPromptEvent,
  recordCompletionEvent,
  recordUsage,
} from './instrumentation';

export type {
  LLMSpanParams,
  EmbeddingSpanParams,
  RerankSpanParams,
  VectorSearchSpanParams,
  MemorySpanParams,
  ToolCallSpanParams,
  HTTPSpanParams,
} from './instrumentation';
