/**
 * Summer Ingestion Module
 *
 * Advanced document ingestion with:
 * - Layout-aware PDF parsing
 * - Table extraction
 * - Math/equation extraction
 * - Partial document updates
 *
 * @deprecated UNUSED - This module is exported but not currently used in the codebase.
 * Review for potential removal or implementation in future releases.
 * Code quality audit: 2026-02-05
 */

// Layout Parser
export {
  classifyZone,
  detectColumns,
  mergeAdjacentBlocks,
  getReadingOrder,
  parseLayoutFromBuffer,
  layoutToStructuredText,
  type LayoutZone,
  type TextBlock,
  type PageLayout,
  type DocumentLayout,
} from './layout-parser';

// Table Extractor
export {
  extractTablesFromText,
  parseTableFromHTML,
  tableToMarkdown,
  tableToJSON,
  detectCellDataType,
  type TableCell,
  type ExtractedTable,
  type TableExtractionOptions,
} from './table-extractor';

// Math/Equation Extractor
export {
  extractLatexEquations,
  extractUnicodeMath,
  extractAsciiMath,
  extractAllMath,
  validateLatex,
  equationToSearchText,
  type MathFormat,
  type ExtractedEquation,
  type MathExtractionOptions,
} from './math-extractor';

// Partial Updater
export {
  computeChunkHash,
  computeTextSimilarity,
  computeChunkDiff,
  createDocumentDiff,
  applyPartialUpdate,
  checkDocumentNeedsUpdate,
  computeDocumentHash,
  getCollectionUpdateStats,
  type ChunkChange,
  type DocumentDiff,
  type PartialUpdateOptions,
  type PartialUpdateResult,
} from './partial-updater';
