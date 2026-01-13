/**
 * Reversible Context Compression (RCC) - Compressor
 *
 * Compresses context by extracting query-relevant sentences
 * while maintaining pointer maps for reversibility.
 */

import type {
  ChunkInput,
  CompressedChunk,
  CompressionOptions,
  CompressionResult,
  CompressionStats,
  AnalyzedSentence,
  SentenceInclusionReason,
} from './types';
import { createPointerMaps } from './pointer-mapper';

// Default compression options
const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  target_ratio: 0.5,
  min_sentences: 2,
  max_sentences: 10,
  include_first: true,
  include_last: true,
  priority_keywords: [],
  semantic_scoring: false,
};

/**
 * Estimate token count (rough approximation: ~4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into sentences using multiple delimiters
 */
function splitIntoSentences(text: string): Array<{ text: string; start: number; end: number }> {
  const sentences: Array<{ text: string; start: number; end: number }> = [];

  // Pattern for sentence boundaries
  // Handles: periods, question marks, exclamation marks, followed by space or end
  const sentencePattern = /[^.!?]*[.!?]+(?:\s+|$)|[^.!?]+$/g;

  let match;
  while ((match = sentencePattern.exec(text)) !== null) {
    const sentenceText = match[0].trim();
    if (sentenceText.length > 0) {
      sentences.push({
        text: sentenceText,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  // If no sentences found (no punctuation), treat whole text as one sentence
  if (sentences.length === 0 && text.trim().length > 0) {
    sentences.push({
      text: text.trim(),
      start: 0,
      end: text.length,
    });
  }

  return sentences;
}

/**
 * Extract keywords from query text
 */
function extractQueryKeywords(query: string): string[] {
  // Remove common stop words and punctuation
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
    'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'under', 'again', 'further', 'then', 'once', 'here',
    'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or',
    'because', 'until', 'while', 'what', 'which', 'who', 'whom', 'this',
    'that', 'these', 'those', 'am', 'it', 'its', 'itself', 'i', 'me', 'my',
    'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours',
    'he', 'him', 'his', 'she', 'her', 'hers', 'they', 'them', 'their',
  ]);

  const words = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  return [...new Set(words)];
}

/**
 * Check if sentence contains numeric data (facts)
 */
function containsNumericData(text: string): boolean {
  // Match numbers, percentages, currencies, dates
  const numericPatterns = [
    /\d+(?:\.\d+)?%/,           // Percentages: 50%, 3.14%
    /\$[\d,]+(?:\.\d{2})?/,     // Currency: $1,000, $99.99
    /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/, // Dates: 12/25/2023, 25-12-2023
    /\d{4}[-/]\d{1,2}[-/]\d{1,2}/, // ISO dates: 2023-12-25
    /\d+(?:,\d{3})+/,          // Large numbers: 1,000,000
    /\d+\s*(?:million|billion|thousand|hundred)/i, // Written numbers
    /(?:약|대략|approximately|about|around)\s*\d+/i, // Approximate numbers
  ];

  return numericPatterns.some(pattern => pattern.test(text));
}

/**
 * Check if sentence contains date references
 */
function containsDateReference(text: string): boolean {
  const datePatterns = [
    /\d{4}년/,                  // Korean year: 2023년
    /\d{1,2}월/,                // Korean month: 12월
    /\d{1,2}일/,                // Korean day: 25일
    /(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i,
    /\d{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)/i,
    /(?:월|화|수|목|금|토|일)요일/,  // Korean weekdays
    /(?:today|yesterday|tomorrow|last\s+(?:week|month|year)|next\s+(?:week|month|year))/i,
  ];

  return datePatterns.some(pattern => pattern.test(text));
}

/**
 * Check if sentence contains keyword matches
 */
function countKeywordMatches(text: string, keywords: string[]): number {
  const lowerText = text.toLowerCase();
  let count = 0;

  for (const keyword of keywords) {
    // Use word boundary matching for better precision
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    const matches = lowerText.match(regex);
    if (matches) {
      count += matches.length;
    }
  }

  return count;
}

/**
 * Analyze sentences for relevance to the query
 */
function analyzeSentences(
  sentences: Array<{ text: string; start: number; end: number }>,
  keywords: string[],
  options: Required<CompressionOptions>
): AnalyzedSentence[] {
  const totalSentences = sentences.length;

  return sentences.map((sentence, index) => {
    const reasons: SentenceInclusionReason[] = [];
    let relevanceScore = 0;

    // Check keyword matches
    const keywordMatches = countKeywordMatches(
      sentence.text,
      [...keywords, ...options.priority_keywords]
    );
    if (keywordMatches > 0) {
      reasons.push('keyword_match');
      relevanceScore += Math.min(0.4, keywordMatches * 0.1);
    }

    // Check numeric data
    if (containsNumericData(sentence.text)) {
      reasons.push('numeric_data');
      relevanceScore += 0.2;
    }

    // Check date references
    if (containsDateReference(sentence.text)) {
      reasons.push('date_reference');
      relevanceScore += 0.15;
    }

    // First sentence bonus
    if (index === 0 && options.include_first) {
      reasons.push('first_sentence');
      relevanceScore += 0.25;
    }

    // Last sentence bonus
    if (index === totalSentences - 1 && options.include_last && totalSentences > 1) {
      reasons.push('last_sentence');
      relevanceScore += 0.2;
    }

    // Cap relevance score at 1.0
    relevanceScore = Math.min(1.0, relevanceScore);

    return {
      index,
      text: sentence.text,
      start: sentence.start,
      end: sentence.end,
      relevance_score: relevanceScore,
      inclusion_reasons: reasons,
      include: false, // Will be determined later based on target ratio
    };
  });
}

/**
 * Select sentences to include based on target ratio
 */
function selectSentences(
  analyzedSentences: AnalyzedSentence[],
  originalLength: number,
  options: Required<CompressionOptions>
): AnalyzedSentence[] {
  // Sort by relevance score (descending)
  const sorted = [...analyzedSentences].sort(
    (a, b) => b.relevance_score - a.relevance_score
  );

  // Calculate target length
  const targetLength = Math.floor(originalLength * options.target_ratio);

  let selectedLength = 0;
  let selectedCount = 0;

  // Select sentences until we reach target ratio or limits
  for (const sentence of sorted) {
    const wouldExceedMax = selectedCount >= options.max_sentences;
    const wouldExceedTarget = selectedLength + sentence.text.length > targetLength * 1.2;

    // Always include minimum sentences
    const needsMoreForMin = selectedCount < options.min_sentences;

    if (needsMoreForMin || (!wouldExceedMax && !wouldExceedTarget)) {
      const original = analyzedSentences.find(s => s.index === sentence.index);
      if (original) {
        original.include = true;
        selectedLength += sentence.text.length;
        selectedCount++;
      }
    }
  }

  return analyzedSentences;
}

/**
 * Extract relevant sentences from text based on query
 */
export function extractRelevantSentences(
  text: string,
  query: string,
  options: Partial<CompressionOptions> = {}
): {
  sentences: AnalyzedSentence[];
  extractedText: string;
  stats: {
    total: number;
    extracted: number;
    dropped: number;
  };
} {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Split into sentences
  const rawSentences = splitIntoSentences(text);

  // Extract keywords from query
  const keywords = extractQueryKeywords(query);

  // Analyze sentences
  const analyzed = analyzeSentences(rawSentences, keywords, opts);

  // Select sentences based on target ratio
  const selected = selectSentences(analyzed, text.length, opts);

  // Build extracted text (maintaining original order)
  const includedSentences = selected
    .filter(s => s.include)
    .sort((a, b) => a.index - b.index);

  const extractedText = includedSentences.map(s => s.text).join(' ');

  return {
    sentences: selected,
    extractedText,
    stats: {
      total: selected.length,
      extracted: includedSentences.length,
      dropped: selected.length - includedSentences.length,
    },
  };
}

/**
 * Compress a single chunk
 */
export function compressChunk(
  chunk: ChunkInput,
  query: string,
  options: Partial<CompressionOptions> = {}
): CompressedChunk {
  const { sentences, extractedText, stats: _stats } = extractRelevantSentences(
    chunk.text,
    query,
    options
  );

  // Get included sentences for pointer mapping
  const includedSentences = sentences
    .filter(s => s.include)
    .sort((a, b) => a.index - b.index);

  // Create pointer maps
  const pointers = createPointerMaps(includedSentences, extractedText);

  // Calculate compression ratio
  const compressionRatio = extractedText.length / Math.max(1, chunk.text.length);

  return {
    chunk_id: chunk.chunk_id,
    original_text: chunk.text,
    compressed_text: extractedText,
    compression_ratio: compressionRatio,
    pointers,
    tokens: {
      original: estimateTokens(chunk.text),
      compressed: estimateTokens(extractedText),
    },
  };
}

/**
 * Compress multiple chunks (main entry point)
 */
export async function compressContext(
  chunks: ChunkInput[],
  query: string,
  options: Partial<CompressionOptions> = {}
): Promise<CompressionResult> {
  const startTime = Date.now();

  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Track statistics
  let totalSentencesExtracted = 0;
  let totalSentencesDropped = 0;
  const extractionReasons = {
    keyword_match: 0,
    numeric_data: 0,
    first_last_sentence: 0,
    semantic_relevance: 0,
  };

  // Compress each chunk
  const compressedChunks: CompressedChunk[] = [];

  for (const chunk of chunks) {
    const { sentences, extractedText } = extractRelevantSentences(
      chunk.text,
      query,
      opts
    );

    // Count extraction reasons
    const includedSentences = sentences.filter(s => s.include);
    for (const sentence of includedSentences) {
      if (sentence.inclusion_reasons.includes('keyword_match')) {
        extractionReasons.keyword_match++;
      }
      if (sentence.inclusion_reasons.includes('numeric_data') ||
          sentence.inclusion_reasons.includes('date_reference')) {
        extractionReasons.numeric_data++;
      }
      if (sentence.inclusion_reasons.includes('first_sentence') ||
          sentence.inclusion_reasons.includes('last_sentence')) {
        extractionReasons.first_last_sentence++;
      }
      if (sentence.inclusion_reasons.includes('high_semantic_relevance')) {
        extractionReasons.semantic_relevance++;
      }
    }

    totalSentencesExtracted += includedSentences.length;
    totalSentencesDropped += sentences.length - includedSentences.length;

    // Create compressed chunk
    const pointers = createPointerMaps(
      includedSentences.sort((a, b) => a.index - b.index),
      extractedText
    );

    const compressionRatio = extractedText.length / Math.max(1, chunk.text.length);

    compressedChunks.push({
      chunk_id: chunk.chunk_id,
      original_text: chunk.text,
      compressed_text: extractedText,
      compression_ratio: compressionRatio,
      pointers,
      tokens: {
        original: estimateTokens(chunk.text),
        compressed: estimateTokens(extractedText),
      },
    });
  }

  // Calculate totals
  const totalOriginalTokens = compressedChunks.reduce(
    (sum, c) => sum + (c.tokens?.original ?? 0),
    0
  );
  const totalCompressedTokens = compressedChunks.reduce(
    (sum, c) => sum + (c.tokens?.compressed ?? 0),
    0
  );
  const overallRatio = totalCompressedTokens / Math.max(1, totalOriginalTokens);

  const processingTime = Date.now() - startTime;

  const stats: CompressionStats = {
    sentences_extracted: totalSentencesExtracted,
    sentences_dropped: totalSentencesDropped,
    extraction_reasons: extractionReasons,
    processing_time_ms: processingTime,
  };

  return {
    chunks: compressedChunks,
    total_original_tokens: totalOriginalTokens,
    total_compressed_tokens: totalCompressedTokens,
    overall_ratio: overallRatio,
    stats,
  };
}
