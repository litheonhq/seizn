/**
 * A2 No-Regrets Onboarding Wizard
 *
 * A comprehensive document analysis and chunking recommendation system
 * that helps users configure optimal settings during onboarding.
 *
 * @module onboarding
 */

// Type exports
export type {
  DocumentSample,
  DocumentAnalysis,
  ChunkingStrategy,
  OnboardingResult,
} from './types';

export { CHUNK_SIZE_CONFIG, COST_CONFIG } from './types';

// Analyzer exports
export {
  analyzeDocuments,
  generateChunkingStrategy,
  detectContentType,
  estimateTokens,
  suggestChunkSize,
  suggestOverlap,
} from './analyzer';

// Chunker exports
export type { ChunkPreviewOptions, ChunkingStats } from './chunker';

export {
  chunkDocument,
  generateChunkPreview,
  estimateTotalChunks,
  calculateChunkingStats,
} from './chunker';

// Cost estimator exports
export type { CostBreakdown, StrategyComparison, PricingTier } from './cost-estimator';

export {
  PRICING_TIERS,
  estimateVectorCount,
  calculateStorageSize,
  calculateStorageCost,
  calculateEmbeddingCost,
  recommendTier,
  generateCostBreakdown,
  estimateCostForDocuments,
  compareStrategies,
} from './cost-estimator';

// Main orchestration function
import type { DocumentSample, OnboardingResult } from './types';
import { analyzeDocuments, generateChunkingStrategy } from './analyzer';
import { generateChunkPreview, estimateTotalChunks } from './chunker';
import { generateCostBreakdown } from './cost-estimator';

/**
 * Performs complete onboarding analysis on document samples
 *
 * This is the main entry point for the onboarding wizard.
 * It analyzes the provided samples, recommends a chunking strategy,
 * generates preview chunks, and estimates costs.
 *
 * @param samples - Array of document samples to analyze
 * @param totalDocuments - Optional total document count for extrapolation
 * @returns Complete onboarding result with recommendations
 *
 * @example
 * ```typescript
 * const samples = [
 *   { content: 'Your document text here...' },
 *   { content: 'Another document...' }
 * ];
 *
 * const result = await performOnboardingAnalysis(samples);
 * console.log(result.recommendedStrategy);
 * console.log(result.estimatedCost);
 * ```
 */
export function performOnboardingAnalysis(
  samples: DocumentSample[],
  totalDocuments?: number
): OnboardingResult {
  // Step 1: Analyze documents
  const analysis = analyzeDocuments(samples);

  // Step 2: Generate recommended chunking strategy
  const recommendedStrategy = generateChunkingStrategy(analysis);

  // Step 3: Generate sample chunks for preview
  const sampleChunks = generateChunkPreview(samples, recommendedStrategy, {
    maxSamples: 5,
    maxPreviewLength: 300,
  });

  // Step 4: Estimate vector count and cost
  const costBreakdown = generateCostBreakdown(
    samples,
    recommendedStrategy,
    totalDocuments
  );

  return {
    analysis,
    recommendedStrategy,
    sampleChunks,
    estimatedVectorCount: costBreakdown.vectorCount,
    estimatedCost: costBreakdown.monthlyCost,
  };
}
