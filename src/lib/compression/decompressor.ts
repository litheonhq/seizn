/**
 * Reversible Context Compression (RCC) - Decompressor
 *
 * Restores original text from compressed chunks using pointer maps.
 * Supports full restoration and selective sentence expansion.
 */

import type {
  CompressedChunk,
  ExpansionResult,
} from './types';
import {
  findPointerBySentenceIndex,
  getOriginalRange,
  validatePointers,
} from './pointer-mapper';

/**
 * Expand compressed chunk to full original text
 */
export function expandToOriginal(compressed: CompressedChunk): ExpansionResult {
  return {
    expanded_text: compressed.original_text,
    expanded_indices: compressed.pointers.map((_, i) => i),
    is_full_expansion: true,
  };
}

/**
 * Expand only specific sentences (by pointer indices)
 */
export function expandSentences(
  compressed: CompressedChunk,
  pointerIndices: number[]
): ExpansionResult {
  if (pointerIndices.length === 0) {
    return {
      expanded_text: compressed.compressed_text,
      expanded_indices: [],
      is_full_expansion: false,
    };
  }

  // Validate indices
  const validIndices = pointerIndices.filter(
    i => i >= 0 && i < compressed.pointers.length
  );

  if (validIndices.length === 0) {
    return {
      expanded_text: compressed.compressed_text,
      expanded_indices: [],
      is_full_expansion: false,
    };
  }

  // Get the pointers for requested indices
  const selectedPointers = validIndices.map(i => compressed.pointers[i]);

  // Extract original text for each selected pointer
  const expandedParts = selectedPointers.map(pointer =>
    compressed.original_text.substring(pointer.original_start, pointer.original_end)
  );

  // Join with space (preserving original order by sentence index)
  const sortedParts = selectedPointers
    .map((pointer, i) => ({ pointer, text: expandedParts[i] }))
    .sort((a, b) => a.pointer.sentence_index - b.pointer.sentence_index)
    .map(item => item.text);

  return {
    expanded_text: sortedParts.join(' '),
    expanded_indices: validIndices,
    is_full_expansion: validIndices.length === compressed.pointers.length,
  };
}

/**
 * Expand a single sentence by its index in the original document
 */
export function expandSentence(
  compressed: CompressedChunk,
  sentenceIndex: number
): string | null {
  const pointer = findPointerBySentenceIndex(compressed.pointers, sentenceIndex);

  if (!pointer) {
    return null;
  }

  return getOriginalRange(pointer, compressed.original_text);
}

/**
 * Get surrounding context for a sentence
 * Useful for showing context around an expanded sentence
 */
export function getContextAroundSentence(
  compressed: CompressedChunk,
  sentenceIndex: number,
  contextSentences: number = 1
): {
  before: string[];
  target: string | null;
  after: string[];
} {
  const pointer = findPointerBySentenceIndex(compressed.pointers, sentenceIndex);

  if (!pointer) {
    return { before: [], target: null, after: [] };
  }

  // Find sentences before and after in the original text
  // This requires re-parsing the original text or using stored sentence boundaries
  const allSentenceIndices = compressed.pointers.map(p => p.sentence_index).sort((a, b) => a - b);
  const currentPos = allSentenceIndices.indexOf(sentenceIndex);

  const before: string[] = [];
  const after: string[] = [];

  // Get context before
  for (let i = 1; i <= contextSentences; i++) {
    const prevIndex = currentPos - i;
    if (prevIndex >= 0) {
      const prevSentenceIndex = allSentenceIndices[prevIndex];
      const prevPointer = findPointerBySentenceIndex(compressed.pointers, prevSentenceIndex);
      if (prevPointer) {
        before.unshift(getOriginalRange(prevPointer, compressed.original_text));
      }
    }
  }

  // Get context after
  for (let i = 1; i <= contextSentences; i++) {
    const nextIndex = currentPos + i;
    if (nextIndex < allSentenceIndices.length) {
      const nextSentenceIndex = allSentenceIndices[nextIndex];
      const nextPointer = findPointerBySentenceIndex(compressed.pointers, nextSentenceIndex);
      if (nextPointer) {
        after.push(getOriginalRange(nextPointer, compressed.original_text));
      }
    }
  }

  return {
    before,
    target: getOriginalRange(pointer, compressed.original_text),
    after,
  };
}

/**
 * Create an annotated version of compressed text with expansion markers
 * Useful for UI rendering
 */
