/**
 * BYO (Bring Your Own) Vector Store Module
 *
 * Allows customers to use their own vector databases with Seizn.
 * Supports Pinecone, Weaviate, and Qdrant out of the box.
 *
 * @example
 * ```typescript
 * // Using environment variables
 * import { getDefaultStore } from '@/lib/summer/stores';
 *
 * const store = await getDefaultStore();
 * const results = await store.search({
 *   vector: embedding,
 *   topK: 10,
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Using explicit configuration
 * import { createConnectedStore } from '@/lib/summer/stores';
 *
 * const store = await createConnectedStore({
 *   provider: 'pinecone',
 *   apiKey: process.env.PINECONE_API_KEY!,
 *   host: process.env.PINECONE_HOST!,
 *   namespace: 'my-namespace',
 * });
 * ```
 */

// Types
export type {
  // Core types
  VectorRecord,
  VectorSearchResult,
  VectorSearchOptions,
  VectorFilter,
  FieldFilter,

  // Configuration types
  VectorStoreProvider,
  BaseStoreConfig,
  VectorStoreConfig,
  PineconeStoreConfig,
  WeaviateStoreConfig,
  QdrantStoreConfig,
  SupabaseStoreConfig,
  CustomStoreConfig,

  // Interface
  VectorStore,

  // Response types
  HealthCheckResult,
  UpsertResult,
  SearchResponse,
  DeleteResult,
  FetchResult,
  StoreStats,

  // Error types
  VectorStoreErrorCode,
} from './types';

export { VectorStoreError } from './types';

// Store implementations
export { PineconeStore } from './pinecone';
export { WeaviateStore } from './weaviate';
export { QdrantStore } from './qdrant';

// Factory functions
export {
  createStore,
  createStoreFromEnv,
  createConnectedStore,
  createConnectedStoreFromEnv,
  getDefaultStore,
  resetDefaultStore,
  isBYOStoreConfigured,
  getConfiguredProvider,
  ENV_KEYS,
  type StoreFactoryOptions,
} from './factory';
