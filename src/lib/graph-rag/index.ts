/**
 * GraphRAG - Graph-Augmented Retrieval
 *
 * Combines knowledge graph construction with vector search
 * for enhanced context retrieval and multi-hop reasoning.
 *
 * @module graph-rag
 *
 * @example
 * ```typescript
 * import {
 *   extractEntities,
 *   extractRelations,
 *   createEntities,
 *   createRelations,
 *   retrieve,
 * } from '@/lib/graph-rag';
 *
 * // Extract entities from text
 * const { entities } = await extractEntities([{ id: 'chunk1', content: '...' }]);
 *
 * // Extract relations
 * const { relations } = await extractRelations(chunks, entities);
 *
 * // Store in graph
 * await createEntities(config, entities);
 * await createRelations(config, relations);
 *
 * // Retrieve with graph augmentation
 * const result = await retrieve(config, 'query text');
 * ```
 */

// Types
export type {
  // Entity types
  EntityType,
  Entity,
  EntityInput,
  // Relation types
  RelationType,
  Relation,
  RelationInput,
  // Query types
  GraphQuery,
  GraphPath,
  GraphSearchResult,
  // Extraction types
  ExtractionResult,
  ChunkInput,
  ExtractionOptions,
  // Store types
  GraphStoreConfig,
  EntityQuery,
  RelationQuery,
  // Retrieval types
  GraphRetrievalOptions,
  GraphRetrievalResult,
  // Database types
  DbEntity,
  DbRelation,
} from './types';

// Extraction
export {
  extractEntities,
  extractEntitiesFromText,
  type EntityExtractionResult,
} from './extraction/entity-extractor';

export {
  extractRelations,
  extractRelationsFromText,
  type RelationExtractionResult,
} from './extraction/relation-extractor';

// Store
export {
  // Entity operations
  createEntity,
  createEntities,
  getEntity,
  findSimilarEntities,
  updateEntity,
  deleteEntity,
  findEntityByName,
  mergeEntitySources,
  // Relation operations
  createRelation,
  createRelations,
  queryRelations,
  getEntityRelations,
  deleteRelation,
  // Graph traversal
  traverseGraph,
  findPath,
} from './store/graph-store';

// Retrieval
export {
  retrieve,
  multiHopRetrieve,
  focusedRetrieve,
  buildContext,
} from './retrieval/graph-retriever';
