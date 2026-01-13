/**
 * Seizn Summer - Budget Router
 *
 * Intelligent routing system that makes cost-aware decisions
 * for API requests based on budget constraints and cache availability.
 */

import { randomUUID } from 'crypto';
import { getSemanticCache } from '../cache';
import {
  getCostEstimator,
  estimateTokens,
  calculateModelCost,
  fitsWithinBudget,
  findCheapestModel,
  findFastestModel,
  findBestQualityModel,
} from './cost-estimator';
import type {
  BudgetConfig,
  RoutingDecision,
  RoutingContext,
  RoutingStrategy,
  RoutingMetadata,
  FallbackOption,
  ModelConfig,
  ModelTier,
  RouterStats,
  RouterEvent,
  DEFAULT_BUDGET_BY_PLAN,
  OperationType,
} from './types';
import { DEFAULT_MODELS } from './types';

// ===========================================
// Constants
// ===========================================

const ROUTER_STATS_KEY = 'szn:router:stats';

// ===========================================
// Budget Router Class
// ===========================================

export class BudgetRouter {
  private readonly models: ModelConfig[];
  private stats: RouterStats;

  constructor(customModels?: ModelConfig[]) {
    this.models = customModels ?? DEFAULT_MODELS;
    this.stats = this.initStats();
  }

  /**
   * Make a routing decision for a request.
   */
  async route(context: RoutingContext): Promise<RoutingDecision> {
    const requestId = `req_${randomUUID()}`;
    const startTime = Date.now();

    // Get budget configuration
    const budget = this.resolveBudget(context);

    // Estimate input tokens
    const inputTokens = context.inputTokens || estimateTokens(context.query);

    // Check cache first (if applicable)
    const cacheResult = await this.checkCache(context);

    // If cache hit, return cache decision
    if (cacheResult.hit) {
      const decision = this.createCacheDecision(
        requestId,
        context,
        budget,
        cacheResult
      );
      this.updateStats(decision);
      return decision;
    }

    // Select best model based on optimization mode
    const selectedModel = this.selectModel(
      context.operation,
      inputTokens,
      budget
    );

    if (!selectedModel) {
      // No model available within budget
      throw new Error(
        `No model available for operation ${context.operation} within budget constraints`
      );
    }

    // Estimate costs
    const costEstimator = getCostEstimator();
    const costEstimate = costEstimator.estimate({
      operation: context.operation,
      input: inputTokens,
      modelId: selectedModel.id,
    });

    // Build fallback chain
    const fallbacks = this.buildFallbackChain(
      context.operation,
      inputTokens,
      budget,
      selectedModel.id
    );

    // Determine strategy
    const strategy = this.determineStrategy(context, cacheResult, fallbacks);

    // Build decision
    const decision: RoutingDecision = {
      useCache: false,
      modelId: selectedModel.id,
      modelTier: selectedModel.tier,
      provider: selectedModel.provider,
      estimatedCost: costEstimate.credits,
      estimatedLatencyMs: selectedModel.avgLatencyMs,
      strategy,
      fallbacks,
      reasoning: this.buildReasoning(context, budget, selectedModel, cacheResult),
      metadata: {
        requestId,
        plan: context.plan,
        budgetConfig: budget,
        cacheResult: {
          checked: true,
          hit: false,
          similarity: cacheResult.similarity,
        },
        modelSelection: {
          considered: this.models
            .filter((m) => m.operations.includes(context.operation))
            .map((m) => m.id),
          rejected: this.getRejectedModels(
            context.operation,
            inputTokens,
            budget,
            selectedModel.id
          ),
        },
        decidedAt: new Date().toISOString(),
      },
    };

    this.updateStats(decision);
    return decision;
  }

  // ===========================================
  // Budget Resolution
  // ===========================================

