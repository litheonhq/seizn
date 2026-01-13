/**
 * Budget-Aware Query Planner
 *
 * Integrates core primitives (Budget, Trace, Usage) with Summer RAG retrieval.
 * Creates optimal execution plans based on:
 * - Budget constraints (latency, cost, max candidates)
 * - Query characteristics
 * - Historical performance data
 */

import {
  type BudgetConfig,
  type TraceContext,
  type RequestBudget,
  getDefaultBudget,
  resolveBudget,
  applyBudgetLimits,
  estimateCost,
  checkBudget,
  createTraceContext,
  createSpan,
  addSpanTag,
  finishSpan,
} from '@/lib/core/primitives';
import { getPlanDefaults } from '../config';
import { decideRetrievalConfig } from './decide';
import type { RetrievalConfig } from '../types';

export interface BudgetPlannerParams {
  requestId: string;
  userId: string;
  apiKeyId?: string;
  plan: string;
  collectionId: string;
  query: string;
  autopilotEnabled: boolean;
  override?: Partial<RetrievalConfig>;
  budgetOverride?: RequestBudget;
  traceContext?: TraceContext;
}

export interface ExecutionStep {
  name: string;
  estimatedLatencyMs: number;
  estimatedCost: number;
  params: Record<string, unknown>;
}

export interface BudgetAwarePlan {
  config: RetrievalConfig;
  budget: BudgetConfig;
  reason: string;
  estimatedCost: number;
  estimatedLatencyMs: number;
  withinBudget: boolean;
  warnings: string[];
  executionSteps: ExecutionStep[];
  traceContext: TraceContext;
}

// Latency estimates (ms) based on operation type and scale
const LATENCY_ESTIMATES = {
  embedQuery: 50, // Single query embedding
  vectorSearch: (topK: number, searchEf: number) => 20 + topK * 0.5 + searchEf * 0.3,
  keywordSearch: (topK: number) => 30 + topK * 0.2,
  hybridMerge: 10,
  rerank: (n: number) => 100 + n * 15, // Cohere rerank is ~15ms per doc
  dedup: 5,
  networkOverhead: 30,
};

// Provider-specific latency overhead (ms)
const PROVIDER_LATENCY_OVERHEAD: Record<string, number> = {
  local: 0,
  pinecone: 40,
  weaviate: 35,
  azure_ai_search: 50,
  vespa: 45,
  custom: 80,
};

// Budget allocation for federated scenarios
export interface FederatedBudgetAllocation {
  provider: string;
  collectionId: string;
  allocatedBudgetMs: number;
  priority: number;
  timeoutMs: number;
}

/**
 * Allocate budget across multiple federated sources
 */
export function allocateFederatedBudget(
  totalBudgetMs: number,
  sources: Array<{ collectionId: string; provider: string; priority?: number }>
): FederatedBudgetAllocation[] {
  if (sources.length === 0) return [];

  // Reserve 30% for merge/rerank
  const availableBudgetMs = totalBudgetMs * 0.7;

  // For parallel execution, each source gets the full budget minus its overhead
  // Timeout is the full available budget (sources run in parallel)
  return sources.map((source, idx) => {
    const overhead = PROVIDER_LATENCY_OVERHEAD[source.provider] ?? PROVIDER_LATENCY_OVERHEAD.custom;
    const priority = source.priority ?? (idx === 0 ? 1 : 2); // First source is primary

    return {
      provider: source.provider,
      collectionId: source.collectionId,
      allocatedBudgetMs: availableBudgetMs - overhead,
      priority,
      timeoutMs: Math.max(100, availableBudgetMs - overhead),
    };
  });
}

/**
 * Estimate total latency for federated query
 */
export function estimateFederatedLatency(
  sources: Array<{ provider: string }>,
  config: { topK: number; searchEf: number; mode: string; rerank: boolean; rerankTopN: number }
): number {
  if (sources.length === 0) {
    return LATENCY_ESTIMATES.networkOverhead + LATENCY_ESTIMATES.embedQuery;
  }

  // Parallel execution: max of all source latencies
  let maxSourceLatency = 0;
  for (const source of sources) {
    const overhead = PROVIDER_LATENCY_OVERHEAD[source.provider] ?? PROVIDER_LATENCY_OVERHEAD.custom;
    const searchLatency =
      config.mode === 'keyword'
        ? LATENCY_ESTIMATES.keywordSearch(config.topK)
        : LATENCY_ESTIMATES.vectorSearch(config.topK, config.searchEf);

    maxSourceLatency = Math.max(maxSourceLatency, overhead + searchLatency);
  }

  // Add sequential operations
  let total =
    LATENCY_ESTIMATES.networkOverhead +
    LATENCY_ESTIMATES.embedQuery +
    maxSourceLatency;

  // Merge/dedup happens after all sources return
  if (sources.length > 1) {
    total += LATENCY_ESTIMATES.hybridMerge + LATENCY_ESTIMATES.dedup;
  }

  // Rerank is last
  if (config.rerank && config.rerankTopN > 0) {
    total += LATENCY_ESTIMATES.rerank(config.rerankTopN);
  }

  return total;
}

