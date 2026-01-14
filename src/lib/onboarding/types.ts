/**
 * A2 No-Regrets Onboarding Wizard - Type Definitions
 *
 * This module defines types for the document analysis and chunking
 * recommendation system used during user onboarding.
 */

/**
 * Represents a sample document provided for analysis
 */
export interface DocumentSample {
  /** The text content of the document */
  content: string;
  /** Optional metadata associated with the document */
  metadata?: Record<string, unknown>;
}

/**
 * Results of analyzing document samples
 */
export interface DocumentAnalysis {
  /** Average document length in characters */
  avgLength: number;
  /** Maximum document length in characters */
  maxLength: number;
  /** Minimum document length in characters */
  minLength: number;
  /** Estimated token count (approximated as chars / 4) */
  tokenEstimate: number;
  /** Recommended chunk size category based on analysis */
  suggestedChunkSize: 'short' | 'medium' | 'long';
  /** Recommended overlap percentage between chunks */
  suggestedOverlap: number;
  /** Detected content type */
  contentType: 'technical' | 'conversational' | 'mixed';
}

/**
 * Configuration for a chunking strategy
 */
export interface ChunkingStrategy {
  /** Type of chunking algorithm to use */
  type: 'fixed' | 'semantic' | 'paragraph';
  /** Size of each chunk in characters */
  chunkSize: number;
  /** Overlap between consecutive chunks in characters */
  overlap: number;
  /** Optional separator for paragraph-based chunking */
  separator?: string;
}

/**
 * Complete result of the onboarding analysis process
 */
export interface OnboardingResult {
  /** Detailed analysis of the provided documents */
  analysis: DocumentAnalysis;
  /** Recommended chunking strategy based on analysis */
  recommendedStrategy: ChunkingStrategy;
  /** Preview of how documents would be chunked */
  sampleChunks: string[];
  /** Estimated number of vectors that will be created */
  estimatedVectorCount: number;
  /** Estimated monthly cost in USD */
  estimatedCost: number;
}

/**
 * Constants for chunk size categories
 */
export const CHUNK_SIZE_CONFIG = {
  short: {
    chunkSize: 256,
    overlap: 32,
    description: 'Best for short, focused content like FAQs or definitions',
  },
  medium: {
    chunkSize: 512,
    overlap: 64,
    description: 'Balanced option for general documentation',
  },
  long: {
    chunkSize: 1024,
    overlap: 128,
    description: 'Best for long-form content with complex context',
  },
} as const;

/**
 * Cost estimation constants (based on typical vector DB pricing)
 */
export const COST_CONFIG = {
  /** Cost per 1000 vectors per month (USD) */
  costPer1000Vectors: 0.025,
  /** Average embedding dimension */
  embeddingDimension: 1536,
  /** Storage overhead factor */
  storageOverhead: 1.2,
} as const;
