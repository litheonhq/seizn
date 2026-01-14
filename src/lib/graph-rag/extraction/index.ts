/**
 * GraphRAG Extraction Module
 *
 * Provides entity and relation extraction capabilities.
 */

export {
  extractEntities,
  extractEntitiesFromText,
  type EntityExtractionResult,
} from './entity-extractor';

export {
  extractRelations,
  extractRelationsFromText,
  type RelationExtractionResult,
} from './relation-extractor';
