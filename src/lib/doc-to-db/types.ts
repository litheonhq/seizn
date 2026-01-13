/**
 * Doc-to-DB: Type Definitions
 *
 * Types for structure extraction and storage from documents.
 */

// ============================================================
// Structure Types
// ============================================================

/**
 * Types of structures that can be extracted from documents
 */
export type StructureType = 'table' | 'schema' | 'list' | 'hierarchy' | 'key_value';

/**
 * Inferred data types for cell values
 */
export type CellDataType =
  | 'text'
  | 'number'
  | 'date'
  | 'currency'
  | 'percentage'
  | 'boolean'
  | 'email'
  | 'url'
  | 'phone'
  | 'unknown';

// ============================================================
// Document Structure
// ============================================================

/**
 * Source location information within the document
 */
export interface SourceLocation {
  start_char?: number;
  end_char?: number;
  section?: string;
  page?: number;
}

/**
 * Schema field definition for schema-type structures
 */
export interface SchemaFieldDefinition {
  name: string;
  type: CellDataType;
  required?: boolean;
  description?: string;
  constraints?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
  };
}

/**
 * Extracted structure from a document
 */
export interface DocumentStructure {
  id?: string;
  user_id: string;
  document_id: string;
  collection_id?: string;

  // Structure metadata
  structure_type: StructureType;
  title?: string;
  description?: string;

  // Structure content
  headers?: string[];
  rows?: (string | number | boolean | null)[][];
  schema_def?: SchemaFieldDefinition[];
  raw_text?: string;

  // Source location
  source_page?: number;
  source_location?: SourceLocation;

  // Metadata
  metadata?: Record<string, unknown>;
  embedding?: number[];

  // Statistics
  row_count?: number;
  column_count?: number;

  // Timestamps
  created_at?: string;
  updated_at?: string;
}

/**
 * Structure for database insertion (without id and timestamps)
 */
export type DocumentStructureInsert =
  Omit<DocumentStructure, 'id' | 'created_at' | 'updated_at'>;

// ============================================================
// Structure Cells
// ============================================================

/**
 * Individual cell within a structure
 */
export interface StructureCell {
  id?: string;
  structure_id: string;

  // Cell position
  row_index: number;
  col_index?: number;

  // Cell content
  cell_key?: string;
  cell_value: string;

  // Inferred data type
  data_type: CellDataType;

  // Embedding for semantic search
  embedding?: number[];

  // Timestamp
  created_at?: string;
}

/**
 * Cell for database insertion
 */
export type StructureCellInsert = Omit<StructureCell, 'id' | 'created_at'>;

// ============================================================
// Extraction Types
// ============================================================

/**
 * Options for structure extraction
 */
export interface ExtractionOptions {
  /** Extract table structures */
  extractTables?: boolean;
  /** Extract list structures */
  extractLists?: boolean;
  /** Extract key-value pairs */
  extractKeyValue?: boolean;
  /** Extract hierarchical structures */
  extractHierarchy?: boolean;
  /** Infer data types for cells */
  inferSchema?: boolean;
  /** Minimum number of rows for table detection */
  minTableRows?: number;
  /** Minimum number of columns for table detection */
  minTableCols?: number;
  /** Generate embeddings for structures */
  generateEmbeddings?: boolean;
  /** Generate embeddings for individual cells */
  generateCellEmbeddings?: boolean;
  /** LLM model to use for extraction */
  model?: 'haiku' | 'sonnet';
  /** Collection ID to associate structures with */
  collectionId?: string;
}

/**
 * Default extraction options
 */
export const DEFAULT_EXTRACTION_OPTIONS: ExtractionOptions = {
  extractTables: true,
  extractLists: true,
  extractKeyValue: true,
  extractHierarchy: false,
  inferSchema: true,
  minTableRows: 2,
  minTableCols: 2,
  generateEmbeddings: true,
  generateCellEmbeddings: false,
  model: 'haiku',
};

