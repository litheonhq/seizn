/**
 * Seizn Budget-aware Planning - Optimizer
 *
 * Optimizes retrieval plans to maximize quality within budget constraints.
 */

import type {
  RetrievalPlanConfig,
  OptimizedPlan,
  UpgradeSuggestion,
  PlanConstraints,
  QualityTier,
  EmbeddingModel,
  RerankModel,
  LLMModel,
} from './types';
import {
  EMBEDDING_PRICING,
  RERANK_PRICING,
  LLM_PRICING,
  getCheapestEmbeddingModel,
  getCheapestRerankModel,
  getCheapestLLMModel,
  getModelsByPrice,
  getModelsByQuality,
} from './pricing';
import {
  estimatePlanCost,
  calculatePlanQuality,
  estimateLatency,
  type EstimationParams,
} from './estimator';

// ============================================
// Plan Templates by Quality Tier
// ============================================

const TIER_TEMPLATES: Record<QualityTier, Partial<RetrievalPlanConfig>> = {
  economy: {
    embeddingModel: 'text-embedding-3-small',
    rerankEnabled: false,
    llmModel: 'gemini-1.5-flash',
    topK: 5,
    useCache: true,
    chunkStrategy: 'balanced',
    searchType: 'semantic',
  },
  standard: {
    embeddingModel: 'text-embedding-3-small',
    rerankEnabled: true,
    rerankModel: 'jina-reranker-v2',
    llmModel: 'gpt-4o-mini',
    topK: 10,
    useCache: true,
    chunkStrategy: 'balanced',
    searchType: 'hybrid',
  },
  premium: {
    embeddingModel: 'text-embedding-3-large',
    rerankEnabled: true,
    rerankModel: 'cohere-rerank-v3',
    llmModel: 'claude-3-5-sonnet',
    topK: 20,
    useCache: true,
    chunkStrategy: 'semantic',
    searchType: 'hybrid',
  },
};

// ============================================
// Plan Optimizer
// ============================================

/**
 * Optimize a retrieval plan for a given budget
 */
export function optimizeForBudget(
  budget: number,
  constraints: PlanConstraints = { maxCostPerQuery: budget },
  estimationParams: EstimationParams = {
    queryLength: 100,
    expectedChunks: 50,
    includeRag: false,
  }
): OptimizedPlan {
  const maxCost = constraints.maxCostPerQuery ?? budget;
  const minQuality = constraints.minQuality ?? 0.5;

  // Start with economy tier and upgrade if budget allows
  let bestPlan = createBasePlan('economy');
  let bestEstimate = estimatePlanCost(bestPlan, estimationParams);
  let bestQuality = calculatePlanQuality(bestPlan);
  const tradeoffs: string[] = [];

  // Apply required constraints
  if (constraints.requiredSearchType) {
    bestPlan.searchType = constraints.requiredSearchType;
  }
  if (constraints.requiredEmbeddingModel) {
    bestPlan.embeddingModel = constraints.requiredEmbeddingModel;
  }
  if (constraints.minTopK) {
    bestPlan.topK = Math.max(bestPlan.topK, constraints.minTopK);
  }
  if (constraints.maxTopK) {
    bestPlan.topK = Math.min(bestPlan.topK, constraints.maxTopK);
  }

  // Re-estimate with constraints applied
  bestEstimate = estimatePlanCost(bestPlan, estimationParams);

  // If we're already over budget, try to reduce
  if (bestEstimate.total > maxCost) {
    const reducedPlan = reducePlanCost(bestPlan, maxCost, estimationParams, constraints);
    if (reducedPlan) {
      bestPlan = reducedPlan.plan;
      bestEstimate = reducedPlan.estimate;
      tradeoffs.push(...reducedPlan.tradeoffs);
    }
  }

  // If under budget, try to upgrade
  if (bestEstimate.total < maxCost * 0.8) {
    const upgradedPlan = upgradePlan(
      bestPlan,
      maxCost - bestEstimate.total,
      estimationParams,
      constraints
    );
    if (upgradedPlan && upgradedPlan.quality > bestQuality) {
      bestPlan = upgradedPlan.plan;
      bestEstimate = upgradedPlan.estimate;
      bestQuality = upgradedPlan.quality;
      tradeoffs.push(...upgradedPlan.improvements);
    }
  }

  // Check if reranking is required
  if (constraints.mustRerank && !bestPlan.rerankEnabled) {
    bestPlan.rerankEnabled = true;
    bestPlan.rerankModel = getCheapestRerankModel(minQuality) ?? 'jina-reranker-v2';
    bestEstimate = estimatePlanCost(bestPlan, estimationParams);
    tradeoffs.push('Reranking enabled as required');
  }

  // Final quality check
  bestQuality = calculatePlanQuality(bestPlan);
  const estimatedLatency = estimateLatency(bestPlan, {
    includeRag: estimationParams.includeRag,
  });

  // Check if we meet minimum quality
  const meetsQuality = bestQuality >= minQuality;
  const meetsLatency = !constraints.maxLatencyMs || estimatedLatency <= constraints.maxLatencyMs;

  if (!meetsQuality) {
    tradeoffs.push(`Quality ${(bestQuality * 100).toFixed(0)}% below target ${(minQuality * 100).toFixed(0)}%`);
  }
  if (!meetsLatency) {
    tradeoffs.push(`Latency ${estimatedLatency}ms exceeds limit ${constraints.maxLatencyMs}ms`);
  }

  return {
    plan: bestPlan,
    estimatedCost: bestEstimate.total,
    estimatedQuality: bestQuality,
    estimatedLatencyMs: estimatedLatency,
    tradeoffs,
    isFallback: !meetsQuality || !meetsLatency,
    limitationReason: !meetsQuality
      ? 'Budget too low for required quality'
      : !meetsLatency
        ? 'Cannot meet latency requirements'
        : undefined,
  };
}

