/**
 * Seizn Vector Cost Engineering - Storage Tiering
 *
 * Manages Hot/Warm/Cold storage tiers for vector data.
 * Automatically promotes and demotes chunks based on access patterns.
 */

import { createServerClient } from '@/lib/supabase';
import {
  DEFAULT_TIER_CONFIG,
  type StorageTier,
  type TierConfig,
  type TierSettings,
  type TierDistribution,
  type ChunkAccessStats,
  type MigrationPlan,
  type MigrationResult,
  type MigrationError,
  type TierMigration,
} from './types';

// Re-export default config
export { DEFAULT_TIER_CONFIG };

/**
 * Storage Tier Manager
 *
 * Handles tier assignments, access tracking, and migrations.
 */
export class TierManager {
  private config: TierConfig;
  private userId: string;

  constructor(userId: string, config?: Partial<TierConfig>) {
    this.userId = userId;
    this.config = {
      ...DEFAULT_TIER_CONFIG,
      ...config,
    } as TierConfig;
  }

  /**
   * Record access to chunks
   */
  async recordAccess(chunkIds: string[]): Promise<void> {
    if (chunkIds.length === 0) return;

    const supabase = createServerClient();
    const now = new Date().toISOString();

    // Upsert access stats for each chunk
    for (const chunkId of chunkIds) {
      const { error } = await supabase.rpc('upsert_chunk_access', {
        p_chunk_id: chunkId,
        p_user_id: this.userId,
        p_accessed_at: now,
      });

      if (error) {
        console.error(`Failed to record access for chunk ${chunkId}:`, error);
      }
    }
  }

  /**
   * Determine the appropriate tier for a chunk
   */
  async determineTier(chunkId: string): Promise<StorageTier> {
    const stats = await this.getChunkStats(chunkId);

    if (!stats) {
      return 'cold';
    }

    const daysSinceAccess = this.daysSince(stats.lastAccessedAt);
    const daysSinceCreation = this.daysSince(stats.createdAt);

    // Hot tier: recent access + frequent use
    if (
      daysSinceAccess <= this.config.hot.maxAgeDays &&
      stats.accessCount >= this.config.hot.minAccessCount
    ) {
      return 'hot';
    }

    // Warm tier: moderate age or recent creation
    if (
      daysSinceAccess <= this.config.warm.maxAgeDays ||
      daysSinceCreation <= this.config.warm.maxAgeDays
    ) {
      return 'warm';
    }

    // Cold tier: old data
    return 'cold';
  }

  /**
   * Get access statistics for a chunk
   */
  async getChunkStats(chunkId: string): Promise<ChunkAccessStats | null> {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('chunk_access_stats')
      .select('*')
      .eq('chunk_id', chunkId)
      .eq('user_id', this.userId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      chunkId: data.chunk_id,
      collectionId: data.collection_id,
      userId: data.user_id,
      accessCount: data.access_count,
      lastAccessedAt: new Date(data.last_accessed_at),
      createdAt: new Date(data.created_at),
      tier: data.tier as StorageTier,
    };
  }

  /**
   * Get tier distribution for a collection
   */
  async getTierDistribution(collectionId?: string): Promise<TierDistribution> {
    const supabase = createServerClient();

    let query = supabase
      .from('chunk_access_stats')
      .select('tier')
      .eq('user_id', this.userId);

    if (collectionId) {
      query = query.eq('collection_id', collectionId);
    }

    const { data, error } = await query;

    if (error || !data) {
      return { hot: 0, warm: 0, cold: 0, total: 0 };
    }

    const distribution = { hot: 0, warm: 0, cold: 0, total: data.length };

    for (const row of data) {
      const tier = row.tier as StorageTier;
      distribution[tier]++;
    }

    return distribution;
  }

  /**
   * Schedule tier migrations
   */
  async scheduleMigration(collectionId?: string): Promise<MigrationPlan> {
    const supabase = createServerClient();
    const now = new Date();

    const demotions: TierMigration[] = [];
    const promotions: TierMigration[] = [];

    // Get all chunk stats
    let query = supabase
      .from('chunk_access_stats')
      .select('*')
      .eq('user_id', this.userId);

    if (collectionId) {
      query = query.eq('collection_id', collectionId);
    }

    const { data: chunks, error } = await query;

    if (error || !chunks) {
      return { demotions: [], promotions: [], estimatedCostChange: 0 };
    }

    for (const chunk of chunks) {
      const currentTier = chunk.tier as StorageTier;
      const daysSinceAccess = this.daysSince(new Date(chunk.last_accessed_at));
      const accessCount = chunk.access_count;

      // Check for demotion
      if (currentTier === 'hot') {
        if (
          daysSinceAccess > this.config.hot.maxAgeDays ||
          accessCount < this.config.hot.minAccessCount
        ) {
          demotions.push({
            chunkId: chunk.chunk_id,
            from: 'hot',
            to: 'warm',
            reason: `Access age (${daysSinceAccess}d) exceeds hot tier max (${this.config.hot.maxAgeDays}d)`,
          });
        }
      } else if (currentTier === 'warm') {
        if (daysSinceAccess > this.config.warm.maxAgeDays) {
          demotions.push({
            chunkId: chunk.chunk_id,
            from: 'warm',
            to: 'cold',
            reason: `Access age (${daysSinceAccess}d) exceeds warm tier max (${this.config.warm.maxAgeDays}d)`,
          });
        }
      }

      // Check for promotion
      if (currentTier === 'cold') {
        if (
          accessCount >= this.config.hot.minAccessCount &&
          daysSinceAccess <= this.config.hot.maxAgeDays
        ) {
          promotions.push({
            chunkId: chunk.chunk_id,
            from: 'cold',
            to: 'hot',
            reason: `High access count (${accessCount}) with recent activity`,
          });
        } else if (daysSinceAccess <= this.config.warm.maxAgeDays) {
          promotions.push({
            chunkId: chunk.chunk_id,
            from: 'cold',
            to: 'warm',
            reason: `Recent access (${daysSinceAccess}d) qualifies for warm tier`,
          });
        }
      } else if (currentTier === 'warm') {
        if (
          accessCount >= this.config.hot.minAccessCount &&
          daysSinceAccess <= this.config.hot.maxAgeDays
        ) {
          promotions.push({
            chunkId: chunk.chunk_id,
            from: 'warm',
            to: 'hot',
            reason: `High access count (${accessCount}) qualifies for hot tier`,
          });
        }
      }
    }

    // Calculate estimated cost change
    const estimatedCostChange = this.calculateCostChange(demotions, promotions);

    return { demotions, promotions, estimatedCostChange };
  }

