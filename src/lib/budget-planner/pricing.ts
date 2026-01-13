/**
 * Seizn Budget-aware Planning - Pricing
 *
 * Pricing tables for embedding, reranking, and LLM models.
 * Prices are in USD per unit (tokens, searches, etc.)
 *
 * Last updated: 2025-01
 */

import type {
  EmbeddingModel,
  RerankModel,
  LLMModel,
} from './types';

// ============================================
// Embedding Model Pricing
// ============================================

export interface EmbeddingPricing {
  /** Model name */
  model: EmbeddingModel;
  /** Price per million tokens */
  pricePerMToken: number;
  /** Output dimensions */
  dimensions: number;
  /** Max input tokens */
  maxTokens: number;
  /** Quality score (0-1) */
  qualityScore: number;
  /** Typical latency in ms */
  avgLatencyMs: number;
  /** Provider */
  provider: 'openai' | 'voyage' | 'google' | 'cohere';
}

export const EMBEDDING_PRICING: Record<EmbeddingModel, EmbeddingPricing> = {
  'text-embedding-3-small': {
    model: 'text-embedding-3-small',
    pricePerMToken: 0.02,
    dimensions: 1536,
    maxTokens: 8191,
    qualityScore: 0.75,
    avgLatencyMs: 100,
    provider: 'openai',
  },
  'text-embedding-3-large': {
    model: 'text-embedding-3-large',
    pricePerMToken: 0.13,
    dimensions: 3072,
    maxTokens: 8191,
    qualityScore: 0.92,
    avgLatencyMs: 150,
    provider: 'openai',
  },
  'text-embedding-ada-002': {
    model: 'text-embedding-ada-002',
    pricePerMToken: 0.10,
    dimensions: 1536,
    maxTokens: 8191,
    qualityScore: 0.70,
    avgLatencyMs: 100,
    provider: 'openai',
  },
  'voyage-3': {
    model: 'voyage-3',
    pricePerMToken: 0.06,
    dimensions: 1024,
    maxTokens: 32000,
    qualityScore: 0.88,
    avgLatencyMs: 120,
    provider: 'voyage',
  },
  'voyage-3-lite': {
    model: 'voyage-3-lite',
    pricePerMToken: 0.02,
    dimensions: 512,
    maxTokens: 32000,
    qualityScore: 0.72,
    avgLatencyMs: 80,
    provider: 'voyage',
  },
  'gemini-embedding': {
    model: 'gemini-embedding',
    pricePerMToken: 0.00,  // Free tier available
    dimensions: 768,
    maxTokens: 2048,
    qualityScore: 0.70,
    avgLatencyMs: 200,
    provider: 'google',
  },
};

// ============================================
// Rerank Model Pricing
// ============================================

export interface RerankPricing {
  /** Model name */
  model: RerankModel;
  /** Price per 1000 searches */
  pricePerKSearch: number;
  /** Max documents per search */
  maxDocuments: number;
  /** Quality score (0-1) */
  qualityScore: number;
  /** Typical latency in ms (for 10 docs) */
  avgLatencyMs: number;
  /** Provider */
  provider: 'cohere' | 'jina' | 'huggingface';
}

export const RERANK_PRICING: Record<RerankModel, RerankPricing> = {
  'cohere-rerank-v3': {
    model: 'cohere-rerank-v3',
    pricePerKSearch: 1.00,
    maxDocuments: 1000,
    qualityScore: 0.95,
    avgLatencyMs: 300,
    provider: 'cohere',
  },
  'cohere-rerank-english-v3': {
    model: 'cohere-rerank-english-v3',
    pricePerKSearch: 1.00,
    maxDocuments: 1000,
    qualityScore: 0.93,
    avgLatencyMs: 250,
    provider: 'cohere',
  },
  'bge-reranker-v2-m3': {
    model: 'bge-reranker-v2-m3',
    pricePerKSearch: 0.00,  // Self-hosted
    maxDocuments: 100,
    qualityScore: 0.85,
    avgLatencyMs: 150,
    provider: 'huggingface',
  },
  'jina-reranker-v2': {
    model: 'jina-reranker-v2',
    pricePerKSearch: 0.50,
    maxDocuments: 500,
    qualityScore: 0.88,
    avgLatencyMs: 200,
    provider: 'jina',
  },
};

// ============================================
// LLM Model Pricing
// ============================================

