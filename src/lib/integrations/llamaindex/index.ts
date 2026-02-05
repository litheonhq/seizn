/**
 * Seizn LlamaIndex Integration
 *
 * LlamaIndex-compatible components for Seizn's memory and retrieval systems.
 *
 * This module provides:
 * - SeizNMemoryRetriever: LlamaIndex-compatible BaseRetriever for memory search
 * - SeizNVectorStore: LlamaIndex-compatible VectorStore for memory storage
 *
 * @example Memory Retriever Usage
 * ```typescript
 * import { SeizNMemoryRetriever } from '@/lib/integrations/llamaindex';
 *
 * const retriever = new SeizNMemoryRetriever({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   userId: 'user-123',
 *   namespace: 'my-app',
 * });
 *
 * // Retrieve relevant memories
 * const nodes = await retriever.retrieve('user preferences', 5);
 *
 * for (const { node, score } of nodes) {
 *   console.log(`[${score.toFixed(3)}] ${node.text}`);
 * }
 * ```
 *
 * @example Vector Store Usage
 * ```typescript
 * import { SeizNVectorStore } from '@/lib/integrations/llamaindex';
 *
 * const store = new SeizNVectorStore({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   userId: 'user-123',
 * });
 *
 * // Add nodes
 * const ids = await store.add([
 *   { text: 'User prefers dark mode', metadata: { type: 'preference' } },
 * ]);
 *
 * // Query for similar content
 * const results = await store.query({
 *   queryStr: 'UI settings',
 *   similarityTopK: 5,
 * });
 * ```
 *
 * @example With LlamaIndex Query Engine
 * ```typescript
 * import { SeizNMemoryRetriever } from '@/lib/integrations/llamaindex';
 * import { RetrieverQueryEngine } from 'llamaindex';
 *
 * const retriever = new SeizNMemoryRetriever({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   userId: 'user-123',
 * });
 *
 * // Use with LlamaIndex query engine
 * const queryEngine = new RetrieverQueryEngine(retriever);
 * const response = await queryEngine.query('What are my preferences?');
 * ```
 *
 * @packageDocumentation
 */

// Memory Retriever
export {
  SeizNMemoryRetriever,
  createSeizNMemoryRetriever,
  createSessionRetriever,
  createUserRetriever,
  type SeizNMemoryRetrieverConfig,
  type NodeWithScore,
  type BaseNode,
  type NodeMetadata,
  type SeizNError,
} from './memory-retriever';

// Vector Store
export {
  SeizNVectorStore,
  createSeizNVectorStore,
  createSessionVectorStore,
  createUserVectorStore,
  type SeizNVectorStoreConfig,
  type VectorStoreQuery,
  type VectorStoreQueryResult,
  type VectorStoreFilter,
  type BaseNode as VectorStoreBaseNode,
} from './memory-store';