  /**
   * Execute a migration plan
   */
  async executeMigration(plan: MigrationPlan): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      demoted: 0,
      promoted: 0,
      errors: [],
      durationMs: 0,
    };

    // Process demotions
    for (const demotion of plan.demotions) {
      try {
        await this.migrateChunk(demotion.chunkId, demotion.to);
        result.demoted++;
      } catch (error) {
        result.errors.push({
          chunkId: demotion.chunkId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Process promotions
    for (const promotion of plan.promotions) {
      try {
        await this.migrateChunk(promotion.chunkId, promotion.to);
        result.promoted++;
      } catch (error) {
        result.errors.push({
          chunkId: promotion.chunkId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  /**
   * Migrate a single chunk to a new tier
   */
  private async migrateChunk(chunkId: string, targetTier: StorageTier): Promise<void> {
    const supabase = createServerClient();

    // Update tier in stats table
    const { error: updateError } = await supabase
      .from('chunk_access_stats')
      .update({ tier: targetTier, updated_at: new Date().toISOString() })
      .eq('chunk_id', chunkId)
      .eq('user_id', this.userId);

    if (updateError) {
      throw new Error(`Failed to update tier: ${updateError.message}`);
    }

    // Queue background job for index migration
    const { error: jobError } = await supabase.from('tier_migration_jobs').insert({
      chunk_id: chunkId,
      user_id: this.userId,
      target_tier: targetTier,
      status: 'pending',
      created_at: new Date().toISOString(),
    });

    if (jobError) {
      console.error(`Failed to queue migration job for chunk ${chunkId}:`, jobError);
    }
  }

  /**
   * Get tier settings
   */
  getTierSettings(tier: StorageTier): TierSettings {
    return this.config[tier];
  }

  /**
   * Calculate cost change from migrations
   */
  private calculateCostChange(
    demotions: TierMigration[],
    promotions: TierMigration[]
  ): number {
    let costChange = 0;

    // Demotions save money
    for (const demotion of demotions) {
      const fromCost = this.config[demotion.from].costPerMVectors;
      const toCost = this.config[demotion.to].costPerMVectors;
      costChange -= (fromCost - toCost) / 1_000_000; // Per vector
    }

    // Promotions cost money
    for (const promotion of promotions) {
      const fromCost = this.config[promotion.from].costPerMVectors;
      const toCost = this.config[promotion.to].costPerMVectors;
      costChange += (toCost - fromCost) / 1_000_000; // Per vector
    }

    return costChange;
  }

  /**
   * Calculate days since a date
   */
  private daysSince(date: Date): number {
    return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  }
}

/**
 * Get tier color for UI display
 */
export function getTierColor(tier: StorageTier): string {
  switch (tier) {
    case 'hot':
      return '#ef4444'; // red
    case 'warm':
      return '#f59e0b'; // amber
    case 'cold':
      return '#3b82f6'; // blue
    default:
      return '#6b7280'; // gray
  }
}

/**
 * Get tier label for UI display
 */
export function getTierLabel(tier: StorageTier): string {
  switch (tier) {
    case 'hot':
      return 'Hot (Fast)';
    case 'warm':
      return 'Warm (Standard)';
    case 'cold':
      return 'Cold (Archive)';
    default:
      return tier;
  }
}

/**
 * Calculate storage cost for given distribution
 */
export function calculateStorageCost(
  distribution: TierDistribution,
  config: TierConfig = DEFAULT_TIER_CONFIG
): number {
  const hotCost = (distribution.hot / 1_000_000) * config.hot.costPerMVectors;
  const warmCost = (distribution.warm / 1_000_000) * config.warm.costPerMVectors;
  const coldCost = (distribution.cold / 1_000_000) * config.cold.costPerMVectors;

  return hotCost + warmCost + coldCost;
}