export interface LLMPricing {
  /** Model name */
  model: LLMModel;
  /** Price per million input tokens */
  pricePerMTokenIn: number;
  /** Price per million output tokens */
  pricePerMTokenOut: number;
  /** Max context window */
  maxContext: number;
  /** Max output tokens */
  maxOutput: number;
  /** Quality score (0-1) */
  qualityScore: number;
  /** Typical latency in ms (for 100 output tokens) */
  avgLatencyMs: number;
  /** Provider */
  provider: 'openai' | 'anthropic' | 'google';
}

export const LLM_PRICING: Record<LLMModel, LLMPricing> = {
  'gpt-4o': {
    model: 'gpt-4o',
    pricePerMTokenIn: 2.50,
    pricePerMTokenOut: 10.00,
    maxContext: 128000,
    maxOutput: 16384,
    qualityScore: 0.95,
    avgLatencyMs: 2000,
    provider: 'openai',
  },
  'gpt-4o-mini': {
    model: 'gpt-4o-mini',
    pricePerMTokenIn: 0.15,
    pricePerMTokenOut: 0.60,
    maxContext: 128000,
    maxOutput: 16384,
    qualityScore: 0.85,
    avgLatencyMs: 1000,
    provider: 'openai',
  },
  'gpt-4-turbo': {
    model: 'gpt-4-turbo',
    pricePerMTokenIn: 10.00,
    pricePerMTokenOut: 30.00,
    maxContext: 128000,
    maxOutput: 4096,
    qualityScore: 0.93,
    avgLatencyMs: 3000,
    provider: 'openai',
  },
  'claude-3-5-sonnet': {
    model: 'claude-3-5-sonnet',
    pricePerMTokenIn: 3.00,
    pricePerMTokenOut: 15.00,
    maxContext: 200000,
    maxOutput: 8192,
    qualityScore: 0.96,
    avgLatencyMs: 2500,
    provider: 'anthropic',
  },
  'claude-3-5-haiku': {
    model: 'claude-3-5-haiku',
    pricePerMTokenIn: 0.80,
    pricePerMTokenOut: 4.00,
    maxContext: 200000,
    maxOutput: 8192,
    qualityScore: 0.82,
    avgLatencyMs: 800,
    provider: 'anthropic',
  },
  'claude-3-opus': {
    model: 'claude-3-opus',
    pricePerMTokenIn: 15.00,
    pricePerMTokenOut: 75.00,
    maxContext: 200000,
    maxOutput: 4096,
    qualityScore: 0.98,
    avgLatencyMs: 5000,
    provider: 'anthropic',
  },
  'gemini-1.5-pro': {
    model: 'gemini-1.5-pro',
    pricePerMTokenIn: 1.25,
    pricePerMTokenOut: 5.00,
    maxContext: 2000000,
    maxOutput: 8192,
    qualityScore: 0.92,
    avgLatencyMs: 2000,
    provider: 'google',
  },
  'gemini-1.5-flash': {
    model: 'gemini-1.5-flash',
    pricePerMTokenIn: 0.075,
    pricePerMTokenOut: 0.30,
    maxContext: 1000000,
    maxOutput: 8192,
    qualityScore: 0.80,
    avgLatencyMs: 500,
    provider: 'google',
  },
};

// ============================================
// Storage Pricing
// ============================================

export interface StoragePricing {
  /** Price per million vectors per month */
  pricePerMVectorsMonth: number;
  /** Price per GB stored per month */
  pricePerGBMonth: number;
  /** Price per million queries */
  pricePerMQueries: number;
}

export const STORAGE_PRICING: StoragePricing = {
  pricePerMVectorsMonth: 0.25,
  pricePerGBMonth: 0.10,
  pricePerMQueries: 0.01,
};

// ============================================
// Pricing Utilities
// ============================================

/**
 * Calculate embedding cost
 */
export function calculateEmbeddingCost(
  model: EmbeddingModel,
  tokens: number
): number {
  const pricing = EMBEDDING_PRICING[model];
  if (!pricing) return 0;
  return (tokens / 1_000_000) * pricing.pricePerMToken;
}

/**
 * Calculate rerank cost
 */
export function calculateRerankCost(
  model: RerankModel,
  searches: number
): number {
  const pricing = RERANK_PRICING[model];
  if (!pricing) return 0;
  return (searches / 1000) * pricing.pricePerKSearch;
}

/**
 * Calculate LLM cost
 */
export function calculateLLMCost(
  model: LLMModel,
  tokensIn: number,
  tokensOut: number
): number {
  const pricing = LLM_PRICING[model];
  if (!pricing) return 0;
  const inputCost = (tokensIn / 1_000_000) * pricing.pricePerMTokenIn;
  const outputCost = (tokensOut / 1_000_000) * pricing.pricePerMTokenOut;
  return inputCost + outputCost;
}

