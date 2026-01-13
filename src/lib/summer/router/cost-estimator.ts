/**
 * Seizn Summer - Cost Estimator
 *
 * Estimates costs for various operations to inform routing decisions.
 * Provides token counting and cost calculation utilities.
 */

import type {
  ModelConfig,
  OperationType,
  ProviderType,
  BudgetConfig,
} from './types';
import { DEFAULT_MODELS } from './types';

// ===========================================
// Cost Calculation
// ===========================================

/**
 * Cost estimation result
 */
export interface CostEstimate {
  /** Estimated cost in credits */
  credits: number;
  /** Estimated cost in USD */
  usd: number;
  /** Token breakdown */
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  /** Model used for estimate */
  modelId: string;
  /** Provider */
  provider: ProviderType;
  /** Cost breakdown */
  breakdown: CostBreakdown;
}

/**
 * Cost breakdown by operation
 */
export interface CostBreakdown {
  embedding?: number;
  search?: number;
  rerank?: number;
  generation?: number;
  total: number;
}

/**
 * Cost estimation parameters
 */
export interface CostEstimateParams {
  /** Operation type */
  operation: OperationType;
  /** Input text or token count */
  input: string | number;
  /** Expected output tokens (for generation) */
  expectedOutputTokens?: number;
  /** Model ID (optional, will use default) */
  modelId?: string;
  /** Number of documents (for rerank) */
  documentCount?: number;
  /** Include search cost */
  includeSearch?: boolean;
  /** Include rerank cost */
  includeRerank?: boolean;
}

// ===========================================
// Token Estimation
// ===========================================

/**
 * Estimate token count for text.
 * Uses a simple heuristic: ~4 characters per token for English.
 *
 * @param text - Input text
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // Simple heuristic: ~4 characters per token
  // This is approximate but works well for most cases
  const charCount = text.length;
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  // Use a weighted average of character and word based estimates
  const charEstimate = Math.ceil(charCount / 4);
  const wordEstimate = Math.ceil(wordCount * 1.3);

  return Math.ceil((charEstimate + wordEstimate) / 2);
}

/**
 * Estimate tokens for an array of texts.
 */
export function estimateTokensBatch(texts: string[]): number {
  return texts.reduce((sum, text) => sum + estimateTokens(text), 0);
}

/**
 * Check if input exceeds token limit.
 */
export function exceedsTokenLimit(
  text: string,
  maxTokens: number
): boolean {
  return estimateTokens(text) > maxTokens;
}

// ===========================================
// Cost Calculator
// ===========================================

/**
 * Calculate cost for a specific model and token count.
 */
export function calculateModelCost(
  modelId: string,
  inputTokens: number,
  outputTokens = 0
): number {
  const model = DEFAULT_MODELS.find((m) => m.id === modelId);
  if (!model) {
    console.warn(`Unknown model: ${modelId}, using default cost`);
    return (inputTokens + outputTokens) * 0.001; // Default fallback
  }

  const totalTokens = inputTokens + outputTokens;
  return (totalTokens / 1000) * model.costPer1kTokens;
}

/**
 * Convert credits to USD.
 * 1 credit = $0.001 USD
 */
export function creditsToUsd(credits: number): number {
  return credits * 0.001;
}

/**
 * Convert USD to credits.
 */
export function usdToCredits(usd: number): number {
  return usd / 0.001;
}

// ===========================================
// Cost Estimator Class
// ===========================================

export class CostEstimator {
  private readonly models: ModelConfig[];

  constructor(customModels?: ModelConfig[]) {
    this.models = customModels ?? DEFAULT_MODELS;
  }

