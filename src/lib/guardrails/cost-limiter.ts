/**
 * Cost Limiter for Seizn
 *
 * Monitors and limits daily costs per user/plan.
 * Provides auto-degradation when approaching limits.
 */

import { getPlan } from '../plan-limits';

// ============================================
// Types
// ============================================

export interface CostLimitConfig {
  /** Daily cost limit in cents */
  dailyLimitCents: number;
  /** Warning threshold percentage (0-100) */
  warningThreshold: number;
  /** Degradation threshold percentage (0-100) */
  degradationThreshold: number;
  /** Block threshold percentage (0-100) */
  blockThreshold: number;
}

export type DegradationLevel = 'full' | 'degraded' | 'blocked';

export interface CostCheckResult {
  /** Current degradation level */
  level: DegradationLevel;
  /** Current daily cost in cents */
  currentCostCents: number;
  /** Daily limit in cents */
  limitCents: number;
  /** Usage percentage (0-100) */
  usagePercentage: number;
  /** Features that are disabled due to degradation */
  disabledFeatures: string[];
  /** Estimated reset time (UTC midnight) */
  resetsAt: Date;
  /** Human-readable message */
  message: string;
}

export interface CostEntry {
  userId: string;
  costCents: number;
  timestamp: Date;
  operation: string;
}

// ============================================
// Cost Limit Configuration by Plan
// ============================================

export const COST_LIMITS: Record<string, CostLimitConfig> = {
  free: {
    dailyLimitCents: 50,        // $0.50/day
    warningThreshold: 70,
    degradationThreshold: 85,
    blockThreshold: 100,
  },
  starter: {
    dailyLimitCents: 300,       // $3.00/day
    warningThreshold: 75,
    degradationThreshold: 90,
    blockThreshold: 100,
  },
  plus: {
    dailyLimitCents: 1000,      // $10.00/day
    warningThreshold: 80,
    degradationThreshold: 95,
    blockThreshold: 110, // Allow 10% overage
  },
  pro: {
    dailyLimitCents: 5000,      // $50.00/day
    warningThreshold: 80,
    degradationThreshold: 95,
    blockThreshold: 120, // Allow 20% overage
  },
  enterprise: {
    dailyLimitCents: -1,        // Unlimited (custom billing)
    warningThreshold: 0,
    degradationThreshold: 0,
    blockThreshold: 0,
  },
};

// Expensive features to disable during degradation
const EXPENSIVE_FEATURES = [
  'reranking',
  'answer_contract',
  'pii_detection',
  'autopilot',
];

// Features to keep even during degradation (core functionality)
const CORE_FEATURES = [
  'hybrid_search',
  'rag_query',
  'search',
];

// ============================================
// Cost Tracking Store
// ============================================

// In-memory daily cost tracking
// Key: userId:YYYY-MM-DD, Value: total cost in cents
const dailyCostStore = new Map<string, number>();

// Detailed cost entries for debugging
const costEntriesStore = new Map<string, CostEntry[]>();

/**
 * Get today's date key in UTC
 */
function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get the store key for a user
 */
function getUserDayKey(userId: string): string {
  return `${userId}:${getTodayKey()}`;
}

/**
 * Get next UTC midnight as reset time
 */
function getNextResetTime(): Date {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow;
}

// ============================================
// Cost Limiter Functions
// ============================================

/**
 * Get cost limit config for a plan
 */
export function getCostLimitConfig(plan: string): CostLimitConfig {
  return COST_LIMITS[plan] || COST_LIMITS.free;
}

/**
 * Get current daily cost for a user
 */
export function getDailyCost(userId: string): number {
  const key = getUserDayKey(userId);
  return dailyCostStore.get(key) || 0;
}

/**
 * Add cost for a user operation
 */
