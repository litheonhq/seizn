/**
 * Seizn LangChain Adapter
 *
 * Enables integration between Seizn's RAG infrastructure and LangChain.
 * Provides a drop-in retriever that works seamlessly with LangChain chains,
 * agents, and other components.
 *
 * @packageDocumentation
 *
 * @example Quick Start
 * ```typescript
 * import { SeiznRetriever } from '@/lib/adapters/langchain';
 *
 * // Create retriever
 * const retriever = new SeiznRetriever({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   collectionId: 'my-docs',
 *   topK: 5,
 *   searchMode: 'hybrid',
 *   rerank: true,
 * });
 *
 * // Use directly
 * const docs = await retriever.getRelevantDocuments('What is RAG?');
 *
 * // Or with LangChain chains
 * const chain = RetrievalQAChain.fromLLM(llm, retriever);
 * const result = await chain.call({ query: 'Explain vector databases' });
 * ```
 *
 * @example Advanced Configuration
 * ```typescript
 * const retriever = new SeiznRetriever({
 *   apiKey: process.env.SEIZN_API_KEY!,
 *   collectionId: 'enterprise-docs',
 *   topK: 10,
 *   searchMode: 'hybrid',
 *   rerank: true,
 *   rerankTopN: 5,
 *   threshold: 0.7,
 *   filter: {
 *     department: 'engineering',
 *     visibility: 'public',
 *   },
 *   timeout: 30000,
 *   retries: 3,
 * });
 * ```
 *
 * @example With Different Collection
 * ```typescript
 * // Create a retriever for a different collection
 * const hrRetriever = retriever.withConfig({
 *   collectionId: 'hr-policies',
 *   filter: { category: 'benefits' },
 * });
 * ```
 */

// Main retriever class and factory
export { SeiznRetriever, createSeiznRetriever } from './retriever';

// Type definitions
export type {
  SeiznRetrieverConfig,
  LangChainDocument,
  SeiznDocument,
  CallbackManagerForRetrieverRun,
  DocumentConversionOptions,
  SeiznRetrieverError,
  SeiznSearchResponse,
  SearchMode,
  SearchResult,
  SearchResponse,
} from './types';

// Type guard utility
export { isSeiznRetrieverError } from './types';
