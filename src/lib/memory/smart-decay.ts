/**
 * SmartDecay — Ebbinghaus Forgetting Curve for Memory Management
 *
 * Implements spaced repetition and forgetting curves for AI memories:
 * - Memories decay naturally following Ebbinghaus's exponential forgetting curve
 * - Each access/retrieval acts as a "review" that resets and strengthens retention
 * - Repeated reviews increase memory "stability" (slower subsequent decay)
 * - Q-value integration: memories with high utility resist decay
 *
 * R(t) = e^(-t/S)
 *   R = retention probability (0-1)
 *   t = time since last review (days)
 *   S = stability factor (increases with each review)
 *
 * @see https://arxiv.org/html/2601.03938v1 (FOREVER)
 * @see Ebbinghaus forgetting curve (1885)
 */

import { createServerClient } from '../supabase';

// ============================================
// Types
// ============================================

export interface DecayParameters {
  /** Base stability factor (days until 50% retention for new memory) */
  baseStability: number;
  /** Multiplier applied to stability on each review */
  stabilityGrowthRate: number;
  /** Maximum stability factor (cap) */
  maxStability: number;
  /** Retention threshold below which memory is considered "forgotten" */
  forgottenThreshold: number;
  /** Minimum importance floor (never decay below this) */
  importanceFloor: number;
  /** Utility score weight (0-1): how much utility resists decay */
  utilityShield: number;
}

export interface MemoryDecayState {
  memoryId: string;
  /** Current stability factor S */
  stability: number;
  /** Number of successful reviews (access/retrievals) */
  reviewCount: number;
  /** Last review timestamp */
  lastReviewedAt: Date;
  /** Current retention R(t) */
  retention: number;
  /** Original importance before decay */
  baseImportance: number;
  /** Effective importance after decay */
  effectiveImportance: number;
}

export interface DecayResult {
  /** Total memories processed */
  processed: number;
  /** Memories with reduced importance */
  decayed: number;
  /** Memories strengthened (above threshold, high stability) */
  strengthened: number;
  /** Memories marked for archival (retention < forgotten threshold) */
  markedForArchival: number;
  /** Memories skipped (decay disabled or exempt) */
  skipped: number;
}

export interface SpacedRepetitionSchedule {
  memoryId: string;
  /** Next optimal review time */
  nextReviewAt: Date;
  /** Current interval between reviews (days) */
  intervalDays: number;
  /** Priority score for review (higher = more urgent) */
  reviewPriority: number;
}

// ============================================
// Constants
// ============================================

const DEFAULT_PARAMS: DecayParameters = {
  baseStability: 1.0,       // New memory: ~50% retention after 1 day
  stabilityGrowthRate: 2.5, // Each review multiplies stability by 2.5
  maxStability: 365,        // Cap at ~1 year stability
  forgottenThreshold: 0.1,  // Below 10% retention = "forgotten"
  importanceFloor: 1,       // Never go below importance 1
  utilityShield: 0.3,       // High utility memories resist 30% of decay
};

// Plan-based parameter overrides
const PLAN_OVERRIDES: Record<string, Partial<DecayParameters>> = {
  free: { maxStability: 90 },
  plus: { maxStability: 180 },
  pro: { maxStability: 365, utilityShield: 0.5 },
  enterprise: { maxStability: 730, utilityShield: 0.5 },
};

// ============================================
// Core Forgetting Curve Functions
// ============================================

/**
 * Calculate retention probability using the Ebbinghaus forgetting curve.
 *
 * R(t) = e^(-t/S)
 *
 * @param daysSinceReview - Days since last access/review
 * @param stability - Stability factor (higher = slower forgetting)
 * @returns Retention probability [0, 1]
 */
export function calculateRetention(
  daysSinceReview: number,
  stability: number
): number {
  if (stability <= 0) return 0;
  if (daysSinceReview <= 0) return 1;
  return Math.exp(-daysSinceReview / stability);
}

/**
 * Calculate new stability after a review event.
 *
 * Each review increases stability, making the memory decay more slowly.
 * The growth follows a diminishing returns pattern.
 *
 * S_new = min(S_old × growthRate × (1 + 0.1 × ln(reviewCount + 1)), maxStability)
 */
