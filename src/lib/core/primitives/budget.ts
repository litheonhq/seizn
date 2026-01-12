/**
 * Seizn Core - Budget Manager
 *
 * Enforces guardrails per request:
 * - latency_budget_ms
 * - cost_budget
 * - max_candidates
 * - max_rerank_n
 * - max_context_tokens
 */

import type { BudgetConfig, RequestBudget, BudgetUsage } from './types';

// Default budgets by plan
const PLAN_DEFAULTS: Record<string, BudgetConfig> = {
  free: {
    latencyBudgetMs: 3000,
    costBudget: 10,
    maxCandidates: 50,
    maxRerankN: 20,
    maxContextTokens: 4000,
    maxConcurrentRequests: 5,
  },
  pro: {
    latencyBudgetMs: 5000,
    costBudget: 100,
    maxCandidates: 200,
    maxRerankN: 50,
    maxContextTokens: 16000,
    maxConcurrentRequests: 20,
  },
  enterprise: {
    latencyBudgetMs: 10000,
    costBudget: 1000,
    maxCandidates: 500,
    maxRerankN: 100,
    maxContextTokens: 32000,
    maxConcurrentRequests: 100,
  },
};

/**
 * Get default budget config for a plan
 */
export function getDefaultBudget(plan: string): BudgetConfig {
  return PLAN_DEFAULTS[plan] ?? PLAN_DEFAULTS.free;
}

/**
 * Merge request-level overrides with plan defaults
 */
export function resolveBudget(plan: string, override?: RequestBudget): BudgetConfig {
  const defaults = getDefaultBudget(plan);

  if (!override) return defaults;

  return {
    latencyBudgetMs: override.latencyBudgetMs ?? defaults.latencyBudgetMs,
    costBudget: override.costBudget ?? defaults.costBudget,
    maxCandidates: Math.min(override.maxCandidates ?? defaults.maxCandidates, defaults.maxCandidates),
    maxRerankN: Math.min(override.maxRerankN ?? defaults.maxRerankN, defaults.maxRerankN),
    maxContextTokens: Math.min(
      override.maxContextTokens ?? defaults.maxContextTokens,
      defaults.maxContextTokens
    ),
    maxConcurrentRequests: defaults.maxConcurrentRequests, // Not overridable
  };
}

/**
 * Check if usage is within budget
 */
export function checkBudget(
  requestId: string,
  budget: BudgetConfig,
  usage: {
    latencyMs: number;
    costCredits: number;
    candidatesRetrieved: number;
    documentsReranked: number;
    contextTokens: number;
  }
): BudgetUsage {
  const violations: string[] = [];

  if (usage.latencyMs > budget.latencyBudgetMs) {
    violations.push(`latency ${usage.latencyMs}ms exceeds budget ${budget.latencyBudgetMs}ms`);
  }

  if (usage.costCredits > budget.costBudget) {
    violations.push(`cost ${usage.costCredits} exceeds budget ${budget.costBudget}`);
  }

  if (usage.candidatesRetrieved > budget.maxCandidates) {
    violations.push(`candidates ${usage.candidatesRetrieved} exceeds max ${budget.maxCandidates}`);
  }

  if (usage.documentsReranked > budget.maxRerankN) {
    violations.push(`rerank N ${usage.documentsReranked} exceeds max ${budget.maxRerankN}`);
  }

  if (usage.contextTokens > budget.maxContextTokens) {
    violations.push(`context tokens ${usage.contextTokens} exceeds max ${budget.maxContextTokens}`);
  }

  return {
    requestId,
    allocatedBudget: budget,
    actualUsage: usage,
    withinBudget: violations.length === 0,
    violations,
  };
}

/**
 * Estimate cost in credits for an operation
 */
export function estimateCost(params: {
  embeddingTokens?: number;
  searchQueries?: number;
  rerankDocuments?: number;
  storageAddedMb?: number;
}): number {
  let credits = 0;

  // Embedding: 0.01 credits per 1000 tokens
  if (params.embeddingTokens) {
    credits += (params.embeddingTokens / 1000) * 0.01;
  }

  // Search: 0.1 credits per query
  if (params.searchQueries) {
    credits += params.searchQueries * 0.1;
  }

  // Rerank: 0.05 credits per document
  if (params.rerankDocuments) {
    credits += params.rerankDocuments * 0.05;
  }

  // Storage: 0.5 credits per MB/month (prorated)
  if (params.storageAddedMb) {
    credits += params.storageAddedMb * 0.5;
  }

  return Math.round(credits * 1000) / 1000; // Round to 3 decimal places
}

/**
 * Apply budget limits to retrieval config
 */
export function applyBudgetLimits(
  config: {
    topK: number;
    rerankTopN?: number;
    maxTokens?: number;
  },
  budget: BudgetConfig
): {
  topK: number;
  rerankTopN: number;
  maxTokens: number;
} {
  return {
    topK: Math.min(config.topK, budget.maxCandidates),
    rerankTopN: Math.min(config.rerankTopN ?? config.topK, budget.maxRerankN),
    maxTokens: Math.min(config.maxTokens ?? budget.maxContextTokens, budget.maxContextTokens),
  };
}