/**
 * Calculate storage cost (per month)
 */
export function calculateStorageCost(
  vectors: number,
  dimensions: number
): number {
  // Estimate bytes per vector: dimensions * 4 (float32) + metadata overhead
  const bytesPerVector = dimensions * 4 + 100;
  const totalGB = (vectors * bytesPerVector) / (1024 * 1024 * 1024);

  const vectorCost = (vectors / 1_000_000) * STORAGE_PRICING.pricePerMVectorsMonth;
  const gbCost = totalGB * STORAGE_PRICING.pricePerGBMonth;

  return Math.max(vectorCost, gbCost);
}

/**
 * Get cheapest embedding model meeting quality threshold
 */
export function getCheapestEmbeddingModel(
  minQuality: number = 0.7
): EmbeddingModel {
  const candidates = Object.values(EMBEDDING_PRICING)
    .filter(p => p.qualityScore >= minQuality)
    .sort((a, b) => a.pricePerMToken - b.pricePerMToken);

  return candidates[0]?.model || 'text-embedding-3-small';
}

/**
 * Get cheapest rerank model meeting quality threshold
 */
export function getCheapestRerankModel(
  minQuality: number = 0.8
): RerankModel | null {
  const candidates = Object.values(RERANK_PRICING)
    .filter(p => p.qualityScore >= minQuality)
    .sort((a, b) => a.pricePerKSearch - b.pricePerKSearch);

  return candidates[0]?.model || null;
}

/**
 * Get cheapest LLM model meeting quality threshold
 */
export function getCheapestLLMModel(
  minQuality: number = 0.8
): LLMModel {
  const candidates = Object.values(LLM_PRICING)
    .filter(p => p.qualityScore >= minQuality)
    .sort((a, b) => {
      // Sort by average cost (assuming 1:1 input:output ratio)
      const avgCostA = (a.pricePerMTokenIn + a.pricePerMTokenOut) / 2;
      const avgCostB = (b.pricePerMTokenIn + b.pricePerMTokenOut) / 2;
      return avgCostA - avgCostB;
    });

  return candidates[0]?.model || 'gpt-4o-mini';
}

/**
 * Get model quality score
 */
export function getModelQuality(
  type: 'embedding' | 'rerank' | 'llm',
  model: string
): number {
  switch (type) {
    case 'embedding':
      return EMBEDDING_PRICING[model as EmbeddingModel]?.qualityScore ?? 0.5;
    case 'rerank':
      return RERANK_PRICING[model as RerankModel]?.qualityScore ?? 0.5;
    case 'llm':
      return LLM_PRICING[model as LLMModel]?.qualityScore ?? 0.5;
    default:
      return 0.5;
  }
}

/**
 * Get all models sorted by cost (cheapest first)
 */
export function getModelsByPrice(): {
  embedding: EmbeddingModel[];
  rerank: RerankModel[];
  llm: LLMModel[];
} {
  return {
    embedding: Object.values(EMBEDDING_PRICING)
      .sort((a, b) => a.pricePerMToken - b.pricePerMToken)
      .map(p => p.model),
    rerank: Object.values(RERANK_PRICING)
      .sort((a, b) => a.pricePerKSearch - b.pricePerKSearch)
      .map(p => p.model),
    llm: Object.values(LLM_PRICING)
      .sort((a, b) => {
        const avgA = (a.pricePerMTokenIn + a.pricePerMTokenOut) / 2;
        const avgB = (b.pricePerMTokenIn + b.pricePerMTokenOut) / 2;
        return avgA - avgB;
      })
      .map(p => p.model),
  };
}

/**
 * Get all models sorted by quality (highest first)
 */
export function getModelsByQuality(): {
  embedding: EmbeddingModel[];
  rerank: RerankModel[];
  llm: LLMModel[];
} {
  return {
    embedding: Object.values(EMBEDDING_PRICING)
      .sort((a, b) => b.qualityScore - a.qualityScore)
      .map(p => p.model),
    rerank: Object.values(RERANK_PRICING)
      .sort((a, b) => b.qualityScore - a.qualityScore)
      .map(p => p.model),
    llm: Object.values(LLM_PRICING)
      .sort((a, b) => b.qualityScore - a.qualityScore)
      .map(p => p.model),
  };
}

/**
 * Format cost for display
 */
export function formatCost(cost: number): string {
  if (cost < 0.0001) return '$0.0000';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * Format large numbers
 */
export function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}