export function addCost(
  userId: string,
  costCents: number,
  operation: string = 'unknown'
): number {
  const key = getUserDayKey(userId);
  const currentCost = dailyCostStore.get(key) || 0;
  const newCost = currentCost + costCents;

  dailyCostStore.set(key, newCost);

  // Store detailed entry (keep last 100 per user per day)
  const entries = costEntriesStore.get(key) || [];
  entries.push({
    userId,
    costCents,
    timestamp: new Date(),
    operation,
  });

  // Limit entries to prevent memory bloat
  if (entries.length > 100) {
    entries.shift();
  }
  costEntriesStore.set(key, entries);

  return newCost;
}

/**
 * Check cost limit and get degradation level
 */
export function checkCostLimit(userId: string, plan: string = 'free'): CostCheckResult {
  const config = getCostLimitConfig(plan);
  const currentCostCents = getDailyCost(userId);
  const resetsAt = getNextResetTime();

  // Enterprise has unlimited budget
  if (config.dailyLimitCents === -1) {
    return {
      level: 'full',
      currentCostCents,
      limitCents: -1,
      usagePercentage: 0,
      disabledFeatures: [],
      resetsAt,
      message: 'Unlimited plan - no cost restrictions',
    };
  }

  const usagePercentage = (currentCostCents / config.dailyLimitCents) * 100;

  // Determine degradation level
  let level: DegradationLevel = 'full';
  let disabledFeatures: string[] = [];
  let message = 'Operating normally';

  if (usagePercentage >= config.blockThreshold) {
    level = 'blocked';
    disabledFeatures = [...EXPENSIVE_FEATURES, ...CORE_FEATURES];
    message = `Daily cost limit exceeded (${formatCents(currentCostCents)} / ${formatCents(config.dailyLimitCents)}). API calls blocked until ${resetsAt.toISOString()}.`;
  } else if (usagePercentage >= config.degradationThreshold) {
    level = 'degraded';
    disabledFeatures = [...EXPENSIVE_FEATURES];
    message = `Approaching daily limit (${usagePercentage.toFixed(1)}%). Expensive features disabled.`;
  } else if (usagePercentage >= config.warningThreshold) {
    level = 'full';
    message = `Warning: ${usagePercentage.toFixed(1)}% of daily limit used.`;
  }

  return {
    level,
    currentCostCents,
    limitCents: config.dailyLimitCents,
    usagePercentage: Math.min(100, usagePercentage),
    disabledFeatures,
    resetsAt,
    message,
  };
}

/**
 * Check if a specific feature is allowed under current cost limits
 */
export function isFeatureAllowedByCost(
  userId: string,
  plan: string,
  featureName: string
): { allowed: boolean; reason?: string } {
  const costCheck = checkCostLimit(userId, plan);

  if (costCheck.level === 'blocked') {
    return {
      allowed: false,
      reason: 'Daily cost limit exceeded. Please try again tomorrow or upgrade your plan.',
    };
  }

  if (costCheck.level === 'degraded' && costCheck.disabledFeatures.includes(featureName)) {
    return {
      allowed: false,
      reason: `Feature "${featureName}" is temporarily disabled due to high usage. Using basic mode.`,
    };
  }

  return { allowed: true };
}

/**
 * Estimate cost for an operation
 */
export function estimateCost(params: {
  inputTokens?: number;
  outputTokens?: number;
  embeddingTokens?: number;
  rerankItems?: number;
}): number {
  // Cost estimates in cents per unit
  const costs = {
    inputTokenPer1k: 0.3,      // $0.003/1K tokens
    outputTokenPer1k: 1.5,    // $0.015/1K tokens
    embeddingTokenPer1k: 0.02, // $0.0002/1K tokens
    rerankPerItem: 0.1,       // $0.001/item
  };

  let totalCents = 0;

  if (params.inputTokens) {
    totalCents += (params.inputTokens / 1000) * costs.inputTokenPer1k;
  }
  if (params.outputTokens) {
    totalCents += (params.outputTokens / 1000) * costs.outputTokenPer1k;
  }
  if (params.embeddingTokens) {
    totalCents += (params.embeddingTokens / 1000) * costs.embeddingTokenPer1k;
  }
  if (params.rerankItems) {
    totalCents += params.rerankItems * costs.rerankPerItem;
  }

  return Math.ceil(totalCents * 100) / 100; // Round to 2 decimal places
}

