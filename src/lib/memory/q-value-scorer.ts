/**
 * Q-Value Memory Scorer (MemRL Pattern)
 *
 * Assigns a Q-value to each memory that represents its expected utility
 * for future queries. Unlike the existing utility scorer (which uses
 * heuristics), this uses temporal-difference learning to continuously
 * improve scoring based on actual usage outcomes.
 *
 * Two-Phase Retrieval:
 * 1. Semantic filter: vector similarity → top K candidates
 * 2. Q-value selection: rank by learned utility → final N results
 *
 * The Q-value update rule:
 *   Q(m) ← Q(m) + α × (reward + γ × max_Q(next) - Q(m))
 *
 * Where:
 *   α = learning rate (how fast Q-values adapt)
 *   γ = discount factor (how much future utility matters)
 *   reward = immediate signal (+1 success, -1 failure, +0.5 positive feedback)
 *
 * @see https://arxiv.org/abs/2601.03192 (MemRL Paper)
 */

import { createServerClient } from '../supabase';

// ============================================
// Types
// ============================================

export interface QValueConfig {
  /** Learning rate α (0-1). Higher = faster adaptation, less stability */
  learningRate: number;
  /** Discount factor γ (0-1). Higher = values long-term utility more */
  discountFactor: number;
  /** Initial Q-value for new memories */
  initialQValue: number;
  /** Minimum Q-value (floor) */
  minQValue: number;
  /** Maximum Q-value (ceiling) */
  maxQValue: number;
  /** Exploration rate ε for epsilon-greedy selection */
  explorationRate: number;
  /** Decay rate for exploration (decrease over time) */
  explorationDecay: number;
  /** Minimum exploration rate */
  minExplorationRate: number;
}

export interface QValueEntry {
  memoryId: string;
  qValue: number;
  updateCount: number;
  lastUpdatedAt: Date;
  cumulativeReward: number;
}

export interface RetrievalReward {
  /** Memory ID that was retrieved */
  memoryId: string;
  /** Reward signal: positive = useful, negative = misleading */
  reward: number;
  /** Context: what was the query */
  queryContext?: string;
  /** Whether the LLM response using this memory was successful */
  responseSuccess?: boolean;
  /** User feedback if available */
  userFeedback?: 'positive' | 'negative' | null;
}

export interface QValueRankedResult {
  memoryId: string;
  content: string;
  /** Original semantic similarity score */
  semanticScore: number;
  /** Learned Q-value */
  qValue: number;
  /** Combined score: α × semantic + (1-α) × qValue */
  combinedScore: number;
  /** Whether this was an exploration pick */
  isExploration: boolean;
}

// ============================================
// Constants
// ============================================

const DEFAULT_CONFIG: QValueConfig = {
  learningRate: 0.1,
  discountFactor: 0.95,
  initialQValue: 0.5,
  minQValue: 0.01,
  maxQValue: 1.0,
  explorationRate: 0.15,   // 15% of retrievals try less-proven memories
  explorationDecay: 0.999,  // Slowly reduce exploration
  minExplorationRate: 0.02, // Always explore at least 2%
};

// Reward signals
const REWARDS = {
  SUCCESS: 1.0,
  FAILURE: -0.5,
  POSITIVE_FEEDBACK: 0.75,
  NEGATIVE_FEEDBACK: -0.75,
  HALLUCINATION: -1.0,
  RETRIEVAL: 0.1,          // Small bonus just for being retrieved
  NOT_USED: -0.05,         // Small penalty for retrieved but not used
};

// ============================================
// Q-Value Scorer Service
// ============================================

export class QValueScorerService {
  private config: QValueConfig;
  private currentExplorationRate: number;

  constructor(config: Partial<QValueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentExplorationRate = this.config.explorationRate;
  }

  /**
   * Initialize Q-value for a new memory.
   */
  async initializeQValue(memoryId: string): Promise<void> {
    const supabase = createServerClient();

    await supabase.from('memories').update({
      utility_score: this.config.initialQValue,
    }).eq('id', memoryId);
  }

