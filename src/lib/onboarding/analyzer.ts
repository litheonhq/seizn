/**
 * A2 No-Regrets Onboarding Wizard - Document Analyzer
 *
 * Analyzes document samples to determine optimal chunking strategy
 * and provide recommendations for vector embedding configuration.
 */

import type {
  DocumentSample,
  DocumentAnalysis,
  ChunkingStrategy,
} from './types';
import { CHUNK_SIZE_CONFIG } from './types';

/**
 * Patterns used to detect technical content
 */
const TECHNICAL_PATTERNS = [
  /```[\s\S]*?```/g, // Code blocks
  /`[^`]+`/g, // Inline code
  /\b(function|const|let|var|class|import|export|return|if|else|for|while)\b/g,
  /\b(API|SDK|HTTP|REST|GraphQL|JSON|XML|SQL)\b/gi,
  /[{}\[\]();=>]/g, // Programming syntax
  /\b\d+\.\d+\.\d+\b/g, // Version numbers
  /https?:\/\/[^\s]+/g, // URLs
];

/**
 * Patterns used to detect conversational content
 */
const CONVERSATIONAL_PATTERNS = [
  /\b(I|you|we|they|he|she|it)\b/gi,
  /\b(hello|hi|thanks|please|sorry|great|awesome)\b/gi,
  /[?!]/g,
  /\b(how|what|why|when|where|who)\b/gi,
  /\b(feel|think|believe|want|need|like)\b/gi,
];

/**
 * Estimates token count from character count
 * Uses the approximation of 4 characters per token (common for English text)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculates the technical score of a document
 * Returns a value between 0 and 1
 */
function calculateTechnicalScore(content: string): number {
  let matches = 0;
  const totalPatterns = TECHNICAL_PATTERNS.length;

  for (const pattern of TECHNICAL_PATTERNS) {
    const found = content.match(pattern);
    if (found && found.length > 0) {
      matches += Math.min(found.length / 5, 1); // Normalize matches
    }
  }

  return matches / totalPatterns;
}

/**
 * Calculates the conversational score of a document
 * Returns a value between 0 and 1
 */
function calculateConversationalScore(content: string): number {
  let matches = 0;
  const totalPatterns = CONVERSATIONAL_PATTERNS.length;

  for (const pattern of CONVERSATIONAL_PATTERNS) {
    const found = content.match(pattern);
    if (found && found.length > 0) {
      matches += Math.min(found.length / 10, 1); // Normalize matches
    }
  }

  return matches / totalPatterns;
}

/**
 * Detects the content type based on pattern analysis
 */
export function detectContentType(
  content: string
): 'technical' | 'conversational' | 'mixed' {
  const technicalScore = calculateTechnicalScore(content);
  const conversationalScore = calculateConversationalScore(content);

  const threshold = 0.3;
  const difference = Math.abs(technicalScore - conversationalScore);

  if (difference < threshold) {
    return 'mixed';
  }

  return technicalScore > conversationalScore ? 'technical' : 'conversational';
}

/**
 * Determines the suggested chunk size based on document characteristics
 */
export function suggestChunkSize(
  avgLength: number,
  contentType: 'technical' | 'conversational' | 'mixed'
): 'short' | 'medium' | 'long' {
  // Technical content benefits from larger chunks to preserve context
  if (contentType === 'technical') {
    if (avgLength > 2000) return 'long';
    if (avgLength > 500) return 'medium';
    return 'short';
  }

  // Conversational content works well with medium chunks
  if (contentType === 'conversational') {
    if (avgLength > 3000) return 'long';
    return 'medium';
  }

  // Mixed content - use average length as primary indicator
  if (avgLength > 2500) return 'long';
  if (avgLength > 800) return 'medium';
  return 'short';
}

/**
 * Calculates the suggested overlap based on chunk size and content type
 */
export function suggestOverlap(
  chunkSize: 'short' | 'medium' | 'long',
  contentType: 'technical' | 'conversational' | 'mixed'
): number {
  const baseOverlap = CHUNK_SIZE_CONFIG[chunkSize].overlap;

  // Technical content benefits from more overlap to maintain code context
  if (contentType === 'technical') {
    return Math.round(baseOverlap * 1.25);
  }

  // Conversational content needs less overlap
  if (contentType === 'conversational') {
    return Math.round(baseOverlap * 0.75);
  }

  return baseOverlap;
}

/**
 * Analyzes an array of document samples and returns comprehensive analysis
 */
export function analyzeDocuments(samples: DocumentSample[]): DocumentAnalysis {
  if (samples.length === 0) {
    return {
      avgLength: 0,
      maxLength: 0,
      minLength: 0,
      tokenEstimate: 0,
      suggestedChunkSize: 'medium',
      suggestedOverlap: 64,
      contentType: 'mixed',
    };
  }

  const lengths = samples.map((s) => s.content.length);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const maxLength = Math.max(...lengths);
  const minLength = Math.min(...lengths);

  // Combine all content for content type detection
  const combinedContent = samples.map((s) => s.content).join('\n\n');
  const contentType = detectContentType(combinedContent);

  const totalChars = samples.reduce((sum, s) => sum + s.content.length, 0);
  const tokenEstimate = estimateTokens(combinedContent);

  const suggestedSize = suggestChunkSize(avgLength, contentType);
  const suggestedOverlapValue = suggestOverlap(suggestedSize, contentType);

  return {
    avgLength: Math.round(avgLength),
    maxLength,
    minLength,
    tokenEstimate,
    suggestedChunkSize: suggestedSize,
    suggestedOverlap: suggestedOverlapValue,
    contentType,
  };
}

/**
 * Generates a chunking strategy based on document analysis
 */
export function generateChunkingStrategy(
  analysis: DocumentAnalysis
): ChunkingStrategy {
  const config = CHUNK_SIZE_CONFIG[analysis.suggestedChunkSize];

  // Determine chunking type based on content
  let type: 'fixed' | 'semantic' | 'paragraph';

  if (analysis.contentType === 'technical') {
    // Technical content often has clear structure, use paragraph-based
    type = 'paragraph';
  } else if (analysis.avgLength > 1500) {
    // Long content benefits from semantic chunking
    type = 'semantic';
  } else {
    // Default to fixed-size chunking
    type = 'fixed';
  }

  return {
    type,
    chunkSize: config.chunkSize,
    overlap: analysis.suggestedOverlap,
    separator: type === 'paragraph' ? '\n\n' : undefined,
  };
}
