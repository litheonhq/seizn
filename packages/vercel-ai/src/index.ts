/**
 * Seizn Vercel AI SDK Adapter
 *
 * Official Vercel AI SDK adapter for Seizn AI Infrastructure.
 * Provides tools, middleware, and providers for RAG-enabled AI applications.
 *
 * @packageDocumentation
 * @module @seizn/vercel-ai
 *
 * @example
 * ```typescript
 * // Using tools
 * import { generateText } from 'ai';
 * import { openai } from '@ai-sdk/openai';
 * import { createSeiznRetrievalTool } from '@seizn/vercel-ai';
 *
 * const seiznRetrieval = createSeiznRetrievalTool({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   collectionId: 'my-docs',
 * });
 *
 * const result = await generateText({
 *   model: openai('gpt-4o'),
 *   tools: { seiznRetrieval },
 *   prompt: 'What is the return policy?',
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Using middleware
 * import { generateText } from 'ai';
 * import { openai } from '@ai-sdk/openai';
 * import { seiznMiddleware } from '@seizn/vercel-ai';
 *
 * const result = await generateText({
 *   model: openai('gpt-4o'),
 *   middleware: seiznMiddleware({
 *     apiKey: process.env.SEIZN_API_KEY!,
 *     enableTracing: true,
 *   }),
 *   prompt: 'Hello!',
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Using RAG provider
 * import { generateText } from 'ai';
 * import { openai } from '@ai-sdk/openai';
 * import { createSeiznRAGProvider } from '@seizn/vercel-ai';
 *
 * const seizn = createSeiznRAGProvider({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   baseModel: openai('gpt-4o'),
 *   defaultCollectionId: 'my-docs',
 * });
 *
 * const result = await generateText({
 *   model: seizn.rag('my-docs'),
 *   prompt: 'What are the key features?',
 * });
 * ```
 */

// ============================================
// Tools Exports
// ============================================

export {
  // Main tool creators
  createSeiznRetrievalTool,
  createSeiznDocumentSearchTool,
  createSeiznMultiCollectionSearchTool,
  createSeiznQATool,
  createSeiznVerificationTool,
  // Types
  type SeiznRetrievalToolConfig,
  type SeiznDocumentSearchConfig,
  type SeiznMultiCollectionSearchConfig,
  type RetrievalToolResult,
} from './tools';

// ============================================
// Middleware Exports
// ============================================

export {
  // Main middleware
  seiznMiddleware,
  // Specialized middleware
  seiznTracingMiddleware,
  seiznRAGMiddleware,
  // Types
  type SeiznMiddlewareConfig,
  type TraceEvent,
  type MiddlewareMetrics,
} from './middleware';

// ============================================
// Provider Exports
// ============================================

export {
  // Main provider
  createSeiznRAGProvider,
  // Convenience wrapper
  wrapWithRAG,
  // Types
  type SeiznRAGProviderConfig,
  type RAGModelOptions,
  type SeiznRAGMetadata,
  type SeiznRAGProvider,
} from './provider';

// ============================================
// Re-exports from @seizn/core
// ============================================

export {
  // Client (for advanced use cases)
  SeiznClient,
  createClient,
  // Types
  type SeiznConfig,
  type RetrievalRequest,
  type RetrievalResponse,
  type Context,
  type Citation,
  type Receipt,
  // Errors
  SeiznError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  // Auth utilities
  validateApiKey,
  maskApiKey,
  // Trace utilities
  generateTraceId,
  createTraceContext,
} from '@seizn/core';

// ============================================
// Version
// ============================================

/** Package version */
export const VERSION = '0.1.0';

/** Package name */
export const PACKAGE_NAME = '@seizn/vercel-ai';