export function calculateNewStability(
  currentStability: number,
  reviewCount: number,
  params: DecayParameters = DEFAULT_PARAMS
): number {
  const growthFactor = params.stabilityGrowthRate * (1 + 0.1 * Math.log(reviewCount + 1));
  const newStability = currentStability * growthFactor;
  return Math.min(newStability, params.maxStability);
}

/**
 * Calculate effective importance after applying forgetting curve decay.
 *
 * effectiveImportance = floor + (baseImportance - floor) × R(t) × (1 + utilityShield × utilityScore)
 */
export function calculateEffectiveImportance(
  baseImportance: number,
  retention: number,
  utilityScore: number = 0.5,
  params: DecayParameters = DEFAULT_PARAMS
): number {
  const floor = params.importanceFloor;
  const utilityBoost = 1 + params.utilityShield * utilityScore;
  const decayedImportance = floor + (baseImportance - floor) * retention * utilityBoost;
  return Math.max(floor, Math.min(10, Math.round(decayedImportance)));
}

/**
 * Calculate the optimal next review time using spaced repetition.
 *
 * The interval doubles with each successful review (up to stability cap).
 * interval = S × ln(1 / desiredRetention)
 */
export function calculateNextReviewInterval(
  stability: number,
  desiredRetention: number = 0.85
): number {
  if (desiredRetention <= 0 || desiredRetention >= 1) return stability;
  return stability * Math.log(1 / desiredRetention);
}

// ============================================
// SmartDecay Service
// ============================================

/**
 * Apply SmartDecay to all memories for a user.
 *
 * This replaces the simple `importance -= 1` approach with
 * Ebbinghaus forgetting curves + spaced repetition.
 */
export async function applySmartDecay(
  userId: string,
  planOverrides?: Partial<DecayParameters>
): Promise<DecayResult> {
  const supabase = createServerClient();
  const result: DecayResult = {
    processed: 0,
    decayed: 0,
    strengthened: 0,
    markedForArchival: 0,
    skipped: 0,
  };

  // Get user's plan for parameter overrides
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, memory_decay_enabled')
    .eq('id', userId)
    .single();

  if (!profile || profile.memory_decay_enabled === false) {
    return { ...result, skipped: -1 }; // -1 = decay disabled
  }

  const plan = profile.plan || 'free';
  const params: DecayParameters = {
    ...DEFAULT_PARAMS,
    ...(PLAN_OVERRIDES[plan] || {}),
    ...(planOverrides || {}),
  };

  // Fetch active memories with access patterns
  const { data: memories, error } = await supabase
    .from('memories')
    .select('id, importance, access_count, last_accessed_at, created_at, utility_score')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .gt('importance', params.importanceFloor);

  if (error || !memories) {
    console.error('[SmartDecay] Error fetching memories:', error);
    return result;
  }

  const now = new Date();
  const updates: Array<{ id: string; importance: number }> = [];
  const archivalCandidates: string[] = [];

  for (const memory of memories) {
    result.processed++;

    const lastReviewed = memory.last_accessed_at
      ? new Date(memory.last_accessed_at)
      : new Date(memory.created_at);

    const daysSinceReview = (now.getTime() - lastReviewed.getTime()) / (86400000);

    // Calculate stability based on review count
    let stability = params.baseStability;
    const reviewCount = memory.access_count || 0;

    for (let i = 0; i < Math.min(reviewCount, 20); i++) {
      stability = calculateNewStability(stability, i, params);
    }

    // Calculate retention
    const retention = calculateRetention(daysSinceReview, stability);

    // Calculate effective importance
    const utilityScore = memory.utility_score ?? 0.5;
    const newImportance = calculateEffectiveImportance(
      memory.importance,
      retention,
      utilityScore,
      params
    );

    // Check if memory should be archived (very low retention)
    if (retention < params.forgottenThreshold && reviewCount === 0) {
      archivalCandidates.push(memory.id);
      result.markedForArchival++;
    }

    // Only update if importance actually changed
    if (newImportance !== memory.importance) {
      if (newImportance < memory.importance) {
        result.decayed++;
      } else {
        result.strengthened++;
      }
      updates.push({ id: memory.id, importance: newImportance });
    } else {
      result.skipped++;
    }
  }

  // Batch update memories
  for (const update of updates) {
    await supabase
      .from('memories')
      .update({ importance: update.importance })
      .eq('id', update.id);
  }

  return result;
}

/**
 * Record a review event for a memory (called on access/retrieval).
 *
 * This strengthens the memory's resistance to decay.
 */
