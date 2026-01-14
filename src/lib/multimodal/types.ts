/**
 * Seizn Multimodal - Layout-Preserving Document Processing Types
 *
 * C2: Multimodal + Layout-Preserving Retrieval
 *
 * Supports structured extraction of:
 * - Text blocks with bounding boxes
 * - Tables with cell structure
 * - Figures and captions
 * - Headings and lists
 * - Code blocks
 */

export type BlockType = 'text' | 'table' | 'figure' | 'heading' | 'list' | 'code' | 'caption';

/**
 * Bounding box coordinates for layout preservation
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A single block extracted from a document
 */
export interface DocumentBlock {
  /** Unique block identifier */
  id: string;
  /** Parent document ID */
  documentId: string;
  /** Type of content block */
  blockType: BlockType;
  /** Page number (1-indexed) */
  pageNumber: number;
  /** Bounding box coordinates (if available) */
  bbox?: BoundingBox;
  /** Plain text content */
  content: string;
  /** HTML representation (for tables, formatted text) */
  contentHtml?: string;
  /** Embedding vector (filled after embedding generation) */
  embedding?: number[];
  /** Block-specific metadata */
  metadata: Record<string, unknown>;
  /** Order within the document */
  orderIndex?: number;
  /** Parent block ID (for nested structures like list items) */
  parentBlockId?: string;
}

/**
 * A fully parsed document with extracted blocks
 */
export interface ParsedDocument {
  /** Document ID */
  id: string;
  /** Original filename */
  filename: string;
  /** MIME type of the source document */
  mimeType: string;
  /** Total page count */
  pageCount: number;
  /** Extracted blocks */
  blocks: DocumentBlock[];
  /** Document-level metadata */
  metadata: Record<string, unknown>;
  /** ISO timestamp when parsed */
  parsedAt: string;
}

/**
 * A single cell in a parsed table
 */
export interface TableCell {
  /** Row index (0-indexed) */
  row: number;
  /** Column index (0-indexed) */
  col: number;
  /** Number of rows this cell spans */
  rowSpan?: number;
  /** Number of columns this cell spans */
  colSpan?: number;
  /** Cell text content */
  content: string;
  /** Whether this cell is a header cell */
  isHeader: boolean;
}

/**
 * A fully parsed table structure
 */
export interface ParsedTable {
  /** Total number of rows */
  rows: number;
  /** Total number of columns */
  cols: number;
  /** All cells in the table */
  cells: TableCell[];
  /** HTML representation */
  html: string;
  /** CSV representation */
  csv: string;
}

/**
 * Highlight span within a block (for search results)
 */
export interface HighlightSpan {
  /** Block ID containing the highlight */
  blockId: string;
  /** Character offset spans [start, end] */
  spans: [number, number][];
}

/**
 * Multimodal search result
 */
export interface MultimodalSearchResult {
  /** Matching blocks */
  blocks: DocumentBlock[];
  /** Relevance score (0-1) */
  score: number;
  /** Highlighted spans for each block */
  highlights: HighlightSpan[];
}

/**
 * Options for parsing documents
 */
export interface ParseOptions {
  /** Extract tables */
  extractTables?: boolean;
  /** Extract figures/images */
  extractFigures?: boolean;
  /** Detect code blocks */
  detectCode?: boolean;
  /** Minimum confidence for block classification */
  confidenceThreshold?: number;
  /** Maximum pages to process (for large documents) */
  maxPages?: number;
}

/**
 * Options for multimodal search
 */
export interface MultimodalSearchOptions {
  /** Number of results to return */
  topK?: number;
  /** Block types to include (default: all) */
  blockTypes?: BlockType[];
  /** Weights for different block types (default: equal) */
  blockTypeWeights?: Partial<Record<BlockType, number>>;
  /** Include surrounding context blocks */
  includeContext?: boolean;
  /** Number of context blocks before/after */
  contextWindow?: number;
  /** Minimum similarity threshold */
  threshold?: number;
  /** Page range filter */
  pageRange?: { start?: number; end?: number };
}

/**
 * Block store query options
 */
export interface BlockQueryOptions {
  /** Filter by document ID */
  documentId?: string;
  /** Filter by block types */
  blockTypes?: BlockType[];
  /** Filter by page range */
  pageRange?: { start?: number; end?: number };
  /** Pagination limit */
  limit?: number;
  /** Pagination offset */
  offset?: number;
  /** Order by field */
  orderBy?: 'orderIndex' | 'pageNumber' | 'createdAt';
  /** Order direction */
  orderDirection?: 'asc' | 'desc';
}

/**
 * Result of storing blocks
 */
export interface BlockStoreResult {
  /** Number of blocks stored */
  storedCount: number;
  /** Document ID */
  documentId: string;
  /** Block IDs created */
  blockIds: string[];
}

/**
 * Context expansion result
 */
export interface ExpandedContext {
  /** The matched block */
  matchedBlock: DocumentBlock;
  /** Blocks before the match */
  beforeBlocks: DocumentBlock[];
  /** Blocks after the match */
  afterBlocks: DocumentBlock[];
}