  /**
   * Update Q-value based on a reward signal (TD Learning).
   *
   * Q(m) ← Q(m) + α × (reward + γ × maxQ_next - Q(m))
   */
  async updateQValue(reward: RetrievalReward): Promise<number> {
    const supabase = createServerClient();

    // Get current Q-value
    const { data: memory } = await supabase
      .from('memories')
      .select('utility_score, access_count')
      .eq('id', reward.memoryId)
      .single();

    if (!memory) return this.config.initialQValue;

    const currentQ = memory.utility_score ?? this.config.initialQValue;

    // Calculate reward from signals
    let totalReward = reward.reward;
    if (reward.responseSuccess !== undefined) {
      totalReward += reward.responseSuccess ? REWARDS.SUCCESS : REWARDS.FAILURE;
    }
    if (reward.userFeedback === 'positive') {
      totalReward += REWARDS.POSITIVE_FEEDBACK;
    } else if (reward.userFeedback === 'negative') {
      totalReward += REWARDS.NEGATIVE_FEEDBACK;
    }

    // Average the reward if multiple signals
    const signalCount = [
      reward.reward !== 0,
      reward.responseSuccess !== undefined,
      reward.userFeedback !== null && reward.userFeedback !== undefined,
    ].filter(Boolean).length;

    totalReward = signalCount > 0 ? totalReward / signalCount : reward.reward;

    // TD update: Q(m) ← Q(m) + α × (reward + γ × maxQ_future - Q(m))
    // For simplicity, maxQ_future is the current global average Q-value
    const { data: avgData } = await supabase
      .from('memories')
      .select('utility_score')
      .not('utility_score', 'is', null)
      .limit(100);

    const avgQ = avgData && avgData.length > 0
      ? avgData.reduce((sum, m) => sum + (m.utility_score ?? 0.5), 0) / avgData.length
      : 0.5;

    const tdTarget = totalReward + this.config.discountFactor * avgQ;
    const tdError = tdTarget - currentQ;
    const newQ = currentQ + this.config.learningRate * tdError;

    // Clamp to valid range
    const clampedQ = Math.max(
      this.config.minQValue,
      Math.min(this.config.maxQValue, newQ)
    );

    // Update in database
    await supabase
      .from('memories')
      .update({ utility_score: clampedQ })
      .eq('id', reward.memoryId);

    return clampedQ;
  }

  /**
   * Batch update Q-values from multiple reward signals.
   */
  async batchUpdateQValues(rewards: RetrievalReward[]): Promise<Map<string, number>> {
    const results = new Map<string, number>();
    for (const reward of rewards) {
      const newQ = await this.updateQValue(reward);
      results.set(reward.memoryId, newQ);
    }

    // Decay exploration rate
    this.currentExplorationRate = Math.max(
      this.config.minExplorationRate,
      this.currentExplorationRate * this.config.explorationDecay
    );

    return results;
  }