export async function recordMemoryReview(memoryId: string): Promise<void> {
  const supabase = createServerClient();

  // Increment access count and update last_accessed_at via RPC
  await supabase.rpc('increment_memory_access', { memory_id: memoryId });
}

/**
 * Get spaced repetition schedule for a user's memories.
 *
 * Returns memories sorted by review urgency (most urgent first).
 * Useful for proactive memory reinforcement.
 */
export async function getReviewSchedule(
  userId: string,
  limit: number = 20
): Promise<SpacedRepetitionSchedule[]> {
  const supabase = createServerClient();
  const now = new Date();

  const { data: memories, error } = await supabase
    .from('memories')
    .select('id, importance, access_count, last_accessed_at, created_at')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .gt('importance', 3) // Only review somewhat important memories
    .order('last_accessed_at', { ascending: true })
    .limit(limit * 3); // Fetch extra for filtering

  if (error || !memories) return [];

  const schedules: SpacedRepetitionSchedule[] = [];

  for (const memory of memories) {
    const reviewCount = memory.access_count || 0;
    let stability = DEFAULT_PARAMS.baseStability;

    for (let i = 0; i < Math.min(reviewCount, 20); i++) {
      stability = calculateNewStability(stability, i);
    }

    const intervalDays = calculateNextReviewInterval(stability);
    const lastReviewed = memory.last_accessed_at
      ? new Date(memory.last_accessed_at)
      : new Date(memory.created_at);

    const nextReviewAt = new Date(lastReviewed.getTime() + intervalDays * 86400000);

    // Calculate priority: overdue reviews have higher priority
    const overdueDays = (now.getTime() - nextReviewAt.getTime()) / 86400000;
    const reviewPriority = Math.max(0, overdueDays) * (memory.importance / 10);

    schedules.push({
      memoryId: memory.id,
      nextReviewAt,
      intervalDays,
      reviewPriority,
    });
  }

  // Sort by priority (most urgent first)
  return schedules
    .sort((a, b) => b.reviewPriority - a.reviewPriority)
    .slice(0, limit);
}

/**
 * Get decay analytics for a user's memory health.
 */
export async function getDecayAnalytics(userId: string): Promise<{
  totalMemories: number;
  healthyMemories: number;      // retention > 0.7
  decliningMemories: number;    // retention 0.3-0.7
  criticalMemories: number;     // retention < 0.3
  averageRetention: number;
  averageStability: number;
  memoriesDueForReview: number;
}> {
  const supabase = createServerClient();
  const now = new Date();

  const { data: memories, error } = await supabase
    .from('memories')
    .select('id, importance, access_count, last_accessed_at, created_at')
    .eq('user_id', userId)
    .eq('is_deleted', false);

  if (error || !memories) {
    return {
      totalMemories: 0,
      healthyMemories: 0,
      decliningMemories: 0,
      criticalMemories: 0,
      averageRetention: 0,
      averageStability: 0,
      memoriesDueForReview: 0,
    };
  }

  let totalRetention = 0;
  let totalStability = 0;
  let healthy = 0;
  let declining = 0;
  let critical = 0;
  let dueForReview = 0;

  for (const memory of memories) {
    const reviewCount = memory.access_count || 0;
    let stability = DEFAULT_PARAMS.baseStability;
    for (let i = 0; i < Math.min(reviewCount, 20); i++) {
      stability = calculateNewStability(stability, i);
    }

    const lastReviewed = memory.last_accessed_at
      ? new Date(memory.last_accessed_at)
      : new Date(memory.created_at);
    const daysSince = (now.getTime() - lastReviewed.getTime()) / 86400000;
    const retention = calculateRetention(daysSince, stability);

    totalRetention += retention;
    totalStability += stability;

    if (retention > 0.7) healthy++;
    else if (retention > 0.3) declining++;
    else critical++;

    const interval = calculateNextReviewInterval(stability);
    if (daysSince > interval) dueForReview++;
  }

  return {
    totalMemories: memories.length,
    healthyMemories: healthy,
    decliningMemories: declining,
    criticalMemories: critical,
    averageRetention: memories.length > 0 ? totalRetention / memories.length : 0,
    averageStability: memories.length > 0 ? totalStability / memories.length : 0,
    memoriesDueForReview: dueForReview,
  };
}
