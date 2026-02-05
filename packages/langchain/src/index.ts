/**
 * Seizn LangChain Adapter
 *
 * LangChain integration for Seizn AI Infrastructure.
 * Provides retriever, callback handler, and memory implementations.
 *
 * @packageDocumentation
 * @module @seizn/langchain
 *
 * @example Basic RAG Setup
 * ```typescript
 * import { SeiznRetriever, SeiznCallbackHandler, SeiznMemory } from '@seizn/langchain';
 * import { ChatOpenAI } from '@langchain/openai';
 * import { ConversationChain } from 'langchain/chains';
 *
 * // Setup retriever
 * const retriever = new SeiznRetriever({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   collectionId: 'my-docs',
 *   topK: 5,
 * });
 *
 * // Setup callback handler for observability
 * const callbacks = [
 *   new SeiznCallbackHandler({
 *     apiKey: process.env.SEIZN_API_KEY!,
 *     projectId: 'my-rag-app',
 *   }),
 * ];
 *
 * // Setup memory for conversation persistence
 * const memory = new SeiznMemory({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   sessionId: 'user-session-123',
 * });
 *
 * // Create chain
 * const llm = new ChatOpenAI({ callbacks });
 * const chain = new ConversationChain({
 *   llm,
 *   memory,
 * });
 * ```
 */

// ============================================
// Retriever Exports
// ============================================

export {
  SeiznRetriever,
  createSeiznRetriever,
  type SeiznRetrieverConfig,
  type SeiznDocumentMetadata,
} from './retriever';

// ============================================
// Callback Handler Exports
// ============================================

export {
  SeiznCallbackHandler,
  createSeiznCallbackHandler,
  type SeiznCallbackHandlerConfig,
  type TraceEvent,
  type TraceEventType,
} from './callbacks';

// ============================================
// Memory Exports
// ============================================

export {
  SeiznMemory,
  createSeiznMemory,
  createSessionMemory,
  type SeiznMemoryConfig,
  type MemoryEntry,
  type MemoryType,
  type ChatMessage,
} from './memory';

// ============================================
// Checkpointer Exports (LangGraph)
// ============================================

export {
  SeiznCheckpointer,
  createSeiznCheckpointer,
  type SeiznCheckpointerConfig,
  type Checkpoint,
  type CheckpointMetadata,
  type CheckpointTuple,
  type CheckpointListOptions,
  type RunnableConfig,
} from './checkpointer';

// ============================================
// Re-export core types for convenience
// ============================================

export type {
  SeiznConfig,
  RetrievalRequest,
  RetrievalResponse,
  Context,
  Citation,
  Receipt,
  TraceContext,
} from '@seizn/core';

export {
  SeiznClient,
  SeiznError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  generateTraceId,
} from '@seizn/core';

// ============================================
// Version
// ============================================

export const VERSION = '0.1.0';