  /**
   * Resolve budget configuration for the request.
   */
  private resolveBudget(context: RoutingContext): BudgetConfig {
    // Get default budget for plan
    const defaultBudget = this.getDefaultBudget(context.plan);

    // Apply overrides if provided
    if (context.budgetOverride) {
      return {
        ...defaultBudget,
        ...context.budgetOverride,
      };
    }

    // Apply priority adjustments
    if (context.priority === 'critical') {
      return {
        ...defaultBudget,
        maxLatencyMs: defaultBudget.maxLatencyMs * 0.5,
        maxCostCredits: defaultBudget.maxCostCredits * 2,
      };
    } else if (context.priority === 'high') {
      return {
        ...defaultBudget,
        maxLatencyMs: defaultBudget.maxLatencyMs * 0.75,
        maxCostCredits: defaultBudget.maxCostCredits * 1.5,
      };
    } else if (context.priority === 'low') {
      return {
        ...defaultBudget,
        maxLatencyMs: defaultBudget.maxLatencyMs * 2,
        maxCostCredits: defaultBudget.maxCostCredits * 0.5,
      };
    }

    return defaultBudget;
  }

  /**
   * Get default budget for a plan.
   */
  private getDefaultBudget(plan: string): BudgetConfig {
    const defaults: Record<string, BudgetConfig> = {
      free: {
        maxLatencyMs: 3000,
        maxCostCredits: 5,
        maxTokens: 4000,
        preferredTier: 'economy',
        enableFallback: true,
        costOptimization: 'cost',
      },
      pro: {
        maxLatencyMs: 5000,
        maxCostCredits: 50,
        maxTokens: 16000,
        preferredTier: 'standard',
        enableFallback: true,
        costOptimization: 'balanced',
      },
      enterprise: {
        maxLatencyMs: 10000,
        maxCostCredits: 500,
        maxTokens: 32000,
        preferredTier: 'premium',
        enableFallback: false,
        costOptimization: 'quality',
      },
    };

    return defaults[plan] ?? defaults.free;
  }

  // ===========================================
  // Cache Integration
  // ===========================================

  /**
   * Check cache for potential hit.
   */
  private async checkCache(
    context: RoutingContext
  ): Promise<{ hit: boolean; similarity: number; entry?: unknown }> {
    // Only check cache for search/rag operations
    if (!['search', 'rag'].includes(context.operation)) {
      return { hit: false, similarity: 0 };
    }

    if (!context.collectionId) {
      return { hit: false, similarity: 0 };
    }

    try {
      const cache = getSemanticCache();
      const result = await cache.query({
        query: context.query,
        collectionId: context.collectionId,
        userId: context.userId,
        embedding: context.embedding,
      });

      return {
        hit: result.hit,
        similarity: result.similarity,
        entry: result.entry,
      };
    } catch (error) {
      console.error('Cache check error:', error);
      return { hit: false, similarity: 0 };
    }
  }

  /**
   * Create routing decision for cache hit.
   */
  private createCacheDecision(
    requestId: string,
    context: RoutingContext,
    budget: BudgetConfig,
    cacheResult: { hit: boolean; similarity: number; entry?: unknown }
  ): RoutingDecision {
    return {
      useCache: true,
      modelId: 'cache',
      modelTier: 'economy' as ModelTier,
      provider: 'cache',
      estimatedCost: 0,
      estimatedLatencyMs: 10, // Cache lookup is fast
      strategy: 'cache_first',
      fallbacks: [],
      reasoning: `Cache hit with ${(cacheResult.similarity * 100).toFixed(1)}% similarity. Using cached response.`,
      metadata: {
        requestId,
        plan: context.plan,
        budgetConfig: budget,
        cacheResult: {
          checked: true,
          hit: true,
          similarity: cacheResult.similarity,
        },
        decidedAt: new Date().toISOString(),
      },
    };
  }

  // ===========================================
  // Model Selection
  // ===========================================

  /**
   * Select the best model based on budget and optimization mode.
   */
  private selectModel(
    operation: OperationType,
    inputTokens: number,
    budget: BudgetConfig
  ): ModelConfig | null {
    switch (budget.costOptimization) {
      case 'cost':
        return findCheapestModel(operation, inputTokens, budget);

      case 'latency':
        return findFastestModel(operation, inputTokens, budget);

      case 'quality':
        return findBestQualityModel(operation, inputTokens, budget);

      case 'balanced':
      default:
        return this.findBalancedModel(operation, inputTokens, budget);
    }
  }

