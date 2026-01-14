/**
 * A2 No-Regrets Onboarding Wizard - Chunker
 *
 * Provides chunking preview functionality to show users
 * how their documents will be split before committing to a strategy.
 */

import type { DocumentSample, ChunkingStrategy } from './types';

/**
 * Options for generating chunk previews
 */
export interface ChunkPreviewOptions {
  /** Maximum number of sample chunks to generate */
  maxSamples?: number;
  /** Maximum length of each chunk in preview (for display) */
  maxPreviewLength?: number;
  /** Whether to include chunk metadata in preview */
  includeMetadata?: boolean;
}

const DEFAULT_OPTIONS: Required<ChunkPreviewOptions> = {
  maxSamples: 5,
  maxPreviewLength: 500,
  includeMetadata: false,
};

/**
 * Splits text using fixed-size chunking
 */
function fixedSizeChunk(
  text: string,
  chunkSize: number,
  overlap: number
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // Move start position, accounting for overlap
    start = start + chunkSize - overlap;

    // Prevent infinite loop if overlap >= chunkSize
    if (overlap >= chunkSize) {
      start = end;
    }
  }

  return chunks;
}

/**
 * Splits text using paragraph-based chunking
 */
function paragraphChunk(
  text: string,
  chunkSize: number,
  overlap: number,
  separator: string = '\n\n'
): string[] {
  const paragraphs = text.split(separator).filter((p) => p.trim().length > 0);
  const chunks: string[] = [];
  let currentChunk = '';
  let overlapBuffer = '';

  for (const paragraph of paragraphs) {
    const trimmedPara = paragraph.trim();

    // If adding this paragraph would exceed chunk size
    if (currentChunk.length + trimmedPara.length + 2 > chunkSize) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());

        // Create overlap buffer from the end of current chunk
        const words = currentChunk.split(/\s+/);
        const overlapWords = Math.ceil(overlap / 5); // Approximate words
        overlapBuffer = words.slice(-overlapWords).join(' ');
      }

      // Start new chunk with overlap
      currentChunk = overlapBuffer ? overlapBuffer + '\n\n' + trimmedPara : trimmedPara;
    } else {
      // Add paragraph to current chunk
      currentChunk = currentChunk
        ? currentChunk + '\n\n' + trimmedPara
        : trimmedPara;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Splits text using semantic chunking (sentence-aware)
 */
function semanticChunk(
  text: string,
  chunkSize: number,
  overlap: number
): string[] {
  // Split by sentence boundaries
  const sentencePattern = /[.!?]+[\s]+/g;
  const sentences: string[] = [];
  let lastIndex = 0;
  let match;

  while ((match = sentencePattern.exec(text)) !== null) {
    sentences.push(text.slice(lastIndex, match.index + match[0].length).trim());
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex).trim();
    if (remaining.length > 0) {
      sentences.push(remaining);
    }
  }

  // If no sentences found, fall back to fixed chunking
  if (sentences.length === 0) {
    return fixedSizeChunk(text, chunkSize, overlap);
  }

  const chunks: string[] = [];
  let currentChunk = '';
  let overlapSentences: string[] = [];

  for (const sentence of sentences) {
    // If adding this sentence would exceed chunk size
    if (currentChunk.length + sentence.length + 1 > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());

      // Calculate overlap sentences
      const overlapTarget = overlap;
      let overlapLength = 0;
      overlapSentences = [];

      // Get sentences from the end for overlap
      const currentSentences = currentChunk.split(/[.!?]+[\s]+/);
      for (let i = currentSentences.length - 1; i >= 0 && overlapLength < overlapTarget; i--) {
        if (currentSentences[i].trim()) {
          overlapSentences.unshift(currentSentences[i].trim());
          overlapLength += currentSentences[i].length;
        }
      }

      currentChunk = overlapSentences.join('. ') + (overlapSentences.length > 0 ? '. ' : '') + sentence;
    } else {
      currentChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Chunks a single document using the specified strategy
 */
export function chunkDocument(
  content: string,
  strategy: ChunkingStrategy
): string[] {
  const { type, chunkSize, overlap, separator } = strategy;

  switch (type) {
    case 'paragraph':
      return paragraphChunk(content, chunkSize, overlap, separator);
    case 'semantic':
      return semanticChunk(content, chunkSize, overlap);
    case 'fixed':
    default:
      return fixedSizeChunk(content, chunkSize, overlap);
  }
}

/**
 * Generates a preview of how documents will be chunked
 */
export function generateChunkPreview(
  samples: DocumentSample[],
  strategy: ChunkingStrategy,
  options: ChunkPreviewOptions = {}
): string[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const allChunks: string[] = [];

  for (const sample of samples) {
    const chunks = chunkDocument(sample.content, strategy);
    allChunks.push(...chunks);

    // Stop if we have enough samples
    if (allChunks.length >= opts.maxSamples * 2) {
      break;
    }
  }

  // Select representative samples
  const selectedChunks: string[] = [];
  const step = Math.max(1, Math.floor(allChunks.length / opts.maxSamples));

  for (let i = 0; i < allChunks.length && selectedChunks.length < opts.maxSamples; i += step) {
    let chunk = allChunks[i];

    // Truncate for preview if needed
    if (chunk.length > opts.maxPreviewLength) {
      chunk = chunk.slice(0, opts.maxPreviewLength) + '...';
    }

    selectedChunks.push(chunk);
  }

  return selectedChunks;
}

/**
 * Calculates the total number of chunks that would be generated
 */
export function estimateTotalChunks(
  samples: DocumentSample[],
  strategy: ChunkingStrategy
): number {
  let totalChunks = 0;

  for (const sample of samples) {
    const chunks = chunkDocument(sample.content, strategy);
    totalChunks += chunks.length;
  }

  return totalChunks;
}

/**
 * Provides statistics about the chunking result
 */
export interface ChunkingStats {
  totalChunks: number;
  avgChunkLength: number;
  minChunkLength: number;
  maxChunkLength: number;
  totalCharacters: number;
}

/**
 * Calculates statistics about the chunking result
 */
export function calculateChunkingStats(
  samples: DocumentSample[],
  strategy: ChunkingStrategy
): ChunkingStats {
  const allChunks: string[] = [];

  for (const sample of samples) {
    const chunks = chunkDocument(sample.content, strategy);
    allChunks.push(...chunks);
  }

  if (allChunks.length === 0) {
    return {
      totalChunks: 0,
      avgChunkLength: 0,
      minChunkLength: 0,
      maxChunkLength: 0,
      totalCharacters: 0,
    };
  }

  const lengths = allChunks.map((c) => c.length);
  const totalCharacters = lengths.reduce((a, b) => a + b, 0);

  return {
    totalChunks: allChunks.length,
    avgChunkLength: Math.round(totalCharacters / allChunks.length),
    minChunkLength: Math.min(...lengths),
    maxChunkLength: Math.max(...lengths),
    totalCharacters,
  };
}
