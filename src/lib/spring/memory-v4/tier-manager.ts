/**
 * Tier Manager Service (MemGPT-style)
 *
 * Manages memory tier assignment and transitions.
 * Implements MemGPT-style virtual context management with hot/warm/cold/frozen tiers.
 *
 * @module spring/memory-v4/tier-manager
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

export type MemoryTier = 'hot' | 'warm' | 'cold' | 'frozen';

export interface TierPolicy {
  /** Minimum salience for this tier */
  minSalience: number;
  /** Maximum age in days before demotion */
  maxAgeDays?: number;
  /** Minimum access count for promotion */
  minAccessCount?: number;
  /** Note types that default to this tier */
  defaultTypes?: string[];
}

export interface TierConfig {
  /** Hot tier policy */
  hot: TierPolicy;
  /** Warm tier policy */
  warm: TierPolicy;
  /** Cold tier policy */
  cold: TierPolicy;
  /** Frozen tier policy */
  frozen: TierPolicy;
  /** Budget allocation percentages */
  budgets: TierBudget;
  /** Type-specific rules */
  typeRules: Record<string, TypeTierRule>;
}

export interface TierBudget {
  hot: number;   // Token budget
  warm: number;
  cold: number;
  frozen: number;
}

export interface TypeTierRule {
  /** Default tier for this type */
  defaultTier: MemoryTier;
  /** Prevent automatic demotion */
  preventDemotion?: boolean;
  /** Auto-archive after days */
  autoArchiveDays?: number;
}

export interface TierStats {
  tier: MemoryTier;
  count: number;
  totalTokens: number;
  avgSalience: number;
}

export interface RebalanceResult {
  promoted: number;
  demoted: number;
  unchanged: number;
  errors: string[];
}

export interface TierMemory {
  id: string;
  content: string;
  noteType: string;
  tier: MemoryTier;
  salience: number;
  estimatedTokens: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONFIG: TierConfig = {
  hot: {
    minSalience: 0.8,
    maxAgeDays: 7,
    defaultTypes: ['preference', 'instruction'],
  },
  warm: {
    minSalience: 0.4,
    maxAgeDays: 30,
    defaultTypes: ['fact', 'relationship', 'procedure'],
  },
  cold: {
    minSalience: 0.1,
    maxAgeDays: 90,
    defaultTypes: ['episode'],
  },
  frozen: {
    minSalience: 0,
  },
  budgets: {
    hot: 4000,
    warm: 6000,
    cold: 2000,
    frozen: 0,
  },
  typeRules: {
    preference: { defaultTier: 'hot', preventDemotion: true },
    instruction: { defaultTier: 'hot', preventDemotion: true },
    fact: { defaultTier: 'warm' },
    episode: { defaultTier: 'warm', autoArchiveDays: 14 },
    relationship: { defaultTier: 'warm' },
    procedure: { defaultTier: 'warm' },
  },
};

// =============================================================================
// Tier Manager Service
// =============================================================================

export class TierManagerService {
  private config: TierConfig;

