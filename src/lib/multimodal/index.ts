/**
 * Seizn Multimodal - Layout-Preserving Retrieval
 *
 * C2: Multimodal + Layout-Preserving Retrieval
 *
 * Public API for structured document processing with:
 * - PDF parsing with layout preservation
 * - Table extraction and search
 * - Block-level retrieval with type weighting
 * - Context expansion for coherent results
 */

// Types
export type {
  BlockType,
  BoundingBox,
  DocumentBlock,
  ParsedDocument,
  TableCell,
  ParsedTable,
  HighlightSpan,
  MultimodalSearchResult,
  ParseOptions,
  MultimodalSearchOptions,
  BlockQueryOptions,
  BlockStoreResult,
  ExpandedContext,
} from './types';

// PDF Parser
export { parsePdf, parsePdfFromPath } from './parsers/pdf-parser';

// Table Extractor
export {
  extractTable,
  detectMergedCells,
  validateTable,
} from './parsers/table-extractor';

// Block Store
export {
  storeBlocks,
  queryBlocks,
  getBlock,
  getBlocksByDocument,
  deleteBlocksByDocument,
  searchBlocksBySimilarity,
  getContextBlocks,
  updateBlockEmbedding,
} from './store/block-store';

// Multimodal Retriever
export {
  multimodalSearch,
  searchTables,
  searchCode,
  searchInPages,
  expandBlockContext,
  getBlocksByType,
  getDocumentOutline,
  getDocumentTables,
  findBlocksNearPage,
  computePositionBoost,
  reRankResults,
} from './retrieval/multimodal-retriever';
