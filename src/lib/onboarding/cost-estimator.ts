/**
 * A2 No-Regrets Onboarding Wizard - Cost Estimator
 *
 * Provides cost estimation for vector storage and embedding operations
 * to help users make informed decisions during onboarding.
 */

import type { DocumentSample, ChunkingStrategy } from './types';
import { COST_CONFIG } from './types';
import { estimateTotalChunks } from './chunker';

/**
 * Pricing tiers for different usage levels
 */
export const PRICING_TIERS = {
  free: {
    name: 'Free',
    maxVectors: 10000,
    monthlyCost: 0,
    embeddingCostPer1000: 0.0001,
  },
  starter: {
    name: 'Starter',
    maxVectors: 100000,
    monthlyCost: 29,
    embeddingCostPer1000: 0.0001,
  },
  pro: {
    name: 'Pro',
    maxVectors: 1000000,
    monthlyCost: 99,
    embeddingCostPer1000: 0.00008,
  },
  enterprise: {
    name: 'Enterprise',
    maxVectors: Infinity,
    monthlyCost: 299,
    embeddingCostPer1000: 0.00005,
  },
} as const;

export type PricingTier = keyof typeof PRICING_TIERS;

/**
 * Detailed cost breakdown
 */
export interface CostBreakdown {
  /** Estimated number of vectors */
  vectorCount: number;
  /** Monthly storage cost */
  storageCost: number;
  /** One-time embedding cost */
  embeddingCost: number;
  /** Total monthly cost (storage only) */
  monthlyCost: number;
  /** Total first month cost (storage + embedding) */
  firstMonthCost: number;
  /** Recommended pricing tier */
  recommendedTier: PricingTier;
  /** Storage size estimate in MB */
  storageSizeMB: number;
}

/**
 * Estimates the number of vectors that will be created
 */
export function estimateVectorCount(
  samples: DocumentSample[],
  strategy: ChunkingStrategy,
  totalDocuments?: number
): number {
  // Get chunks from samples
  const sampleChunks = estimateTotalChunks(samples, strategy);

  // If total documents count is provided, extrapolate
  if (totalDocuments && totalDocuments > samples.length) {
    const avgChunksPerDoc = sampleChunks / samples.length;
    return Math.ceil(avgChunksPerDoc * totalDocuments);
  }

  return sampleChunks;
}

/**
 * Calculates storage size in MB for vectors
 */
export function calculateStorageSize(
  vectorCount: number,
  dimension: number = COST_CONFIG.embeddingDimension
): number {
  // Each dimension is a 32-bit float (4 bytes)
  const bytesPerVector = dimension * 4;
  const totalBytes = vectorCount * bytesPerVector * COST_CONFIG.storageOverhead;
  return totalBytes / (1024 * 1024); // Convert to MB
}

/**
 * Calculates the monthly storage cost
 */
export function calculateStorageCost(vectorCount: number): number {
  const costPer1000 = COST_CONFIG.costPer1000Vectors;
  return (vectorCount / 1000) * costPer1000;
}

/**
 * Calculates the one-time embedding cost
 */
export function calculateEmbeddingCost(
  vectorCount: number,
  tier: PricingTier = 'starter'
): number {
  const costPer1000 = PRICING_TIERS[tier].embeddingCostPer1000;
  return (vectorCount / 1000) * costPer1000;
}

/**
 * Determines the recommended pricing tier based on vector count
 */
export function recommendTier(vectorCount: number): PricingTier {
  if (vectorCount <= PRICING_TIERS.free.maxVectors) {
    return 'free';
  }
  if (vectorCount <= PRICING_TIERS.starter.maxVectors) {
    return 'starter';
  }
  if (vectorCount <= PRICING_TIERS.pro.maxVectors) {
    return 'pro';
  }
  return 'enterprise';
}

/**
 * Generates a complete cost breakdown
 */
export function generateCostBreakdown(
  samples: DocumentSample[],
  strategy: ChunkingStrategy,
  totalDocuments?: number
): CostBreakdown {
  const vectorCount = estimateVectorCount(samples, strategy, totalDocuments);
  const recommendedTier = recommendTier(vectorCount);
  const storageCost = calculateStorageCost(vectorCount);
  const embeddingCost = calculateEmbeddingCost(vectorCount, recommendedTier);
  const storageSizeMB = calculateStorageSize(vectorCount);

  // Monthly cost is tier base + storage
  const tierCost = PRICING_TIERS[recommendedTier].monthlyCost;
  const monthlyCost = tierCost + storageCost;
  const firstMonthCost = monthlyCost + embeddingCost;

  return {
    vectorCount,
    storageCost: Math.round(storageCost * 100) / 100,
    embeddingCost: Math.round(embeddingCost * 100) / 100,
    monthlyCost: Math.round(monthlyCost * 100) / 100,
    firstMonthCost: Math.round(firstMonthCost * 100) / 100,
    recommendedTier,
    storageSizeMB: Math.round(storageSizeMB * 100) / 100,
  };
}

/**
 * Estimates cost for a given number of documents
 */
export function estimateCostForDocuments(
  avgDocLength: number,
  documentCount: number,
  strategy: ChunkingStrategy
): CostBreakdown {
  // Create synthetic samples for estimation
  const avgChunksPerDoc = Math.ceil(avgDocLength / strategy.chunkSize);
  const vectorCount = avgChunksPerDoc * documentCount;
  const recommendedTier = recommendTier(vectorCount);
  const storageCost = calculateStorageCost(vectorCount);
  const embeddingCost = calculateEmbeddingCost(vectorCount, recommendedTier);
  const storageSizeMB = calculateStorageSize(vectorCount);

  const tierCost = PRICING_TIERS[recommendedTier].monthlyCost;
  const monthlyCost = tierCost + storageCost;
  const firstMonthCost = monthlyCost + embeddingCost;

  return {
    vectorCount,
    storageCost: Math.round(storageCost * 100) / 100,
    embeddingCost: Math.round(embeddingCost * 100) / 100,
    monthlyCost: Math.round(monthlyCost * 100) / 100,
    firstMonthCost: Math.round(firstMonthCost * 100) / 100,
    recommendedTier,
    storageSizeMB: Math.round(storageSizeMB * 100) / 100,
  };
}

/**
 * Compares costs across different strategies
 */
export interface StrategyComparison {
  strategy: ChunkingStrategy;
  vectorCount: number;
  monthlyCost: number;
  storageSizeMB: number;
}

/**
 * Compares costs across multiple chunking strategies
 */
export function compareStrategies(
  samples: DocumentSample[],
  strategies: ChunkingStrategy[]
): StrategyComparison[] {
  return strategies.map((strategy) => {
    const vectorCount = estimateVectorCount(samples, strategy);
    const storageCost = calculateStorageCost(vectorCount);
    const recommendedTier = recommendTier(vectorCount);
    const tierCost = PRICING_TIERS[recommendedTier].monthlyCost;

    return {
      strategy,
      vectorCount,
      monthlyCost: Math.round((tierCost + storageCost) * 100) / 100,
      storageSizeMB: Math.round(calculateStorageSize(vectorCount) * 100) / 100,
    };
  });
}