  constructor(
    private supabase: SupabaseClient,
    config?: Partial<TierConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ===========================================================================
  // Tier Calculation
  // ===========================================================================

  /**
   * Calculate the optimal tier for a memory
   */
  async calculateTier(memoryId: string, userId: string): Promise<MemoryTier> {
    // Call the database function
    const { data, error } = await this.supabase.rpc('determine_memory_tier', {
      p_user_id: userId,
      p_memory_id: memoryId,
    });

    if (error) {
      console.error('Failed to calculate tier:', error);
      return 'warm'; // Default fallback
    }

    return data as MemoryTier;
  }

  /**
   * Calculate tier score (used for sorting within tiers)
   */
  calculateTierScore(
    salience: number,
    accessCount: number,
    lastAccessed: Date | null,
    createdAt: Date
  ): number {
    const now = Date.now();
    const createdMs = createdAt.getTime();
    const ageDays = (now - createdMs) / (1000 * 60 * 60 * 24);

    // Recency factor (exponential decay, half-life of 7 days)
    let recencyFactor: number;
    if (lastAccessed) {
      const daysSinceAccess = (now - lastAccessed.getTime()) / (1000 * 60 * 60 * 24);
      recencyFactor = Math.exp(-0.099 * daysSinceAccess);
    } else {
      recencyFactor = Math.exp(-0.099 * ageDays);
    }

    // Access factor (logarithmic, normalized)
    const accessFactor = Math.min(1.0, Math.log(Math.max(1, accessCount) + 1) / 5.0);

    // Combined score
    return salience * (recencyFactor * 0.4 + accessFactor * 0.3 + 0.3);
  }

  /**
   * Determine tier based on local calculation (without DB call)
   */
  determineTierLocal(
    noteType: string,
    salience: number,
    accessCount: number,
    lastAccessed: Date | null,
    createdAt: Date
  ): MemoryTier {
    // Check type-specific rules first
    const typeRule = this.config.typeRules[noteType];
    if (typeRule?.preventDemotion) {
      return typeRule.defaultTier;
    }

    // Calculate tier score
    const tierScore = this.calculateTierScore(salience, accessCount, lastAccessed, createdAt);

    // Determine tier based on score
    if (tierScore >= this.config.hot.minSalience) {
      return 'hot';
    } else if (tierScore >= this.config.warm.minSalience) {
      return 'warm';
    } else if (tierScore >= this.config.cold.minSalience) {
      return 'cold';
    }
    return 'frozen';
  }

  // ===========================================================================
  // Tier Assignment
  // ===========================================================================

  /**
   * Set tier for a memory
   */
  async setTier(
    memoryId: string,
    tier: MemoryTier,
    reason: string,
    triggeredBy: 'manual' | 'system_rebalance' | 'usage_promotion' | 'time_demotion' = 'manual'
  ): Promise<void> {
    // Set context for trigger (ignore if not supported)
    try {
      await this.supabase.rpc('set_config', {
        setting: 'app.tier_trigger',
        value: triggeredBy,
      });
    } catch {
      // RPC not supported, ignore
    }

    const { error } = await this.supabase
      .from('spring_memory_notes')
      .update({
        memory_tier: tier,
        tier_reason: reason,
      })
      .eq('id', memoryId);

    if (error) {
      throw new Error(`Failed to set tier: ${error.message}`);
    }
  }

  /**
   * Promote a memory to a higher tier
   */
  async promote(memoryId: string, reason: string): Promise<MemoryTier> {
    const { data: memory } = await this.supabase
      .from('spring_memory_notes')
      .select('memory_tier')
      .eq('id', memoryId)
      .single();

    if (!memory) {
      throw new Error('Memory not found');
    }

    const currentTier = memory.memory_tier as MemoryTier;
    const tierOrder: MemoryTier[] = ['frozen', 'cold', 'warm', 'hot'];
    const currentIndex = tierOrder.indexOf(currentTier);

    if (currentIndex >= tierOrder.length - 1) {
      return currentTier; // Already at highest tier
    }

    const newTier = tierOrder[currentIndex + 1];
    await this.setTier(memoryId, newTier, reason, 'usage_promotion');
    return newTier;
  }

  /**
   * Demote a memory to a lower tier
   */
  async demote(memoryId: string, reason: string): Promise<MemoryTier> {
    const { data: memory } = await this.supabase
      .from('spring_memory_notes')
      .select('memory_tier, note_type')
      .eq('id', memoryId)
      .single();

    if (!memory) {
      throw new Error('Memory not found');
    }

    // Check if demotion is prevented
    const typeRule = this.config.typeRules[memory.note_type];
    if (typeRule?.preventDemotion) {
      return memory.memory_tier as MemoryTier;
    }

    const currentTier = memory.memory_tier as MemoryTier;
    const tierOrder: MemoryTier[] = ['frozen', 'cold', 'warm', 'hot'];
    const currentIndex = tierOrder.indexOf(currentTier);

    if (currentIndex <= 0) {
      return currentTier; // Already at lowest tier
    }

    const newTier = tierOrder[currentIndex - 1];
    await this.setTier(memoryId, newTier, reason, 'time_demotion');
    return newTier;
  }

  // ===========================================================================
  // Rebalancing
  // ===========================================================================

  /**
   * Rebalance tiers for a user (batch operation)
   */
  async rebalanceTiers(
    userId: string,
    options?: { batchSize?: number }
  ): Promise<RebalanceResult> {
    const batchSize = options?.batchSize ?? 500;

    // Call the database function
    const { data, error } = await this.supabase.rpc('rebalance_user_tiers', {
      p_user_id: userId,
      p_batch_size: batchSize,
    });

    if (error) {
      return {
        promoted: 0,
        demoted: 0,
        unchanged: 0,
        errors: [error.message],
      };
    }

    const result = data?.[0] || { promoted: 0, demoted: 0, unchanged: 0 };
    return {
      promoted: result.promoted,
      demoted: result.demoted,
      unchanged: result.unchanged,
      errors: [],
    };
  }

  /**
   * Rebalance tiers for all users (admin operation)
   */
  async rebalanceAllUsers(batchSize = 100): Promise<{
    usersProcessed: number;
    totalPromoted: number;
    totalDemoted: number;
    errors: string[];
  }> {
    // Get all users with memories
    const { data: users, error: usersError } = await this.supabase
      .from('spring_memory_notes')
      .select('user_id')
      .eq('status', 'active')
      .limit(1000);

    if (usersError) {
      return {
        usersProcessed: 0,
        totalPromoted: 0,
        totalDemoted: 0,
        errors: [usersError.message],
      };
    }

    const uniqueUsers = [...new Set((users || []).map((u) => u.user_id))];
    let totalPromoted = 0;
    let totalDemoted = 0;
    const errors: string[] = [];

    for (const userId of uniqueUsers) {
      try {
        const result = await this.rebalanceTiers(userId, { batchSize });
        totalPromoted += result.promoted;
        totalDemoted += result.demoted;
        errors.push(...result.errors);
      } catch (err) {
        errors.push(`User ${userId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return {
      usersProcessed: uniqueUsers.length,
      totalPromoted,
      totalDemoted,
      errors,
    };
  }

  // ===========================================================================
  // Retrieval
  // ===========================================================================

  /**
   * Get memories by tier
   */
  async getMemoriesByTier(
    userId: string,
    tier: MemoryTier,
    options?: {
      limit?: number;
      minSalience?: number;
      noteTypes?: string[];
    }
  ): Promise<TierMemory[]> {
    let query = this.supabase
      .from('spring_memory_notes')
      .select('id, content, note_type, memory_tier, salience')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('memory_tier', tier)
      .order('salience', { ascending: false });

    if (options?.minSalience) {
      query = query.gte('salience', options.minSalience);
    }

    if (options?.noteTypes?.length) {
      query = query.in('note_type', options.noteTypes);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get memories by tier: ${error.message}`);
    }

    return (data || []).map((m) => ({
      id: m.id,
      content: m.content,
      noteType: m.note_type,
      tier: m.memory_tier as MemoryTier,
      salience: m.salience || 0,
      estimatedTokens: Math.ceil(m.content.length / 4),
    }));
  }

  /**
   * Get memories with tier-based budget allocation
   */
  async getMemoriesWithBudget(
    userId: string,
    totalBudget: number,
    budgetAllocation?: Partial<TierBudget>
  ): Promise<TierMemory[]> {
    const budget = {
      hot: budgetAllocation?.hot ?? this.config.budgets.hot,
      warm: budgetAllocation?.warm ?? this.config.budgets.warm,
      cold: budgetAllocation?.cold ?? this.config.budgets.cold,
      frozen: budgetAllocation?.frozen ?? this.config.budgets.frozen,
    };

    // Normalize to total budget
    const totalConfigured = budget.hot + budget.warm + budget.cold + budget.frozen;
    const scaleFactor = totalBudget / (totalConfigured || 1);

    const hotBudget = Math.round(budget.hot * scaleFactor);
    const warmBudget = Math.round(budget.warm * scaleFactor);
    const coldBudget = Math.round(budget.cold * scaleFactor);

    // Use database function for efficiency
    const { data, error } = await this.supabase.rpc('get_memories_by_tier_budget', {
      p_user_id: userId,
      p_total_budget: totalBudget,
      p_hot_pct: (budget.hot / totalConfigured) * 100,
      p_warm_pct: (budget.warm / totalConfigured) * 100,
      p_cold_pct: (budget.cold / totalConfigured) * 100,
    });

    if (error) {
      // Fallback to manual retrieval
      console.error('Budget allocation RPC failed, using fallback:', error);
      return this.getMemoriesWithBudgetFallback(userId, hotBudget, warmBudget, coldBudget);
    }

    return (data || []).map((m: Record<string, unknown>) => ({
      id: m.memory_id as string,
      content: m.content as string,
      noteType: m.note_type as string,
      tier: m.memory_tier as MemoryTier,
      salience: (m.salience as number) || 0,
      estimatedTokens: m.estimated_tokens as number,
    }));
  }

  private async getMemoriesWithBudgetFallback(
    userId: string,
    hotBudget: number,
    warmBudget: number,
    coldBudget: number
  ): Promise<TierMemory[]> {
    const results: TierMemory[] = [];

    // Fetch each tier up to budget
    const tiers: Array<{ tier: MemoryTier; budget: number }> = [
      { tier: 'hot', budget: hotBudget },
      { tier: 'warm', budget: warmBudget },
      { tier: 'cold', budget: coldBudget },
    ];

    for (const { tier, budget } of tiers) {
      if (budget <= 0) continue;

      const memories = await this.getMemoriesByTier(userId, tier, {
        limit: Math.ceil(budget / 50), // Estimate 50 tokens per memory average
      });

      let usedTokens = 0;
      for (const memory of memories) {
        if (usedTokens + memory.estimatedTokens > budget) break;
        results.push(memory);
        usedTokens += memory.estimatedTokens;
      }
    }

    return results;
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get tier statistics for a user
   */
  async getTierStats(userId: string): Promise<TierStats[]> {
    const { data, error } = await this.supabase
      .from('spring_memory_notes')
      .select('memory_tier, content, salience')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error) {
      throw new Error(`Failed to get tier stats: ${error.message}`);
    }

    const statsByTier = new Map<MemoryTier, { count: number; tokens: number; saliences: number[] }>();

    for (const memory of data || []) {
      const tier = (memory.memory_tier || 'warm') as MemoryTier;
      const current = statsByTier.get(tier) || { count: 0, tokens: 0, saliences: [] };
      current.count++;
      current.tokens += Math.ceil(memory.content.length / 4);
      current.saliences.push(memory.salience || 0);
      statsByTier.set(tier, current);
    }

    const tiers: MemoryTier[] = ['hot', 'warm', 'cold', 'frozen'];
    return tiers.map((tier) => {
      const stats = statsByTier.get(tier) || { count: 0, tokens: 0, saliences: [] };
      return {
        tier,
        count: stats.count,
        totalTokens: stats.tokens,
        avgSalience:
          stats.saliences.length > 0
            ? stats.saliences.reduce((a, b) => a + b, 0) / stats.saliences.length
            : 0,
      };
    });
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  /**
   * Get tier configuration for a user
   */
  async getUserConfig(userId: string): Promise<TierConfig | null> {
    const { data, error } = await this.supabase
      .from('spring_tier_config')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      hot: {
        minSalience: data.hot_min_salience,
        maxAgeDays: data.hot_max_age_days,
      },
      warm: {
        minSalience: data.warm_min_salience,
        maxAgeDays: data.warm_max_age_days,
      },
      cold: {
        minSalience: data.cold_min_salience,
      },
      frozen: {
        minSalience: 0,
      },
      budgets: {
        hot: data.hot_budget_pct * 100,
        warm: data.warm_budget_pct * 100,
        cold: data.cold_budget_pct * 100,
        frozen: 0,
      },
      typeRules: data.type_rules || {},
    };
  }

  /**
   * Update tier configuration for a user
   */
  async updateUserConfig(userId: string, config: Partial<TierConfig>): Promise<void> {
    const updateData: Record<string, unknown> = {
      user_id: userId,
      updated_at: new Date().toISOString(),
    };

    if (config.hot) {
      updateData.hot_min_salience = config.hot.minSalience;
      updateData.hot_max_age_days = config.hot.maxAgeDays;
    }

    if (config.warm) {
      updateData.warm_min_salience = config.warm.minSalience;
      updateData.warm_max_age_days = config.warm.maxAgeDays;
    }

    if (config.cold) {
      updateData.cold_min_salience = config.cold.minSalience;
    }

    if (config.budgets) {
      const total = config.budgets.hot + config.budgets.warm + config.budgets.cold;
      updateData.hot_budget_pct = (config.budgets.hot / total) * 100;
      updateData.warm_budget_pct = (config.budgets.warm / total) * 100;
      updateData.cold_budget_pct = (config.budgets.cold / total) * 100;
    }

    if (config.typeRules) {
      updateData.type_rules = config.typeRules;
    }

    const { error } = await this.supabase
      .from('spring_tier_config')
      .upsert(updateData, { onConflict: 'user_id' });

    if (error) {
      throw new Error(`Failed to update tier config: ${error.message}`);
    }
  }

  /**
   * Set local config
   */
  setConfig(config: Partial<TierConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createTierManagerService(
  supabase: SupabaseClient,
  config?: Partial<TierConfig>
): TierManagerService {
  return new TierManagerService(supabase, config);
}
