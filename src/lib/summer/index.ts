// Core types (re-export all types)
export * from './types';

// Pipeline
export * from './pipeline/retrieve';
export {
  indexDocuments as indexDocumentsLegacy,
  type IndexDocumentInput as IndexDocumentInputLegacy,
  type IndexDocumentsParams as IndexDocumentsParamsLegacy,
  type IndexDocumentsResult,
} from './pipeline/index-documents';

// Search and RAG
export * from './search';
export * from './rag-pipeline';

// Autopilot
export * from './autopilot/decide';
export * from './autopilot/planner';

// Federated and other modules
export * from './federated';
export * from './answer-contract';
export * from './ingest';
export * from './tuning';

// Enhanced indexing (v2) - primary export
export {
  chunkDocument,
  chunkBySlidingWindow,
  chunkBySentence,
  chunkByParagraph,
  chunkBySemantic,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_CHUNK_OVERLAP,
} from './chunker';

export {
  indexDocuments,
  indexDocumentsV2,
  type IndexDocumentsParams,
  getEmbeddingProviderForModel,
  getEmbeddingDimensions,
} from './indexer';
