/**
 * Doc-to-DB: Structure-First Document Ingestion
 *
 * Extract tables, schemas, and structured data from documents
 * before vectorizing, enabling schema-aware retrieval.
 *
 * @module doc-to-db
 */

// ============================================================
// Types
// ============================================================

export type {
  // Structure types
  StructureType,
  CellDataType,
  SourceLocation,
  SchemaFieldDefinition,
  DocumentStructure,
  DocumentStructureInsert,
  StructureCell,
  StructureCellInsert,

  // Extraction types
  ExtractionOptions,
  IdentifiedStructure,
  ParsedStructure,
  ParsedCell,
  ExtractionResult,
  ExtractionMetadata,

  // Search types
  StructureSearchResult,
  CellSearchResult,
  StructureSearchOptions,
  CellSearchOptions,

  // API types
  ExtractRequest,
  ExtractResponse,
  StructureSearchRequest,
  CellSearchRequest,

  // Utility types
  StructureWithCells,
  BatchInsertResult,
} from './types';

export { DEFAULT_EXTRACTION_OPTIONS } from './types';

// ============================================================
// Main Extraction Functions
// ============================================================

export {
  extractStructures,
  saveExtractedStructures,
  searchStructures,
  searchCells,
} from './extractor';

// ============================================================
// Parsing Utilities
// ============================================================

export {
  // Table parsing
  parseMarkdownTable,
  parseCSVContent,
  parseTSVContent,
  parseASCIITable,
  parseAlignedColumns,
  autoParseTable,
  toTableStructure,
  extractTableCells,

  // List parsing
  parseList,

  // Key-value parsing
  parseKeyValuePairs,
  extractKeyValueCells,
} from './table-parser';

// ============================================================
// Schema Inference
// ============================================================

export {
  // Type detection
  inferCellType,
  inferColumnType,
  isEmail,
  isUrl,
  isPhone,
  isDate,
  isCurrency,
  isPercentage,
  isBoolean,
  isNumber,

  // Schema generation
  generateSchema,

  // Value normalization
  normalizeValue,
  parseCurrency,
  parsePercentage,

  // Validation
  validateType,
} from './schema-inference';

// ============================================================
// Prompts
// ============================================================

export {
  STRUCTURE_IDENTIFICATION_PROMPT,
  TABLE_PARSING_PROMPT,
  LIST_PARSING_PROMPT,
  KEY_VALUE_PARSING_PROMPT,
  HIERARCHY_PARSING_PROMPT,
  SCHEMA_INFERENCE_PROMPT,
  COMBINED_EXTRACTION_PROMPT,
  DESCRIPTION_GENERATION_PROMPT,
  buildIdentificationPrompt,
} from './prompts';