  /**
   * Find a balanced model considering cost, latency, and quality.
   */
  private findBalancedModel(
    operation: OperationType,
    inputTokens: number,
    budget: BudgetConfig
  ): ModelConfig | null {
    const availableModels = this.models.filter(
      (m) => m.operations.includes(operation) && m.enabled
    );

    // Score each model
    const scoredModels = availableModels.map((model) => {
      const cost = calculateModelCost(model.id, inputTokens);
      const costCheck = fitsWithinBudget(
        {
          credits: cost,
          usd: cost * 0.001,
          tokens: { input: inputTokens, output: 0, total: inputTokens },
          modelId: model.id,
          provider: model.provider,
          breakdown: { total: cost },
        },
        budget,
        model.avgLatencyMs
      );

      if (!costCheck.fits) {
        return { model, score: -1, fits: false };
      }

      // Calculate balanced score (higher is better)
      const costScore = 1 - cost / budget.maxCostCredits;
      const latencyScore = 1 - model.avgLatencyMs / budget.maxLatencyMs;
      const qualityScore = model.qualityScore;

      // Weighted average
      const score = costScore * 0.3 + latencyScore * 0.3 + qualityScore * 0.4;

      return { model, score, fits: true };
    });

    // Filter and sort by score
    const validModels = scoredModels
      .filter((m) => m.fits && m.score >= 0)
      .sort((a, b) => b.score - a.score);

    return validModels.length > 0 ? validModels[0].model : null;
  }

  /**
   * Get models that were rejected and why.
   */
  private getRejectedModels(
    operation: OperationType,
    inputTokens: number,
    budget: BudgetConfig,
    selectedModelId: string
  ): { modelId: string; reason: string }[] {
    const rejected: { modelId: string; reason: string }[] = [];

    for (const model of this.models) {
      if (model.id === selectedModelId) continue;
      if (!model.operations.includes(operation)) continue;

      const cost = calculateModelCost(model.id, inputTokens);

      if (!model.enabled) {
        rejected.push({ modelId: model.id, reason: 'Model disabled' });
      } else if (cost > budget.maxCostCredits) {
        rejected.push({
          modelId: model.id,
          reason: `Cost ${cost.toFixed(2)} exceeds budget ${budget.maxCostCredits}`,
        });
      } else if (model.avgLatencyMs > budget.maxLatencyMs) {
        rejected.push({
          modelId: model.id,
          reason: `Latency ${model.avgLatencyMs}ms exceeds budget ${budget.maxLatencyMs}ms`,
        });
      } else if (model.maxContextTokens < inputTokens) {
        rejected.push({
          modelId: model.id,
          reason: `Context limit ${model.maxContextTokens} < input ${inputTokens}`,
        });
      }
    }

    return rejected;
  }

  // ===========================================
  // Fallback Chain
  // ===========================================

  /**
   * Build fallback chain for resilience.
   */
  private buildFallbackChain(
    operation: OperationType,
    inputTokens: number,
    budget: BudgetConfig,
    primaryModelId: string
  ): FallbackOption[] {
    if (!budget.enableFallback) {
      return [];
    }

    const fallbacks: FallbackOption[] = [];
    const availableModels = this.models.filter(
      (m) =>
        m.operations.includes(operation) &&
        m.enabled &&
        m.id !== primaryModelId
    );

    // Sort by cost (cheapest first for fallbacks)
    const sortedModels = availableModels.sort(
      (a, b) => a.costPer1kTokens - b.costPer1kTokens
    );

    for (const model of sortedModels.slice(0, 2)) {
      const cost = calculateModelCost(model.id, inputTokens);

      fallbacks.push({
        provider: model.provider,
        modelId: model.id,
        triggerOn: 'error',
        estimatedCost: cost,
      });
    }

    return fallbacks;
  }

  // ===========================================
  // Strategy Determination
  // ===========================================

  /**
   * Determine the routing strategy.
   */
  private determineStrategy(
    context: RoutingContext,
    cacheResult: { hit: boolean },
    fallbacks: FallbackOption[]
  ): RoutingStrategy {
    // Cache operations use cache_first
    if (['search', 'rag'].includes(context.operation)) {
      if (cacheResult.hit) {
        return 'cache_first';
      }
    }

    // Operations with fallbacks use fallback_chain
    if (fallbacks.length > 0) {
      return 'fallback_chain';
    }

    return 'direct';
  }

