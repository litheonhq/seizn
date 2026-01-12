/**
 * Seizn Summer SDK - RAG Infrastructure
 *
 * The Summer SDK enables external applications to integrate with
 * Seizn's RAG infrastructure for:
 * - Document indexing with automatic chunking and embedding
 * - Hybrid search (vector + keyword)
 * - Federated search across multiple sources
 * - RAG query with answer generation
 *
 * @example
 * ```typescript
 * import { SummerClient } from '@seizn/summer';
 *
 * const summer = new SummerClient({
 *   apiKey: process.env.SEIZN_API_KEY!,
 * });
 *
 * // Create collection
 * const collection = await summer.createCollection({
 *   name: 'research-papers',
 *   description: 'Academic research papers',
 * });
 *
 * // Index documents
 * await summer.index({
 *   collectionId: collection.id,
 *   content: 'Document content...',
 *   metadata: { source: 'arxiv' },
 * });
 *
 * // Search
 * const results = await summer.search({
 *   collectionId: collection.id,
 *   query: 'machine learning applications',
 *   mode: 'hybrid',
 *   rerank: true,
 * });
 *
 * // RAG query
 * const answer = await summer.ask(
 *   collection.id,
 *   'What are the latest trends in machine learning?'
 * );
 * ```
 *
 * @packageDocumentation
 */

// Types
export * from './types';

// Client
export { SummerClient, createSummerClient } from './client';
