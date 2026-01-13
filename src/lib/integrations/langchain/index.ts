/**
 * Seizn LangChain Connector
 *
 * LangChain/LangGraph integration for Seizn's memory and retrieval systems.
 *
 * This module provides:
 * - SeizRetriever: LangChain-compatible retriever using Summer RAG stack
 * - SeizVectorStore: LangChain-compatible VectorStore with MMR support
 * - SeizMemory: LangChain-compatible memory using Spring Memory API
 * - SeizCallbackHandler: API-based callback handler for Flight Recorder tracing
 * - SeizFlightRecorderHandler: Direct Flight Recorder integration handler
 *
 * @example Basic Retriever Usage
 * ```typescript
 * import { SeizRetriever } from '@/lib/integrations/langchain';
 *
 * const retriever = new SeizRetriever({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   collectionId: 'my-docs',
 *   userId: 'user-123',
 *   mode: 'hybrid',
 * });
 *
 * const docs = await retriever.getRelevantDocuments('What is RAG?');
 * ```
 *
 * @example VectorStore with MMR
 * ```typescript
 * import { SeizVectorStore } from '@/lib/integrations/langchain';
 *
 * const vectorStore = new SeizVectorStore({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   collectionId: 'my-docs',
 *   userId: 'user-123',
 * });
 *
 * // MMR search for diverse results
 * const docs = await vectorStore.maxMarginalRelevanceSearch('query', 5);
 *
 * // Use as retriever
 * const retriever = vectorStore.asRetriever({ k: 5, searchType: 'mmr' });
 * ```
 *
 * @example Flight Recorder Tracing
 * ```typescript
 * import {
 *   SeizFlightRecorderHandler,
 *   SeizRetriever,
 * } from '@/lib/integrations/langchain';
 *
 * // Create handler for automatic tracing
 * const handler = new SeizFlightRecorderHandler({
 *   userId: 'user-123',
 *   plan: 'pro',
 *   collectionId: 'my-docs',
 *   onTraceComplete: (traceId, durationMs) => {
 *     console.log(`Trace ${traceId} completed in ${durationMs}ms`);
 *   },
 * });
 *
 * // Use with LangChain chains
 * const chain = new RetrievalQAChain({
 *   llm: myLLM,
 *   retriever: myRetriever,
 *   callbacks: [handler],
 * });
 * ```
 *
 * @example Memory with Session Context
 * ```typescript
 * import { SeizMemory } from '@/lib/integrations/langchain';
 *
 * const memory = new SeizMemory({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   namespace: 'my-app',
 *   userId: 'user-123',
 *   sessionId: 'session-456',
 * });
 *
 * // Load context with relevant memories
 * const context = await memory.loadMemoryVariables({ input: 'query' });
 *
 * // Save conversation turns
 * await memory.saveContext({ input: 'question' }, { output: 'answer' });
 * ```
 *
 * @packageDocumentation
 */

// Types
export * from './types';

// Retriever
export {
  SeizRetriever,
  createSeizRetriever,
  createHybridRetriever,
  createSemanticRetriever,
} from './retriever';

// VectorStore
export {
  SeizVectorStore,
  SeizVectorStoreRetriever,
  createSeizVectorStore,
  createHybridVectorStore,
  type SeizVectorStoreConfig,
  type SearchResult,
  type SimilaritySearchOptions,
  type MMRSearchOptions,
  type RetrieverConfig,
} from './vectorstore';

// Memory
export {
  SeizMemory,
  createSeizMemory,
  createSessionMemory,
  createUserMemory,
} from './memory';

// Callback Handlers
export {
  // API-based handler (for client-side/remote usage)
  SeizCallbackHandler,
  createSeizCallbackHandler,
  createVerboseCallbackHandler,
  // Direct Flight Recorder handler (for server-side usage)
  SeizFlightRecorderHandler,
  createFlightRecorderHandler,
  type FlightRecorderHandlerConfig,
} from './callback';