  /**
   * Estimate cost for an operation.
   */
  estimate(params: CostEstimateParams): CostEstimate {
    const inputTokens =
      typeof params.input === 'string'
        ? estimateTokens(params.input)
        : params.input;

    const outputTokens = params.expectedOutputTokens ?? 0;
    const totalTokens = inputTokens + outputTokens;

    // Find appropriate model
    const model = params.modelId
      ? this.models.find((m) => m.id === params.modelId)
      : this.findBestModel(params.operation);

    if (!model) {
      throw new Error(`No model available for operation: ${params.operation}`);
    }

    // Calculate base cost
    const baseCost = calculateModelCost(model.id, inputTokens, outputTokens);

    // Build cost breakdown
    const breakdown: CostBreakdown = { total: 0 };

    switch (params.operation) {
      case 'embed':
        breakdown.embedding = baseCost;
        breakdown.total = baseCost;
        break;

      case 'search':
        breakdown.embedding = baseCost * 0.3; // Embedding portion
        breakdown.search = baseCost * 0.7; // Search portion
        breakdown.total = baseCost;
        break;

      case 'rerank':
        const rerankCost = this.estimateRerankCost(
          params.documentCount ?? 10,
          inputTokens
        );
        breakdown.rerank = rerankCost;
        breakdown.total = rerankCost;
        break;

      case 'generate':
        breakdown.generation = baseCost;
        breakdown.total = baseCost;
        break;

      case 'rag':
        // RAG includes embedding + search + optional rerank + generation
        breakdown.embedding = baseCost * 0.1;
        breakdown.search = baseCost * 0.1;
        if (params.includeRerank) {
          breakdown.rerank = this.estimateRerankCost(
            params.documentCount ?? 10,
            inputTokens
          );
        }
        breakdown.generation = baseCost * 0.8;
        breakdown.total =
          breakdown.embedding +
          breakdown.search +
          (breakdown.rerank ?? 0) +
          breakdown.generation;
        break;
    }

    return {
      credits: breakdown.total,
      usd: creditsToUsd(breakdown.total),
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: totalTokens,
      },
      modelId: model.id,
      provider: model.provider,
      breakdown,
    };
  }

  /**
   * Estimate cost for embedding generation.
   */
  estimateEmbeddingCost(text: string | number): CostEstimate {
    return this.estimate({
      operation: 'embed',
      input: text,
    });
  }

  /**
   * Estimate cost for search operation.
   */
  estimateSearchCost(query: string): CostEstimate {
    return this.estimate({
      operation: 'search',
      input: query,
    });
  }

  /**
   * Estimate cost for reranking.
   */
  estimateRerankCost(documentCount: number, avgTokensPerDoc: number): number {
    // Rerank cost is based on total tokens processed
    const totalTokens = documentCount * avgTokensPerDoc;
    const rerankModel = this.models.find(
      (m) => m.operations.includes('rerank') && m.enabled
    );

    if (!rerankModel) {
      return totalTokens * 0.0001; // Fallback cost
    }

    return (totalTokens / 1000) * rerankModel.costPer1kTokens;
  }

  /**
   * Estimate cost for RAG pipeline.
   */
  estimateRagCost(
    query: string,
    contextTokens: number,
    expectedOutputTokens: number,
    includeRerank = true,
    documentCount = 10
  ): CostEstimate {
    const queryTokens = estimateTokens(query);

    return this.estimate({
      operation: 'rag',
      input: queryTokens + contextTokens,
      expectedOutputTokens,
      includeRerank,
      documentCount,
    });
  }

  /**
   * Find the best model for an operation.
   */
  private findBestModel(operation: OperationType): ModelConfig | undefined {
    return this.models.find(
      (m) => m.operations.includes(operation) && m.enabled
    );
  }

  /**
   * Get available models for an operation.
   */
  getModelsForOperation(operation: OperationType): ModelConfig[] {
    return this.models.filter(
      (m) => m.operations.includes(operation) && m.enabled
    );
  }

  /**
   * Get model by ID.
   */
  getModel(modelId: string): ModelConfig | undefined {
    return this.models.find((m) => m.id === modelId);
  }
}

// ===========================================
// Singleton Instance
// ===========================================

let costEstimatorInstance: CostEstimator | null = null;

export function getCostEstimator(
  customModels?: ModelConfig[]
): CostEstimator {
  if (!costEstimatorInstance || customModels) {
    costEstimatorInstance = new CostEstimator(customModels);
  }
  return costEstimatorInstance;
}

// ===========================================
// Budget Utilities
// ===========================================

/**
 * Check if an operation fits within budget.
 */
export function fitsWithinBudget(
  estimate: CostEstimate,
  budget: BudgetConfig,
  estimatedLatencyMs?: number
): {
  fits: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  if (estimate.credits > budget.maxCostCredits) {
    violations.push(
      `Cost ${estimate.credits.toFixed(2)} exceeds budget ${budget.maxCostCredits}`
    );
  }

  if (estimate.tokens.total > budget.maxTokens) {
    violations.push(
      `Tokens ${estimate.tokens.total} exceeds budget ${budget.maxTokens}`
    );
  }

  if (estimatedLatencyMs && estimatedLatencyMs > budget.maxLatencyMs) {
    violations.push(
      `Latency ${estimatedLatencyMs}ms exceeds budget ${budget.maxLatencyMs}ms`
    );
  }

  return {
    fits: violations.length === 0,
    violations,
  };
}

/**
 * Find the cheapest model that fits within budget.
 */
export function findCheapestModel(
  operation: OperationType,
  inputTokens: number,
  budget: BudgetConfig
): ModelConfig | null {
  const estimator = getCostEstimator();
  const models = estimator.getModelsForOperation(operation);

  // Sort by cost ascending
  const sortedModels = models.sort((a, b) => a.costPer1kTokens - b.costPer1kTokens);

  for (const model of sortedModels) {
    const cost = calculateModelCost(model.id, inputTokens);
    if (cost <= budget.maxCostCredits && model.maxContextTokens >= inputTokens) {
      return model;
    }
  }

  return null;
}

/**
 * Find the fastest model that fits within budget.
 */
export function findFastestModel(
  operation: OperationType,
  inputTokens: number,
  budget: BudgetConfig
): ModelConfig | null {
  const estimator = getCostEstimator();
  const models = estimator.getModelsForOperation(operation);

  // Sort by latency ascending
  const sortedModels = models.sort((a, b) => a.avgLatencyMs - b.avgLatencyMs);

  for (const model of sortedModels) {
    const cost = calculateModelCost(model.id, inputTokens);
    if (
      cost <= budget.maxCostCredits &&
      model.avgLatencyMs <= budget.maxLatencyMs &&
      model.maxContextTokens >= inputTokens
    ) {
      return model;
    }
  }

  return null;
}

/**
 * Find the highest quality model that fits within budget.
 */
export function findBestQualityModel(
  operation: OperationType,
  inputTokens: number,
  budget: BudgetConfig
): ModelConfig | null {
  const estimator = getCostEstimator();
  const models = estimator.getModelsForOperation(operation);

  // Sort by quality descending
  const sortedModels = models.sort((a, b) => b.qualityScore - a.qualityScore);

  for (const model of sortedModels) {
    const cost = calculateModelCost(model.id, inputTokens);
    if (cost <= budget.maxCostCredits && model.maxContextTokens >= inputTokens) {
      return model;
    }
  }

  return null;
}