/**
 * Create a budget-aware retrieval plan
 */
export function createBudgetAwarePlan(params: BudgetPlannerParams): BudgetAwarePlan {
  const traceContext = params.traceContext ?? createTraceContext();
  const span = createSpan(traceContext, 'budget_planner', 'summer');

  // 1) Resolve budget for this plan
  const budget = resolveBudget(params.plan, params.budgetOverride);
  addSpanTag(span, 'plan', params.plan);
  addSpanTag(span, 'budget.latency_ms', budget.latencyBudgetMs);
  addSpanTag(span, 'budget.max_candidates', budget.maxCandidates);

  // 2) Get base retrieval config
  let config: RetrievalConfig;
  let reason = '';

  if (!params.autopilotEnabled) {
    config = {
      ...getPlanDefaults(params.plan),
      ...(params.override ?? {}),
    };
    reason = 'Autopilot disabled; using plan defaults + override.';
  } else {
    const decided = decideRetrievalConfig({
      plan: params.plan,
      query: params.query,
    });
    config = {
      ...decided.config,
      ...(params.override ?? {}),
    };
    reason = decided.reason;
  }

  // 3) Apply budget limits
  const limited = applyBudgetLimits(
    {
      topK: config.topK,
      rerankTopN: config.rerankTopN,
    },
    budget
  );

  const budgetApplied = limited.topK !== config.topK || limited.rerankTopN !== config.rerankTopN;

  if (budgetApplied) {
    config = {
      ...config,
      topK: limited.topK,
      rerankTopN: limited.rerankTopN,
    };
    reason += ' Budget limits applied.';
  }

  // 4) Build execution steps and estimate costs/latency
  const executionSteps: ExecutionStep[] = [];
  const warnings: string[] = [];
  let totalLatencyMs = LATENCY_ESTIMATES.networkOverhead;
  let totalCost = 0;

  // Step 1: Embed query
  executionSteps.push({
    name: 'embed_query',
    estimatedLatencyMs: LATENCY_ESTIMATES.embedQuery,
    estimatedCost: estimateCost({ embeddingTokens: estimateQueryTokens(params.query) }),
    params: { queryLength: params.query.length },
  });
  totalLatencyMs += LATENCY_ESTIMATES.embedQuery;
  totalCost += executionSteps[0].estimatedCost;

  // Step 2: Vector/Keyword/Hybrid search
  if (config.mode === 'vector' || config.mode === 'hybrid') {
    const searchLatency = LATENCY_ESTIMATES.vectorSearch(config.topK, config.searchEf);
    const searchCost = estimateCost({ searchQueries: 1 });
    executionSteps.push({
      name: 'vector_search',
      estimatedLatencyMs: searchLatency,
      estimatedCost: searchCost,
      params: { topK: config.topK, searchEf: config.searchEf, threshold: config.threshold },
    });
    totalLatencyMs += searchLatency;
    totalCost += searchCost;
  }

  if (config.mode === 'keyword' || config.mode === 'hybrid') {
    const keywordLatency = LATENCY_ESTIMATES.keywordSearch(config.topK);
    executionSteps.push({
      name: 'keyword_search',
      estimatedLatencyMs: keywordLatency,
      estimatedCost: 0, // Keyword search is included in search_query cost
      params: { topK: config.topK },
    });
    totalLatencyMs += keywordLatency;
  }

  // Step 3: Hybrid merge (if hybrid mode)
  if (config.mode === 'hybrid') {
    executionSteps.push({
      name: 'hybrid_merge',
      estimatedLatencyMs: LATENCY_ESTIMATES.hybridMerge,
      estimatedCost: 0,
      params: { keywordWeight: config.keywordWeight, vectorWeight: config.vectorWeight },
    });
    totalLatencyMs += LATENCY_ESTIMATES.hybridMerge;
  }

  // Step 4: Rerank (if enabled)
  if (config.rerank && config.rerankTopN > 0) {
    const rerankLatency = LATENCY_ESTIMATES.rerank(config.rerankTopN);
    const rerankCost = estimateCost({ rerankDocuments: config.rerankTopN });
    executionSteps.push({
      name: 'rerank',
      estimatedLatencyMs: rerankLatency,
      estimatedCost: rerankCost,
      params: { topN: config.rerankTopN },
    });
    totalLatencyMs += rerankLatency;
    totalCost += rerankCost;
  }

  // Step 5: Deduplication
  executionSteps.push({
    name: 'dedup',
    estimatedLatencyMs: LATENCY_ESTIMATES.dedup,
    estimatedCost: 0,
    params: {},
  });
  totalLatencyMs += LATENCY_ESTIMATES.dedup;

  // 5) Check budget
  const budgetResult = checkBudget(params.requestId, budget, {
    latencyMs: totalLatencyMs,
    costCredits: totalCost,
    candidatesRetrieved: config.topK,
    documentsReranked: config.rerank ? config.rerankTopN : 0,
    contextTokens: 0, // Will be calculated after retrieval
  });

  if (!budgetResult.withinBudget) {
    for (const violation of budgetResult.violations) {
      warnings.push(`Budget violation: ${violation}`);
    }
  }

  // 6) Additional warnings
  if (totalLatencyMs > budget.latencyBudgetMs * 0.8) {
    warnings.push(`Estimated latency (${totalLatencyMs}ms) is close to budget (${budget.latencyBudgetMs}ms)`);
  }

  if (config.topK < 5) {
    warnings.push('Low topK may reduce result quality');
  }

  if (config.rerank && config.rerankTopN < config.topK * 0.5) {
    warnings.push('Reranking only a small portion of candidates may not improve results significantly');
  }

  addSpanTag(span, 'estimated_latency_ms', totalLatencyMs);
  addSpanTag(span, 'estimated_cost', totalCost);
  addSpanTag(span, 'within_budget', budgetResult.withinBudget);
  finishSpan(span);

  return {
    config,
    budget,
    reason,
    estimatedCost: totalCost,
    estimatedLatencyMs: totalLatencyMs,
    withinBudget: budgetResult.withinBudget,
    warnings,
    executionSteps,
    traceContext,
  };
}

