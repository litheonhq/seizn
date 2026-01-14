/**
 * Seizn Core SDK
 *
 * A1 Drop-in Adoption Layer for Seizn AI Infrastructure.
 *
 * @packageDocumentation
 * @module @seizn/core
 *
 * @example
 * ```typescript
 * import { SeiznClient } from '@seizn/core';
 *
 * const client = new SeiznClient({
 *   apiKey: process.env.SEIZN_API_KEY!,
 * });
 *
 * // Retrieve relevant contexts
 * const result = await client.retrieve({
 *   query: 'What are the key findings?',
 *   topK: 5,
 * });
 *
 * // Use contexts in your LLM prompt
 * const contexts = result.contexts.map(c => c.content).join('\n');
 * const citations = result.citations;
 * ```
 */

// ============================================
// Client Exports
// ============================================

export { SeiznClient, createClient, createTracedClient } from './client';

// ============================================
// Type Exports
// ============================================

export type {
  // Configuration
  SeiznConfig,

  // Retrieval
  RetrievalRequest,
  RetrievalResponse,
  Context,
  Receipt,
  Citation,
  QueryInfo,

  // Collections
  Collection,
  CollectionSettings,

  // Documents
  DocumentUploadRequest,
  DocumentUploadResponse,

  // Tracing
  TraceContext,
  Span,
  SpanEvent,

  // Health
  HealthStatus,
  ComponentHealth,

  // Errors
  SeiznErrorCode,
  SeiznErrorInfo,
} from './types';

// ============================================
// Error Exports
// ============================================

export {
  SeiznError,
  AuthenticationError,
  AuthorizationError,
  RateLimitError,
  ValidationError,
  NotFoundError,
  TimeoutError,
  NetworkError,
  ServerError,
  createErrorFromResponse,
  isSeiznError,
} from './errors';

// ============================================
// Auth Exports
// ============================================

export {
  validateApiKey,
  resolveApiKey,
  maskApiKey,
  buildAuthHeader,
  buildBearerHeader,
  isTestKey,
  isLiveKey,
} from './auth';

// ============================================
// Trace Exports
// ============================================

export {
  createTraceContext,
  generateTraceId,
  generateSpanId,
  parseTraceparent,
  formatTraceparent,
  parseTracestate,
  formatTracestate,
  TraceContextManager,
  traceManager,
  withTrace,
} from './trace';

// ============================================
// Version
// ============================================

export const VERSION = '0.1.0';