/**
 * Create base plan from quality tier
 */
function createBasePlan(tier: QualityTier): RetrievalPlanConfig {
  const template = TIER_TEMPLATES[tier];
  return {
    embeddingModel: template.embeddingModel ?? 'text-embedding-3-small',
    rerankEnabled: template.rerankEnabled ?? false,
    rerankModel: template.rerankModel,
    llmModel: template.llmModel ?? 'gpt-4o-mini',
    topK: template.topK ?? 10,
    useCache: template.useCache ?? true,
    chunkStrategy: template.chunkStrategy ?? 'balanced',
    searchType: template.searchType ?? 'hybrid',
    qualityTier: tier,
  };
}

/**
 * Reduce plan cost to fit budget
 */
function reducePlanCost(
  plan: RetrievalPlanConfig,
  maxCost: number,
  estimationParams: EstimationParams,
  constraints: PlanConstraints
): { plan: RetrievalPlanConfig; estimate: ReturnType<typeof estimatePlanCost>; tradeoffs: string[] } | null {
  const newPlan = { ...plan };
  const tradeoffs: string[] = [];

  // Strategy: Remove expensive features until we fit budget

  // 1. Disable reranking if not required
  if (newPlan.rerankEnabled && !constraints.mustRerank) {
    newPlan.rerankEnabled = false;
    newPlan.rerankModel = undefined;
    const estimate = estimatePlanCost(newPlan, estimationParams);
    if (estimate.total <= maxCost) {
      tradeoffs.push('Disabled reranking to fit budget');
      return { plan: newPlan, estimate, tradeoffs };
    }
  }

  // 2. Switch to cheaper embedding model
  const embeddingsByPrice = getModelsByPrice().embedding;
  for (const model of embeddingsByPrice) {
    if (constraints.requiredEmbeddingModel) break;
    newPlan.embeddingModel = model;
    const estimate = estimatePlanCost(newPlan, estimationParams);
    if (estimate.total <= maxCost) {
      if (model !== plan.embeddingModel) {
        tradeoffs.push(`Switched to cheaper embedding model: ${model}`);
      }
      return { plan: newPlan, estimate, tradeoffs };
    }
  }

  // 3. Switch to cheaper LLM
  if (estimationParams.includeRag) {
    const llmsByPrice = getModelsByPrice().llm;
    for (const model of llmsByPrice) {
      newPlan.llmModel = model;
      const estimate = estimatePlanCost(newPlan, estimationParams);
      if (estimate.total <= maxCost) {
        if (model !== plan.llmModel) {
          tradeoffs.push(`Switched to cheaper LLM: ${model}`);
        }
        return { plan: newPlan, estimate, tradeoffs };
      }
    }
  }

  // 4. Reduce topK
  const minTopK = constraints.minTopK ?? 3;
  while (newPlan.topK > minTopK) {
    newPlan.topK = Math.max(minTopK, Math.floor(newPlan.topK * 0.7));
    const estimate = estimatePlanCost(newPlan, estimationParams);
    if (estimate.total <= maxCost) {
      tradeoffs.push(`Reduced results to ${newPlan.topK}`);
      return { plan: newPlan, estimate, tradeoffs };
    }
  }

  // Could not fit budget
  return null;
}

/**
 * Upgrade plan with additional budget
 */