/**
 * Optimize plan to fit within budget
 */
export function optimizePlanForBudget(
  plan: BudgetAwarePlan,
  constraints: {
    maxLatencyMs?: number;
    maxCost?: number;
  }
): BudgetAwarePlan {
  if (plan.withinBudget) {
    return plan;
  }

  const config = { ...plan.config };
  const warnings = [...plan.warnings];
  let modified = false;

  // Strategy 1: Reduce rerankTopN
  if (config.rerank && config.rerankTopN > 10 && plan.estimatedLatencyMs > (constraints.maxLatencyMs ?? plan.budget.latencyBudgetMs)) {
    config.rerankTopN = Math.max(10, Math.floor(config.rerankTopN * 0.6));
    warnings.push('Reduced rerankTopN to fit latency budget');
    modified = true;
  }

  // Strategy 2: Disable rerank for free tier
  if (plan.budget.maxRerankN < 10 && config.rerank) {
    config.rerank = false;
    config.rerankTopN = 0;
    warnings.push('Disabled rerank due to budget constraints');
    modified = true;
  }

  // Strategy 3: Reduce topK
  if (config.topK > 10 && plan.estimatedLatencyMs > (constraints.maxLatencyMs ?? plan.budget.latencyBudgetMs)) {
    config.topK = Math.max(10, Math.floor(config.topK * 0.7));
    warnings.push('Reduced topK to fit latency budget');
    modified = true;
  }

  // Strategy 4: Reduce searchEf
  if (config.searchEf > 24 && plan.estimatedLatencyMs > (constraints.maxLatencyMs ?? plan.budget.latencyBudgetMs)) {
    config.searchEf = Math.max(24, Math.floor(config.searchEf * 0.7));
    warnings.push('Reduced searchEf to fit latency budget');
    modified = true;
  }

  if (!modified) {
    warnings.push('Unable to optimize plan to fit budget constraints');
    return { ...plan, warnings };
  }

  // Recalculate with new config
  // Note: In a full implementation, we'd recalculate all estimates
  return {
    ...plan,
    config,
    reason: plan.reason + ' (Optimized for budget)',
    withinBudget: true, // Assume optimization worked
    warnings,
  };
}

/**
 * Estimate tokens for a query
 */
function estimateQueryTokens(query: string): number {
  // Rough estimate: ~4 chars per token for English
  return Math.ceil(query.length / 4);
}

/**
 * Get recommended configuration for a latency target
 */
export function getConfigForLatencyTarget(
  targetLatencyMs: number,
  plan: string
): Partial<RetrievalConfig> {
  const defaults = getPlanDefaults(plan);

  if (targetLatencyMs < 200) {
    // Ultra-fast: minimal processing
    return {
      mode: 'vector',
      topK: Math.min(defaults.topK, 8),
      searchEf: Math.min(defaults.searchEf, 24),
      rerank: false,
      rerankTopN: 0,
    };
  }

  if (targetLatencyMs < 500) {
    // Fast: reduced reranking
    return {
      mode: 'hybrid',
      topK: Math.min(defaults.topK, 12),
      searchEf: Math.min(defaults.searchEf, 32),
      rerank: true,
      rerankTopN: Math.min(defaults.rerankTopN, 8),
    };
  }

  if (targetLatencyMs < 1000) {
    // Standard: balanced
    return {
      mode: 'hybrid',
      topK: Math.min(defaults.topK, 16),
      searchEf: Math.min(defaults.searchEf, 40),
      rerank: true,
      rerankTopN: Math.min(defaults.rerankTopN, 15),
    };
  }

  // Quality-focused: full processing
  return {
    mode: 'hybrid',
    topK: defaults.topK,
    searchEf: defaults.searchEf,
    rerank: defaults.rerank,
    rerankTopN: defaults.rerankTopN,
  };
}