/**
 * Raw structure identified by LLM before parsing
 */
export interface IdentifiedStructure {
  type: StructureType;
  title?: string;
  raw_content: string;
  start_position: number;
  end_position: number;
  confidence: number;
}

/**
 * Parsed structure ready for storage
 */
export interface ParsedStructure {
  type: StructureType;
  title?: string;
  description?: string;
  headers?: string[];
  rows?: (string | number | boolean | null)[][];
  schema_def?: SchemaFieldDefinition[];
  raw_text: string;
  source_location: SourceLocation;
  row_count: number;
  column_count: number;
}

/**
 * Cell ready for storage
 */
export interface ParsedCell {
  row_index: number;
  col_index?: number;
  cell_key?: string;
  cell_value: string;
  data_type: CellDataType;
}

/**
 * Complete extraction result
 */
export interface ExtractionResult {
  /** Successfully extracted structures */
  structures: ParsedStructure[];
  /** Individual cells from all structures */
  cells: Map<number, ParsedCell[]>; // structure index -> cells
  /** Extraction metadata */
  metadata: ExtractionMetadata;
}

/**
 * Metadata about the extraction process
 */
export interface ExtractionMetadata {
  tablesFound: number;
  listsFound: number;
  keyValuePairsFound: number;
  hierarchiesFound: number;
  totalCells: number;
  processingTimeMs: number;
  modelUsed: string;
  tokensUsed?: number;
}

// ============================================================
// Search Types
// ============================================================

/**
 * Structure search result
 */
export interface StructureSearchResult {
  id: string;
  document_id: string;
  collection_id?: string;
  structure_type: StructureType;
  title?: string;
  description?: string;
  headers?: string[];
  rows?: (string | number | boolean | null)[][];
  row_count: number;
  column_count: number;
  metadata?: Record<string, unknown>;
  similarity: number;
  created_at: string;
}

/**
 * Cell search result
 */
export interface CellSearchResult {
  id: string;
  structure_id: string;
  row_index: number;
  col_index?: number;
  cell_key?: string;
  cell_value: string;
  data_type: CellDataType;
  similarity: number;
  structure_title?: string;
  structure_type: StructureType;
}

/**
 * Options for structure search
 */
export interface StructureSearchOptions {
  collectionId?: string;
  structureType?: StructureType;
  limit?: number;
  similarityThreshold?: number;
}

/**
 * Options for cell search
 */
export interface CellSearchOptions {
  structureId?: string;
  dataType?: CellDataType;
  limit?: number;
  similarityThreshold?: number;
}

// ============================================================
// API Types
// ============================================================

/**
 * Extract API request body
 */
export interface ExtractRequest {
  document_id: string;
  content: string;
  collection_id?: string;
  options?: ExtractionOptions;
}

/**
 * Extract API response
 */
export interface ExtractResponse {
  success: boolean;
  structures_created: number;
  cells_created: number;
  duration_ms: number;
  structures: {
    id: string;
    type: StructureType;
    title?: string;
    row_count: number;
    column_count: number;
  }[];
}

/**
 * Structure search API request
 */
export interface StructureSearchRequest {
  query: string;
  collection_id?: string;
  structure_type?: StructureType;
  limit?: number;
  similarity_threshold?: number;
}

/**
 * Cell search API request
 */
export interface CellSearchRequest {
  query: string;
  structure_id?: string;
  data_type?: CellDataType;
  limit?: number;
  similarity_threshold?: number;
}

// ============================================================
// Utility Types
// ============================================================

/**
 * Structure with all cells loaded
 */
export interface StructureWithCells {
  structure: DocumentStructure;
  cells: StructureCell[];
}

/**
 * Batch insert result
 */
export interface BatchInsertResult {
  structuresInserted: number;
  cellsInserted: number;
  errors: { index: number; error: string }[];
}