export function createAnnotatedCompressedText(
  compressed: CompressedChunk
): Array<{
  text: string;
  isExpandable: boolean;
  pointerIndex: number | null;
  sentenceIndex: number | null;
  originalText: string | null;
}> {
  const result: Array<{
    text: string;
    isExpandable: boolean;
    pointerIndex: number | null;
    sentenceIndex: number | null;
    originalText: string | null;
  }> = [];

  let lastEnd = 0;

  // Sort pointers by compressed position
  const sortedPointers = compressed.pointers
    .map((p, i) => ({ pointer: p, index: i }))
    .sort((a, b) => a.pointer.compressed_start - b.pointer.compressed_start);

  for (const { pointer, index } of sortedPointers) {
    // Add any text before this pointer (should be minimal, just spaces)
    if (pointer.compressed_start > lastEnd) {
      const betweenText = compressed.compressed_text.substring(lastEnd, pointer.compressed_start);
      if (betweenText.trim().length > 0) {
        result.push({
          text: betweenText,
          isExpandable: false,
          pointerIndex: null,
          sentenceIndex: null,
          originalText: null,
        });
      }
    }

    // Add the expandable sentence
    const sentenceText = compressed.compressed_text.substring(
      pointer.compressed_start,
      pointer.compressed_end
    );

    result.push({
      text: sentenceText,
      isExpandable: true,
      pointerIndex: index,
      sentenceIndex: pointer.sentence_index,
      originalText: compressed.original_text.substring(
        pointer.original_start,
        pointer.original_end
      ),
    });

    lastEnd = pointer.compressed_end;
  }

  // Add any remaining text
  if (lastEnd < compressed.compressed_text.length) {
    const remainingText = compressed.compressed_text.substring(lastEnd);
    if (remainingText.trim().length > 0) {
      result.push({
        text: remainingText,
        isExpandable: false,
        pointerIndex: null,
        sentenceIndex: null,
        originalText: null,
      });
    }
  }

  return result;
}

/**
 * Validate compressed chunk integrity
 */
export function validateCompressedChunk(compressed: CompressedChunk): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check basic properties
  if (!compressed.chunk_id) {
    issues.push('Missing chunk_id');
  }

  if (!compressed.original_text) {
    issues.push('Missing original_text');
  }

  if (!compressed.compressed_text) {
    issues.push('Missing compressed_text');
  }

  if (!compressed.pointers || compressed.pointers.length === 0) {
    issues.push('Missing or empty pointers array');
  }

  // Check compression ratio
  if (compressed.compression_ratio < 0 || compressed.compression_ratio > 1) {
    issues.push(`Invalid compression_ratio: ${compressed.compression_ratio}`);
  }

  // Validate pointers
  if (compressed.pointers && compressed.original_text && compressed.compressed_text) {
    const validation = validatePointers(
      compressed.pointers,
      compressed.compressed_text,
      compressed.original_text
    );

    if (!validation.valid) {
      for (const error of validation.errors) {
        issues.push(`Pointer error at sentence ${error.pointer.sentence_index}: ${error.error}`);
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Reconstruct a version with specific sentences expanded inline
 * Shows compressed text with selected sentences replaced by their full original
 */
export function reconstructWithExpansions(
  compressed: CompressedChunk,
  expandedSentenceIndices: number[]
): string {
  const annotated = createAnnotatedCompressedText(compressed);

  return annotated
    .map(segment => {
      if (
        segment.isExpandable &&
        segment.sentenceIndex !== null &&
        expandedSentenceIndices.includes(segment.sentenceIndex) &&
        segment.originalText
      ) {
        // Use the original text for expanded sentences
        return segment.originalText;
      }
      return segment.text;
    })
    .join('');
}

/**
 * Get gaps in the compressed text (parts of original that were dropped)
 * Useful for showing what was removed
 */
export function getDroppedContent(compressed: CompressedChunk): Array<{
  start: number;
  end: number;
  text: string;
}> {
  const dropped: Array<{ start: number; end: number; text: string }> = [];

  // Sort pointers by original position
  const sortedPointers = [...compressed.pointers].sort(
    (a, b) => a.original_start - b.original_start
  );

  let lastEnd = 0;

  for (const pointer of sortedPointers) {
    if (pointer.original_start > lastEnd) {
      const gapText = compressed.original_text.substring(lastEnd, pointer.original_start).trim();
      if (gapText.length > 0) {
        dropped.push({
          start: lastEnd,
          end: pointer.original_start,
          text: gapText,
        });
      }
    }
    lastEnd = pointer.original_end;
  }

  // Check for dropped content at the end
  if (lastEnd < compressed.original_text.length) {
    const endGapText = compressed.original_text.substring(lastEnd).trim();
    if (endGapText.length > 0) {
      dropped.push({
        start: lastEnd,
        end: compressed.original_text.length,
        text: endGapText,
      });
    }
  }

  return dropped;
}