function upgradePlan(
  plan: RetrievalPlanConfig,
  additionalBudget: number,
  estimationParams: EstimationParams,
  constraints: PlanConstraints
): { plan: RetrievalPlanConfig; estimate: ReturnType<typeof estimatePlanCost>; quality: number; improvements: string[] } | null {
  const newPlan = { ...plan };
  const improvements: string[] = [];
  const currentEstimate = estimatePlanCost(plan, estimationParams);
  const targetCost = currentEstimate.total + additionalBudget;

  // Try upgrades in order of impact

  // 1. Enable reranking if disabled
  if (!newPlan.rerankEnabled) {
    newPlan.rerankEnabled = true;
    newPlan.rerankModel = getCheapestRerankModel(0.8) ?? 'jina-reranker-v2';
    const estimate = estimatePlanCost(newPlan, estimationParams);
    if (estimate.total <= targetCost) {
      improvements.push('Enabled reranking for better relevance');
    } else {
      newPlan.rerankEnabled = false;
      newPlan.rerankModel = undefined;
    }
  }

  // 2. Upgrade embedding model
  if (!constraints.requiredEmbeddingModel) {
    const embeddingsByQuality = getModelsByQuality().embedding;
    for (const model of embeddingsByQuality) {
      const pricing = EMBEDDING_PRICING[model];
      if (pricing.qualityScore <= EMBEDDING_PRICING[newPlan.embeddingModel].qualityScore) {
        continue;
      }
      const testPlan = { ...newPlan, embeddingModel: model };
      const estimate = estimatePlanCost(testPlan, estimationParams);
      if (estimate.total <= targetCost) {
        newPlan.embeddingModel = model;
        improvements.push(`Upgraded embedding to ${model}`);
        break;
      }
    }
  }

  // 3. Upgrade LLM
  if (estimationParams.includeRag && newPlan.llmModel) {
    const llmsByQuality = getModelsByQuality().llm;
    for (const model of llmsByQuality) {
      const pricing = LLM_PRICING[model];
      if (pricing.qualityScore <= LLM_PRICING[newPlan.llmModel].qualityScore) {
        continue;
      }
      const testPlan = { ...newPlan, llmModel: model };
      const estimate = estimatePlanCost(testPlan, estimationParams);
      if (estimate.total <= targetCost) {
        newPlan.llmModel = model;
        improvements.push(`Upgraded LLM to ${model}`);
        break;
      }
    }
  }

  // 4. Increase topK
  const maxTopK = constraints.maxTopK ?? 30;
  const testTopK = Math.min(maxTopK, newPlan.topK + 5);
  const testPlan = { ...newPlan, topK: testTopK };
  const estimate = estimatePlanCost(testPlan, estimationParams);
  if (estimate.total <= targetCost && testTopK > newPlan.topK) {
    newPlan.topK = testTopK;
    improvements.push(`Increased results to ${testTopK}`);
  }

  if (improvements.length === 0) {
    return null;
  }

  const finalEstimate = estimatePlanCost(newPlan, estimationParams);
  const finalQuality = calculatePlanQuality(newPlan);

  return {
    plan: newPlan,
    estimate: finalEstimate,
    quality: finalQuality,
    improvements,
  };
}

// ============================================
// Upgrade Suggestions
// ============================================

/**
 * Suggest upgrades for additional budget
 */