  /**
   * Two-Phase Retrieval: Semantic filter → Q-Value selection.
   *
   * Takes semantic search results and re-ranks them using Q-values,
   * with epsilon-greedy exploration.
   *
   * @param candidates - Results from semantic search (memoryId + similarity)
   * @param finalCount - How many results to return
   * @param semanticWeight - Weight for semantic score (0-1), rest goes to Q-value
   */
  async qValueSelect(
    candidates: Array<{ memoryId: string; content: string; similarity: number }>,
    finalCount: number = 5,
    semanticWeight: number = 0.6
  ): Promise<QValueRankedResult[]> {
    if (candidates.length === 0) return [];

    const supabase = createServerClient();

    // Fetch Q-values for all candidates
    const memoryIds = candidates.map((c) => c.memoryId);
    const { data: qValueData } = await supabase
      .from('memories')
      .select('id, utility_score')
      .in('id', memoryIds);

    const qValueMap = new Map<string, number>();
    for (const item of qValueData || []) {
      qValueMap.set(item.id, item.utility_score ?? this.config.initialQValue);
    }

    // Score each candidate: combined = semanticWeight × similarity + (1 - semanticWeight) × qValue
    const qWeight = 1 - semanticWeight;

    const scored = candidates.map((c) => {
      const qValue = qValueMap.get(c.memoryId) ?? this.config.initialQValue;
      return {
        memoryId: c.memoryId,
        content: c.content,
        semanticScore: c.similarity,
        qValue,
        combinedScore: semanticWeight * c.similarity + qWeight * qValue,
        isExploration: false,
      };
    });

    // Sort by combined score
    scored.sort((a, b) => b.combinedScore - a.combinedScore);

    // Epsilon-greedy: replace some top results with random exploration picks
    const explorationSlots = Math.max(
      1,
      Math.floor(finalCount * this.currentExplorationRate)
    );
    const exploitationSlots = finalCount - explorationSlots;

    const results: QValueRankedResult[] = [];

    // Exploitation: top-K by combined score
    for (let i = 0; i < Math.min(exploitationSlots, scored.length); i++) {
      results.push(scored[i]);
    }

    // Exploration: random picks from remaining candidates (prefer low Q-value = less explored)
    const remaining = scored.slice(exploitationSlots);
    if (remaining.length > 0 && explorationSlots > 0) {
      // Weight towards low Q-value (inverse Q as probability weight)
      const weights = remaining.map((r) => 1 / (r.qValue + 0.01));
      const totalWeight = weights.reduce((s, w) => s + w, 0);

      for (let e = 0; e < Math.min(explorationSlots, remaining.length); e++) {
        // Weighted random selection
        let rand = Math.random() * totalWeight;
        let selected = 0;
        for (let i = 0; i < weights.length; i++) {
          rand -= weights[i];
          if (rand <= 0) {
            selected = i;
            break;
          }
        }

        const pick = remaining[selected];
        if (pick) {
          results.push({ ...pick, isExploration: true });
          // Remove from remaining to avoid duplicates
          remaining.splice(selected, 1);
          weights.splice(selected, 1);
        }
      }
    }

    return results.slice(0, finalCount);
  }

  /**
   * Get Q-value statistics for a user's memories.
   */
  async getQValueStats(userId: string): Promise<{
    totalMemories: number;
    averageQValue: number;
    medianQValue: number;
    highUtility: number;    // Q > 0.7
    lowUtility: number;     // Q < 0.3
    explorationRate: number;
    distribution: Array<{ bucket: string; count: number }>;
  }> {
    const supabase = createServerClient();

    const { data: memories } = await supabase
      .from('memories')
      .select('utility_score')
      .eq('user_id', userId)
      .eq('is_deleted', false);

    if (!memories || memories.length === 0) {
      return {
        totalMemories: 0,
        averageQValue: 0,
        medianQValue: 0,
        highUtility: 0,
        lowUtility: 0,
        explorationRate: this.currentExplorationRate,
        distribution: [],
      };
    }

    const qValues = memories
      .map((m) => m.utility_score ?? this.config.initialQValue)
      .sort((a, b) => a - b);

    const total = qValues.length;
    const sum = qValues.reduce((s, q) => s + q, 0);

    // Distribution in 0.1 buckets
    const buckets: Record<string, number> = {};
    for (let i = 0; i < 10; i++) {
      const low = i / 10;
      const high = (i + 1) / 10;
      const label = `${low.toFixed(1)}-${high.toFixed(1)}`;
      buckets[label] = qValues.filter((q) => q >= low && q < high).length;
    }

    return {
      totalMemories: total,
      averageQValue: sum / total,
      medianQValue: qValues[Math.floor(total / 2)],
      highUtility: qValues.filter((q) => q > 0.7).length,
      lowUtility: qValues.filter((q) => q < 0.3).length,
      explorationRate: this.currentExplorationRate,
      distribution: Object.entries(buckets).map(([bucket, count]) => ({
        bucket,
        count,
      })),
    };
  }
}

/**
 * Factory function for Q-Value Scorer.
 */
export function createQValueScorer(
  config?: Partial<QValueConfig>
): QValueScorerService {
  return new QValueScorerService(config);
}
