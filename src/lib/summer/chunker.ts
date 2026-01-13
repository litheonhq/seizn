/**
 * Seizn Summer - Document Chunker
 *
 * Multiple chunking strategies for document processing:
 * - sliding_window: Fixed size chunks with overlap
 * - sentence: Split by sentences, pack into chunks
 * - paragraph: Split by paragraphs
 * - semantic: Semantic-aware chunking with boundary detection
 */

import { estimateTokens } from './utils/tokens';
import type { ChunkingStrategy, IndexingOptions, ProcessedChunk } from './types';

// ============================================
// Constants
// ============================================

const DEFAULT_CHUNK_SIZE = 512; // tokens
const DEFAULT_CHUNK_OVERLAP = 64; // tokens
const CHARS_PER_TOKEN_ESTIMATE = 4; // rough estimate for English

// Sentence boundary regex (handles common abbreviations)
const SENTENCE_BOUNDARY_REGEX = /(?<=[.!?])\s+(?=[A-Z\uAC00-\uD7AF])/g;

// Paragraph boundary regex (double newlines or more)
const PARAGRAPH_BOUNDARY_REGEX = /\n\s*\n/g;

// Semantic boundary markers (headers, lists, code blocks)
const SEMANTIC_MARKERS = [
  /^#{1,6}\s+/m, // Markdown headers
  /^[-*+]\s+/m, // List items
  /^```/m, // Code blocks
  /^---+$/m, // Horizontal rules
  /^\d+\.\s+/m, // Numbered lists
];

// ============================================
// Main Chunking Function
// ============================================

/**
 * Chunk a document using the specified strategy
 */
export function chunkDocument(
  content: string,
  options: IndexingOptions = {}
): ProcessedChunk[] {
  const strategy = options.chunking_strategy ?? 'sliding_window';
  const chunkSize = options.chunk_size ?? DEFAULT_CHUNK_SIZE;
  const chunkOverlap = options.chunk_overlap ?? DEFAULT_CHUNK_OVERLAP;

  // Normalize content
  const normalizedContent = normalizeContent(content);
  if (!normalizedContent) return [];

  switch (strategy) {
    case 'sliding_window':
      return chunkBySlidingWindow(normalizedContent, chunkSize, chunkOverlap);
    case 'sentence':
      return chunkBySentence(normalizedContent, chunkSize, chunkOverlap);
    case 'paragraph':
      return chunkByParagraph(normalizedContent, chunkSize, chunkOverlap);
    case 'semantic':
      return chunkBySemantic(normalizedContent, chunkSize, chunkOverlap);
    default:
      // Fallback to sliding window for unknown strategies
      return chunkBySlidingWindow(normalizedContent, chunkSize, chunkOverlap);
  }
}

// ============================================
// Sliding Window Chunking
// ============================================

/**
 * Fixed-size chunks with configurable overlap
 * Best for: General text, when structure is unknown
 */
function chunkBySlidingWindow(
  content: string,
  maxTokens: number,
  overlapTokens: number
): ProcessedChunk[] {
  const chunks: ProcessedChunk[] = [];
  const targetChars = maxTokens * CHARS_PER_TOKEN_ESTIMATE;
  const overlapChars = overlapTokens * CHARS_PER_TOKEN_ESTIMATE;

  let startOffset = 0;
  let index = 0;

  while (startOffset < content.length) {
    // Calculate end position
    let endOffset = Math.min(startOffset + targetChars, content.length);

    // Try to break at word boundary if not at end
    if (endOffset < content.length) {
      const breakPoint = findWordBreak(content, endOffset, targetChars);
      if (breakPoint > startOffset) {
        endOffset = breakPoint;
      }
    }

    const chunkContent = content.slice(startOffset, endOffset).trim();
    if (chunkContent) {
      chunks.push({
        index,
        content: chunkContent,
        token_count: estimateTokens(chunkContent),
        start_offset: startOffset,
        end_offset: endOffset,
      });
      index++;
    }

    // Move start position, accounting for overlap
    if (endOffset >= content.length) break;
    startOffset = Math.max(startOffset + 1, endOffset - overlapChars);
  }

  return chunks;
}

// ============================================
// Sentence-based Chunking
// ============================================

/**
 * Split by sentences, then pack into chunks
 * Best for: Prose, articles, documentation
 */
function chunkBySentence(
  content: string,
  maxTokens: number,
  overlapTokens: number
): ProcessedChunk[] {
  const sentences = splitBySentences(content);
  return packUnitsIntoChunks(sentences, content, maxTokens, overlapTokens);
}

/**
 * Split content into sentences while preserving offsets
 */
function splitBySentences(content: string): Array<{ text: string; start: number; end: number }> {
  const sentences: Array<{ text: string; start: number; end: number }> = [];
  let lastEnd = 0;

  // Find sentence boundaries
  const matches = content.matchAll(SENTENCE_BOUNDARY_REGEX);
  for (const match of matches) {
    if (match.index !== undefined) {
      const text = content.slice(lastEnd, match.index).trim();
      if (text) {
        sentences.push({
          text,
          start: lastEnd,
          end: match.index,
        });
      }
      lastEnd = match.index;
    }
  }

  // Add remaining content as last sentence
  const remaining = content.slice(lastEnd).trim();
  if (remaining) {
    sentences.push({
      text: remaining,
      start: lastEnd,
      end: content.length,
    });
  }

  // If no sentences were found (no sentence boundaries), treat entire content as one unit
  if (sentences.length === 0 && content.trim()) {
    sentences.push({
      text: content.trim(),
      start: 0,
      end: content.length,
    });
  }

  return sentences;
}

// ============================================
// Paragraph-based Chunking
// ============================================

/**
 * Split by paragraphs, then pack into chunks
 * Best for: Structured documents, markdown
 */
function chunkByParagraph(
  content: string,
  maxTokens: number,
  overlapTokens: number
): ProcessedChunk[] {
  const paragraphs = splitByParagraphs(content);
  return packUnitsIntoChunks(paragraphs, content, maxTokens, overlapTokens);
}

/**
 * Split content into paragraphs while preserving offsets
 */
function splitByParagraphs(content: string): Array<{ text: string; start: number; end: number }> {
  const paragraphs: Array<{ text: string; start: number; end: number }> = [];
  const parts = content.split(PARAGRAPH_BOUNDARY_REGEX);
  let currentOffset = 0;

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed) {
      // Find actual position in content
      const startPos = content.indexOf(trimmed, currentOffset);
      const start = startPos >= 0 ? startPos : currentOffset;
      const end = start + trimmed.length;

      paragraphs.push({
        text: trimmed,
        start,
        end,
      });
      currentOffset = end;
    }
  }

  return paragraphs;
}

// ============================================
// Semantic Chunking
// ============================================

/**
 * Semantic-aware chunking that respects document structure
 * Best for: Markdown, code, technical documents
 */
function chunkBySemantic(
  content: string,
  maxTokens: number,
  overlapTokens: number
): ProcessedChunk[] {
  const sections = splitBySemanticBoundaries(content);
  return packUnitsIntoChunks(sections, content, maxTokens, overlapTokens);
}

/**
 * Split by semantic boundaries (headers, code blocks, lists)
 */
function splitBySemanticBoundaries(
  content: string
): Array<{ text: string; start: number; end: number }> {
  const sections: Array<{ text: string; start: number; end: number }> = [];
  const lines = content.split('\n');

  let currentSection: string[] = [];
  let sectionStart = 0;
  let currentOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isSemanticBoundary = SEMANTIC_MARKERS.some((marker) => marker.test(line));

    // Check if this line starts a new section
    if (isSemanticBoundary && currentSection.length > 0) {
      // Save current section
      const text = currentSection.join('\n').trim();
      if (text) {
        sections.push({
          text,
          start: sectionStart,
          end: currentOffset,
        });
      }
      currentSection = [];
      sectionStart = currentOffset;
    }

    currentSection.push(line);
    currentOffset += line.length + 1; // +1 for newline
  }

  // Add final section
  if (currentSection.length > 0) {
    const text = currentSection.join('\n').trim();
    if (text) {
      sections.push({
        text,
        start: sectionStart,
        end: content.length,
      });
    }
  }

  // Fallback to paragraph splitting if no semantic boundaries found
  if (sections.length === 0) {
    return splitByParagraphs(content);
  }

  return sections;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Normalize content for consistent processing
 */
function normalizeContent(content: string): string {
  return content
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\t/g, '  ') // Convert tabs to spaces
    .trim();
}

/**
 * Find a word break near the target position
 */
function findWordBreak(content: string, targetPos: number, maxChars: number): number {
  // Search backwards for whitespace
  const searchStart = Math.max(targetPos - Math.floor(maxChars * 0.1), 0);
  for (let i = targetPos; i >= searchStart; i--) {
    if (/\s/.test(content[i])) {
      return i + 1;
    }
  }
  // No good break found, return target
  return targetPos;
}

/**
 * Pack text units (sentences/paragraphs) into chunks with overlap
 */
function packUnitsIntoChunks(
  units: Array<{ text: string; start: number; end: number }>,
  originalContent: string,
  maxTokens: number,
  overlapTokens: number
): ProcessedChunk[] {
  if (units.length === 0) return [];

  const chunks: ProcessedChunk[] = [];
  let currentUnits: Array<{ text: string; start: number; end: number }> = [];
  let currentTokens = 0;
  let index = 0;

  const finalizeChunk = () => {
    if (currentUnits.length === 0) return;

    const chunkContent = currentUnits.map((u) => u.text).join('\n\n');
    const startOffset = currentUnits[0].start;
    const endOffset = currentUnits[currentUnits.length - 1].end;

    chunks.push({
      index,
      content: chunkContent,
      token_count: estimateTokens(chunkContent),
      start_offset: startOffset,
      end_offset: endOffset,
    });
    index++;

    // Keep units for overlap
    if (overlapTokens > 0) {
      const overlapUnits: typeof currentUnits = [];
      let overlapTotalTokens = 0;

      for (let i = currentUnits.length - 1; i >= 0; i--) {
        const unitTokens = estimateTokens(currentUnits[i].text);
        if (overlapTotalTokens + unitTokens > overlapTokens && overlapUnits.length > 0) {
          break;
        }
        overlapUnits.unshift(currentUnits[i]);
        overlapTotalTokens += unitTokens;
      }

      currentUnits = overlapUnits;
      currentTokens = overlapTotalTokens;
    } else {
      currentUnits = [];
      currentTokens = 0;
    }
  };

  for (const unit of units) {
    const unitTokens = estimateTokens(unit.text);

    // If a single unit exceeds max tokens, split it with sliding window
    if (unitTokens > maxTokens) {
      finalizeChunk();

      // Use sliding window for oversized unit
      const subChunks = chunkBySlidingWindow(unit.text, maxTokens, overlapTokens);
      for (const subChunk of subChunks) {
        chunks.push({
          ...subChunk,
          index,
          start_offset: unit.start + subChunk.start_offset,
          end_offset: unit.start + subChunk.end_offset,
        });
        index++;
      }
      continue;
    }

    // Check if adding this unit would exceed limit
    if (currentTokens + unitTokens > maxTokens && currentUnits.length > 0) {
      finalizeChunk();
    }

    currentUnits.push(unit);
    currentTokens += unitTokens;
  }

  // Finalize remaining content
  finalizeChunk();

  return chunks;
}

// ============================================
// Exports
// ============================================

export {
  DEFAULT_CHUNK_SIZE,
  DEFAULT_CHUNK_OVERLAP,
  chunkBySlidingWindow,
  chunkBySentence,
  chunkByParagraph,
  chunkBySemantic,
  normalizeContent,
  estimateTokens,
};
