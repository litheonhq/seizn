/**
 * Reversible Context Compression (RCC) - Pointer Mapper
 *
 * Creates and manages pointer maps that connect compressed text
 * positions back to original text positions for evidence tracking.
 */

import type { PointerMap, AnalyzedSentence } from './types';

/**
 * Create pointer maps from analyzed sentences
 * Maps each included sentence's position in compressed text to original text
 */
export function createPointerMaps(
  includedSentences: AnalyzedSentence[],
  compressedText: string
): PointerMap[] {
  const pointers: PointerMap[] = [];
  let compressedOffset = 0;

  for (const sentence of includedSentences) {
    // Find the sentence in compressed text
    // Account for potential space joining between sentences
    const searchStart = compressedOffset;
    const sentenceInCompressed = compressedText.indexOf(sentence.text, searchStart);

    if (sentenceInCompressed === -1) {
      // Sentence not found - this shouldn't happen, but handle gracefully
      console.warn(`Sentence not found in compressed text: "${sentence.text.substring(0, 50)}..."`);
      continue;
    }

    const compressedStart = sentenceInCompressed;
    const compressedEnd = compressedStart + sentence.text.length;

    pointers.push({
      compressed_start: compressedStart,
      compressed_end: compressedEnd,
      original_start: sentence.start,
      original_end: sentence.end,
      sentence_index: sentence.index,
    });

    // Update offset for next search
    compressedOffset = compressedEnd;
  }

  return pointers;
}

/**
 * Find which pointer(s) a compressed text position falls within
 */
export function findPointersAtPosition(
  pointers: PointerMap[],
  compressedPosition: number
): PointerMap[] {
  return pointers.filter(
    p => compressedPosition >= p.compressed_start && compressedPosition < p.compressed_end
  );
}

/**
 * Find the pointer for a specific sentence index
 */
export function findPointerBySentenceIndex(
  pointers: PointerMap[],
  sentenceIndex: number
): PointerMap | undefined {
  return pointers.find(p => p.sentence_index === sentenceIndex);
}

/**
 * Get the compressed text range for a sentence
 */
export function getCompressedRange(
  pointer: PointerMap,
  compressedText: string
): string {
  return compressedText.substring(pointer.compressed_start, pointer.compressed_end);
}

/**
 * Get the original text range for a sentence
 */
export function getOriginalRange(
  pointer: PointerMap,
  originalText: string
): string {
  return originalText.substring(pointer.original_start, pointer.original_end);
}

/**
 * Validate that pointers correctly map between compressed and original text
 */
export function validatePointers(
  pointers: PointerMap[],
  compressedText: string,
  originalText: string
): {
  valid: boolean;
  errors: Array<{
    pointer: PointerMap;
    error: string;
    expected?: string;
    actual?: string;
  }>;
} {
  const errors: Array<{
    pointer: PointerMap;
    error: string;
    expected?: string;
    actual?: string;
  }> = [];

  for (const pointer of pointers) {
    // Check bounds
    if (pointer.compressed_start < 0 || pointer.compressed_end > compressedText.length) {
      errors.push({
        pointer,
        error: 'Compressed text bounds out of range',
      });
      continue;
    }

    if (pointer.original_start < 0 || pointer.original_end > originalText.length) {
      errors.push({
        pointer,
        error: 'Original text bounds out of range',
      });
      continue;
    }

    // Extract text from both positions
    const compressedPart = compressedText.substring(
      pointer.compressed_start,
      pointer.compressed_end
    );
    const originalPart = originalText.substring(
      pointer.original_start,
      pointer.original_end
    );

    // The compressed part should match the original part (they're the same sentence)
    // Account for potential whitespace trimming
    if (compressedPart.trim() !== originalPart.trim()) {
      errors.push({
        pointer,
        error: 'Text mismatch between compressed and original',
        expected: originalPart.trim().substring(0, 100),
        actual: compressedPart.trim().substring(0, 100),
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Merge adjacent pointers for display optimization
 * Useful when multiple consecutive sentences are included
 */
export function mergeAdjacentPointers(pointers: PointerMap[]): PointerMap[] {
  if (pointers.length <= 1) {
    return pointers;
  }

  // Sort by sentence index
  const sorted = [...pointers].sort((a, b) => a.sentence_index - b.sentence_index);

  const merged: PointerMap[] = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];

    // Check if sentences are adjacent
    if (next.sentence_index === current.sentence_index + 1) {
      // Merge: extend current to include next
      current.compressed_end = next.compressed_end;
      current.original_end = next.original_end;
      // Note: sentence_index keeps the first sentence's index
    } else {
      // Not adjacent: push current and start new
      merged.push(current);
      current = { ...next };
    }
  }

  // Push the last one
  merged.push(current);

  return merged;
}

/**
 * Create a reverse mapping from original positions to compressed positions
 * Useful for highlighting original text based on compressed selection
 */
export function createReversePointerMap(
  pointers: PointerMap[]
): Map<number, { compressedStart: number; compressedEnd: number }> {
  const reverseMap = new Map<number, { compressedStart: number; compressedEnd: number }>();

  for (const pointer of pointers) {
    reverseMap.set(pointer.sentence_index, {
      compressedStart: pointer.compressed_start,
      compressedEnd: pointer.compressed_end,
    });
  }

  return reverseMap;
}

/**
 * Calculate coverage statistics for pointers
 */
export function calculateCoverage(
  pointers: PointerMap[],
  originalTextLength: number
): {
  totalOriginalCovered: number;
  coveragePercentage: number;
  gaps: Array<{ start: number; end: number }>;
} {
  // Sort pointers by original position
  const sorted = [...pointers].sort((a, b) => a.original_start - b.original_start);

  let totalCovered = 0;
  const gaps: Array<{ start: number; end: number }> = [];
  let lastEnd = 0;

  for (const pointer of sorted) {
    // Check for gap before this pointer
    if (pointer.original_start > lastEnd) {
      gaps.push({ start: lastEnd, end: pointer.original_start });
    }

    totalCovered += pointer.original_end - pointer.original_start;
    lastEnd = Math.max(lastEnd, pointer.original_end);
  }

  // Check for gap at the end
  if (lastEnd < originalTextLength) {
    gaps.push({ start: lastEnd, end: originalTextLength });
  }

  return {
    totalOriginalCovered: totalCovered,
    coveragePercentage: (totalCovered / Math.max(1, originalTextLength)) * 100,
    gaps,
  };
}
