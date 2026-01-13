/**
 * Reversible Context Compression (RCC) Types
 *
 * Compresses context to reduce cost/latency while maintaining
 * pointer maps that allow reversing to original text for evidence.
 */

/**
 * Pointer map connecting compressed text positions to original text
 */
export interface PointerMap {
  /** Start position in compressed text */
  compressed_start: number;
  /** End position in compressed text */
  compressed_end: number;
  /** Start position in original text */
  original_start: number;
  /** End position in original text */
  original_end: number;
  /** Index of the sentence in the original document */
  sentence_index: number;
}

/**
 * A compressed chunk with reversible pointers
 */
export interface CompressedChunk {
  /** Unique identifier for this chunk */
  chunk_id: string;
  /** Original uncompressed text */
  original_text: string;
  /** Compressed text (reduced version) */
  compressed_text: string;
  /** Compression ratio (compressed_length / original_length) */
  compression_ratio: number;
  /** Pointer maps for reversing compression */
  pointers: PointerMap[];
  /** Token counts for cost estimation */
  tokens?: {
    original: number;
    compressed: number;
  };
}

/**
 * Result of compressing multiple chunks
 */
export interface CompressionResult {
  /** Compressed chunks */
  chunks: CompressedChunk[];
  /** Total tokens in original text */
  total_original_tokens: number;
  /** Total tokens in compressed text */
  total_compressed_tokens: number;
  /** Overall compression ratio */
  overall_ratio: number;
  /** Compression statistics */
  stats?: CompressionStats;
}

/**
 * Statistics about the compression process
 */
export interface CompressionStats {
  /** Number of sentences extracted */
  sentences_extracted: number;
  /** Number of sentences dropped */
  sentences_dropped: number;
  /** Extraction reasons breakdown */
  extraction_reasons: {
    keyword_match: number;
    numeric_data: number;
    first_last_sentence: number;
    semantic_relevance: number;
  };
  /** Processing time in milliseconds */
  processing_time_ms: number;
}

/**
 * Options for compression
 */
export interface CompressionOptions {
  /** Target compression ratio (0.0-1.0, lower = more compression) */
  target_ratio?: number;
  /** Minimum sentences to keep per chunk */
  min_sentences?: number;
  /** Maximum sentences to keep per chunk */
  max_sentences?: number;
  /** Include first sentence always (often contains summary) */
  include_first?: boolean;
  /** Include last sentence always (often contains conclusion) */
  include_last?: boolean;
  /** Keywords to prioritize (in addition to query keywords) */
  priority_keywords?: string[];
  /** Enable semantic similarity scoring (requires embeddings) */
  semantic_scoring?: boolean;
}

/**
 * Input chunk for compression
 */
export interface ChunkInput {
  /** Chunk identifier */
  chunk_id: string;
  /** Text content */
  text: string;
  /** Document ID this chunk belongs to */
  document_id?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Expansion request for decompression
 */
export interface ExpansionRequest {
  /** Compressed chunk to expand */
  compressed: CompressedChunk;
  /** Optional: specific pointer indices to expand (if not provided, expands all) */
  pointer_indices?: number[];
}

/**
 * Result of expanding compressed text
 */
export interface ExpansionResult {
  /** Expanded text (full or partial) */
  expanded_text: string;
  /** Indices of pointers that were expanded */
  expanded_indices: number[];
  /** Whether full expansion was performed */
  is_full_expansion: boolean;
}

/**
 * Sentence with metadata for compression analysis
 */
export interface AnalyzedSentence {
  /** Sentence index in document */
  index: number;
  /** Sentence text */
  text: string;
  /** Start position in original document */
  start: number;
  /** End position in original document */
  end: number;
  /** Relevance score (0-1) */
  relevance_score: number;
  /** Reasons for inclusion */
  inclusion_reasons: SentenceInclusionReason[];
  /** Whether to include in compressed output */
  include: boolean;
}

/**
 * Reasons why a sentence is included in compressed output
 */
export type SentenceInclusionReason =
  | 'keyword_match'
  | 'numeric_data'
  | 'date_reference'
  | 'first_sentence'
  | 'last_sentence'
  | 'high_semantic_relevance'
  | 'named_entity'
  | 'definition'
  | 'fact_statement';

/**
 * Configuration for the compression pipeline
 */
export interface CompressionPipelineConfig {
  /** Enable compression */
  enabled: boolean;
  /** Target compression ratio */
  target_ratio: number;
  /** Enable semantic scoring */
  semantic_scoring?: boolean;
  /** Additional options */
  options?: CompressionOptions;
}

/**
 * Compression statistics for trace/logging
 */
export interface CompressionTraceStats {
  /** Number of chunks compressed */
  chunks_compressed: number;
  /** Original token count */
  original_tokens: number;
  /** Compressed token count */
  compressed_tokens: number;
  /** Achieved compression ratio */
  ratio: number;
  /** Processing time in ms */
  time_ms: number;
}