export function suggestUpgrades(
  currentPlan: RetrievalPlanConfig,
  additionalBudget: number,
  estimationParams: EstimationParams = {
    queryLength: 100,
    expectedChunks: 50,
    includeRag: false,
  }
): UpgradeSuggestion[] {
  const suggestions: UpgradeSuggestion[] = [];
  const currentEstimate = estimatePlanCost(currentPlan, estimationParams);
  const currentQuality = calculatePlanQuality(currentPlan);

  // 1. Suggest enabling reranking
  if (!currentPlan.rerankEnabled) {
    const rerankModels = getModelsByPrice().rerank;
    for (const model of rerankModels) {
      const testPlan = { ...currentPlan, rerankEnabled: true, rerankModel: model };
      const estimate = estimatePlanCost(testPlan, estimationParams);
      const extraCost = estimate.total - currentEstimate.total;

      if (extraCost <= additionalBudget) {
        const newQuality = calculatePlanQuality(testPlan);
        suggestions.push({
          current: { rerankEnabled: false },
          suggested: { rerankEnabled: true, rerankModel: model },
          additionalCost: extraCost,
          qualityImprovement: newQuality - currentQuality,
          description: `Enable ${model} reranking for better result relevance`,
          priority: 10,
        });
        break;
      }
    }
  }

  // 2. Suggest embedding model upgrade
  const embeddingsByQuality = getModelsByQuality().embedding;
  for (const model of embeddingsByQuality) {
    const pricing = EMBEDDING_PRICING[model];
    if (pricing.qualityScore <= EMBEDDING_PRICING[currentPlan.embeddingModel].qualityScore) {
      continue;
    }

    const testPlan = { ...currentPlan, embeddingModel: model };
    const estimate = estimatePlanCost(testPlan, estimationParams);
    const extraCost = estimate.total - currentEstimate.total;

    if (extraCost <= additionalBudget && extraCost > 0) {
      const newQuality = calculatePlanQuality(testPlan);
      suggestions.push({
        current: { embeddingModel: currentPlan.embeddingModel },
        suggested: { embeddingModel: model },
        additionalCost: extraCost,
        qualityImprovement: newQuality - currentQuality,
        description: `Upgrade to ${model} for better semantic understanding`,
        priority: 8,
      });
      break;
    }
  }

  // 3. Suggest LLM upgrade
  if (currentPlan.llmModel && estimationParams.includeRag) {
    const llmsByQuality = getModelsByQuality().llm;
    for (const model of llmsByQuality) {
      const pricing = LLM_PRICING[model];
      if (pricing.qualityScore <= LLM_PRICING[currentPlan.llmModel].qualityScore) {
        continue;
      }

      const testPlan = { ...currentPlan, llmModel: model };
      const estimate = estimatePlanCost(testPlan, estimationParams);
      const extraCost = estimate.total - currentEstimate.total;

      if (extraCost <= additionalBudget && extraCost > 0) {
        const newQuality = calculatePlanQuality(testPlan);
        suggestions.push({
          current: { llmModel: currentPlan.llmModel },
          suggested: { llmModel: model },
          additionalCost: extraCost,
          qualityImprovement: newQuality - currentQuality,
          description: `Upgrade to ${model} for better RAG responses`,
          priority: 7,
        });
        break;
      }
    }
  }

  // 4. Suggest topK increase
  const topKIncrement = 5;
  if (currentPlan.topK < 25) {
    const testPlan = { ...currentPlan, topK: currentPlan.topK + topKIncrement };
    const estimate = estimatePlanCost(testPlan, estimationParams);
    const extraCost = estimate.total - currentEstimate.total;

    if (extraCost <= additionalBudget) {
      const newQuality = calculatePlanQuality(testPlan);
      suggestions.push({
        current: { topK: currentPlan.topK },
        suggested: { topK: testPlan.topK },
        additionalCost: extraCost,
        qualityImprovement: newQuality - currentQuality,
        description: `Retrieve ${topKIncrement} more results for broader coverage`,
        priority: 5,
      });
    }
  }

  // Sort by quality improvement / cost ratio
  suggestions.sort((a, b) => {
    const ratioA = a.additionalCost > 0 ? a.qualityImprovement / a.additionalCost : a.qualityImprovement;
    const ratioB = b.additionalCost > 0 ? b.qualityImprovement / b.additionalCost : b.qualityImprovement;
    return ratioB - ratioA;
  });

  return suggestions;
}

/**
 * Get alternative plans at different price points
 */
export function getAlternativePlans(
  budget: number,
  estimationParams: EstimationParams = {
    queryLength: 100,
    expectedChunks: 50,
    includeRag: false,
  }
): OptimizedPlan[] {
  const alternatives: OptimizedPlan[] = [];

  // Generate plans at 50%, 100%, 150%, 200% of budget
  const multipliers = [0.5, 1.0, 1.5, 2.0];

  for (const mult of multipliers) {
    const targetBudget = budget * mult;
    const plan = optimizeForBudget(targetBudget, { maxCostPerQuery: targetBudget }, estimationParams);
    alternatives.push(plan);
  }

  // Remove duplicates (same configuration)
  const seen = new Set<string>();
  return alternatives.filter(p => {
    const key = JSON.stringify(p.plan);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Get plan for specific quality tier
 */
export function getPlanForTier(
  tier: QualityTier,
  constraints?: PlanConstraints,
  estimationParams: EstimationParams = {
    queryLength: 100,
    expectedChunks: 50,
    includeRag: false,
  }
): OptimizedPlan {
  const basePlan = createBasePlan(tier);

  // Apply constraints
  if (constraints?.requiredSearchType) {
    basePlan.searchType = constraints.requiredSearchType;
  }
  if (constraints?.requiredEmbeddingModel) {
    basePlan.embeddingModel = constraints.requiredEmbeddingModel;
  }
  if (constraints?.minTopK) {
    basePlan.topK = Math.max(basePlan.topK, constraints.minTopK);
  }
  if (constraints?.maxTopK) {
    basePlan.topK = Math.min(basePlan.topK, constraints.maxTopK);
  }
  if (constraints?.mustRerank) {
    basePlan.rerankEnabled = true;
    basePlan.rerankModel = basePlan.rerankModel ?? getCheapestRerankModel(0.8) ?? 'jina-reranker-v2';
  }

  const estimate = estimatePlanCost(basePlan, estimationParams);
  const quality = calculatePlanQuality(basePlan);
  const latency = estimateLatency(basePlan, { includeRag: estimationParams.includeRag });

  return {
    plan: basePlan,
    estimatedCost: estimate.total,
    estimatedQuality: quality,
    estimatedLatencyMs: latency,
    tradeoffs: [],
    isFallback: false,
  };
}