/**
 * Pre-check if an operation would exceed limits
 */
export function wouldExceedLimit(
  userId: string,
  plan: string,
  estimatedCostCents: number
): { wouldExceed: boolean; currentUsage: number; limit: number } {
  const config = getCostLimitConfig(plan);
  const currentCost = getDailyCost(userId);

  if (config.dailyLimitCents === -1) {
    return { wouldExceed: false, currentUsage: currentCost, limit: -1 };
  }

  const projectedCost = currentCost + estimatedCostCents;
  const wouldExceed = projectedCost > config.dailyLimitCents * (config.blockThreshold / 100);

  return {
    wouldExceed,
    currentUsage: currentCost,
    limit: config.dailyLimitCents,
  };
}

/**
 * Get detailed cost breakdown for a user
 */
export function getCostBreakdown(userId: string): {
  totalCents: number;
  entries: CostEntry[];
  byOperation: Record<string, number>;
} {
  const key = getUserDayKey(userId);
  const entries = costEntriesStore.get(key) || [];
  const totalCents = dailyCostStore.get(key) || 0;

  const byOperation: Record<string, number> = {};
  for (const entry of entries) {
    byOperation[entry.operation] = (byOperation[entry.operation] || 0) + entry.costCents;
  }

  return { totalCents, entries, byOperation };
}

/**
 * Reset daily costs (for testing or admin override)
 */
export function resetDailyCosts(userId: string): void {
  const key = getUserDayKey(userId);
  dailyCostStore.delete(key);
  costEntriesStore.delete(key);
}

/**
 * Cleanup old entries (run periodically)
 */
export function cleanupOldEntries(): void {
  const today = getTodayKey();
  const keysToDelete: string[] = [];

  dailyCostStore.forEach((_, key) => {
    const [, dateKey] = key.split(':');
    if (dateKey !== today) {
      keysToDelete.push(key);
    }
  });

  for (const key of keysToDelete) {
    dailyCostStore.delete(key);
    costEntriesStore.delete(key);
  }
}

// ============================================
// Auto-Degradation Logic
// ============================================

/**
 * Get degraded operation settings
 */
export function getDegradedSettings(
  costCheck: CostCheckResult
): {
  useReranking: boolean;
  usePiiDetection: boolean;
  useAnswerContract: boolean;
  maxResults: number;
  maxTokens: number;
} {
  if (costCheck.level === 'blocked') {
    return {
      useReranking: false,
      usePiiDetection: false,
      useAnswerContract: false,
      maxResults: 0,
      maxTokens: 0,
    };
  }

  if (costCheck.level === 'degraded') {
    return {
      useReranking: false,
      usePiiDetection: false,
      useAnswerContract: false,
      maxResults: 5,  // Reduced from default 10
      maxTokens: 2000, // Reduced token usage
    };
  }

  // Full mode
  return {
    useReranking: true,
    usePiiDetection: true,
    useAnswerContract: true,
    maxResults: 10,
    maxTokens: 8000,
  };
}

// ============================================
// Helpers
// ============================================

/**
 * Format cents to display string
 */
function formatCents(cents: number): string {
  if (cents === -1) return 'Unlimited';
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Get remaining budget for today
 */
export function getRemainingBudget(userId: string, plan: string): number {
  const config = getCostLimitConfig(plan);
  if (config.dailyLimitCents === -1) return -1;

  const currentCost = getDailyCost(userId);
  return Math.max(0, config.dailyLimitCents - currentCost);
}

/**
 * Check if user is near limit and should receive warning
 */
export function shouldWarnUser(userId: string, plan: string): boolean {
  const costCheck = checkCostLimit(userId, plan);
  const config = getCostLimitConfig(plan);

  return costCheck.usagePercentage >= config.warningThreshold &&
         costCheck.usagePercentage < config.degradationThreshold;
}