  // ===========================================
  // Reasoning
  // ===========================================

  /**
   * Build human-readable reasoning for the decision.
   */
  private buildReasoning(
    context: RoutingContext,
    budget: BudgetConfig,
    model: ModelConfig,
    cacheResult: { hit: boolean; similarity: number }
  ): string {
    const parts: string[] = [];

    // Cache status
    if (cacheResult.similarity > 0) {
      parts.push(
        `Cache check: ${cacheResult.hit ? 'HIT' : 'MISS'} (${(cacheResult.similarity * 100).toFixed(1)}% similarity)`
      );
    }

    // Model selection
    parts.push(
      `Selected ${model.id} (${model.tier} tier, ${model.provider})`
    );

    // Optimization mode
    parts.push(`Optimization: ${budget.costOptimization}`);

    // Cost info
    const cost = calculateModelCost(model.id, context.inputTokens || 0);
    parts.push(
      `Estimated cost: ${cost.toFixed(3)} credits (budget: ${budget.maxCostCredits})`
    );

    return parts.join('. ');
  }

  // ===========================================
  // Statistics
  // ===========================================

  /**
   * Initialize stats.
   */
  private initStats(): RouterStats {
    return {
      totalDecisions: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalCostCredits: 0,
      avgLatencyMs: 0,
      byStrategy: {} as Record<RoutingStrategy, number>,
      byModel: {},
      fallbackCount: 0,
      budgetExceededCount: 0,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Update stats after a routing decision.
   */
  private updateStats(decision: RoutingDecision): void {
    this.stats.totalDecisions++;

    if (decision.useCache) {
      this.stats.cacheHits++;
    } else {
      this.stats.cacheMisses++;
    }

    this.stats.totalCostCredits += decision.estimatedCost;

    // Running average for latency
    this.stats.avgLatencyMs =
      (this.stats.avgLatencyMs * (this.stats.totalDecisions - 1) +
        decision.estimatedLatencyMs) /
      this.stats.totalDecisions;

    // By strategy
    this.stats.byStrategy[decision.strategy] =
      (this.stats.byStrategy[decision.strategy] ?? 0) + 1;

    // By model
    this.stats.byModel[decision.modelId] =
      (this.stats.byModel[decision.modelId] ?? 0) + 1;

    this.stats.timestamp = new Date().toISOString();
  }

  /**
   * Get router statistics.
   */
  getStats(): RouterStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.stats = this.initStats();
  }
}

// ===========================================
// Singleton Instance
// ===========================================

let budgetRouterInstance: BudgetRouter | null = null;

export function getBudgetRouter(customModels?: ModelConfig[]): BudgetRouter {
  if (!budgetRouterInstance || customModels) {
    budgetRouterInstance = new BudgetRouter(customModels);
  }
  return budgetRouterInstance;
}

// ===========================================
// Convenience Functions
// ===========================================

/**
 * Quick route for a search query.
 */
export async function routeSearch(
  query: string,
  userId: string,
  collectionId: string,
  plan: string
): Promise<RoutingDecision> {
  const router = getBudgetRouter();
  return router.route({
    userId,
    plan,
    collectionId,
    query,
    inputTokens: estimateTokens(query),
    operation: 'search',
  });
}

/**
 * Quick route for a RAG query.
 */
export async function routeRag(
  query: string,
  userId: string,
  collectionId: string,
  plan: string
): Promise<RoutingDecision> {
  const router = getBudgetRouter();
  return router.route({
    userId,
    plan,
    collectionId,
    query,
    inputTokens: estimateTokens(query),
    operation: 'rag',
  });
}

/**
 * Quick route for embedding generation.
 */
export async function routeEmbed(
  text: string,
  userId: string,
  plan: string
): Promise<RoutingDecision> {
  const router = getBudgetRouter();
  return router.route({
    userId,
    plan,
    query: text,
    inputTokens: estimateTokens(text),
    operation: 'embed',
  });
}
