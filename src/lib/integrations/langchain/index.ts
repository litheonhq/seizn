/**
 * Seizn LangChain Connector
 *
 * LangChain/LangGraph integration for Seizn's memory and retrieval systems.
 *
 * This module provides:
 * - SeizRetriever: LangChain-compatible retriever using Summer RAG stack
 * - SeizMemory: LangChain-compatible memory using Spring Memory API
 * - SeizCallbackHandler: Callback handler for Flight Recorder tracing
 *
 * @example
 * ```typescript
 * import {
 *   SeizRetriever,
 *   SeizMemory,
 *   SeizCallbackHandler,
 * } from '@/lib/integrations/langchain';
 *
 * // Create a retriever for document search
 * const retriever = new SeizRetriever({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   collectionId: 'my-docs',
 *   userId: 'user-123',
 *   mode: 'hybrid',
 * });
 *
 * // Create a memory for conversation context
 * const memory = new SeizMemory({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   namespace: 'my-app',
 *   userId: 'user-123',
 * });
 *
 * // Create a callback handler for tracing
 * const handler = new SeizCallbackHandler({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   userId: 'user-123',
 * });
 *
 * // Use with LangChain
 * const chain = new RetrievalQAChain({
 *   llm: myLLM,
 *   retriever,
 *   memory,
 *   callbacks: [handler],
 * });
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

// Memory
export {
  SeizMemory,
  createSeizMemory,
  createSessionMemory,
  createUserMemory,
} from './memory';

// Callback Handler
export {
  SeizCallbackHandler,
  createSeizCallbackHandler,
  createVerboseCallbackHandler,
} from './callback';
