/**
 * Reversible Context Compression (RCC)
 *
 * Compresses context to reduce cost/latency while maintaining
 * pointer maps that allow reversing to original text for evidence.
 */

// Types
export type {
  PointerMap,
  CompressedChunk,
  CompressionResult,
  CompressionStats,
  CompressionOptions,
  ChunkInput,
  ExpansionRequest,
  ExpansionResult,
  AnalyzedSentence,
  SentenceInclusionReason,
  CompressionPipelineConfig,
  CompressionTraceStats,
} from './types';

// Compressor
export {
  compressContext,
  compressChunk,
  extractRelevantSentences,
} from './compressor';

// Pointer Mapper
export {
  createPointerMaps,
  findPointersAtPosition,
  findPointerBySentenceIndex,
  getCompressedRange,
  getOriginalRange,
  validatePointers,
  mergeAdjacentPointers,
  createReversePointerMap,
  calculateCoverage,
} from './pointer-mapper';

// Decompressor
export {
  expandToOriginal,
  expandSentences,
  expandSentence,
  getContextAroundSentence,
  createAnnotatedCompressedText,
  validateCompressedChunk,
  reconstructWithExpansions,
  getDroppedContent,
} from './decompressor';
