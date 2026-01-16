/**
 * Seizn Vector Cost Engineering - Autopilot
 *
 * Automatic optimization system that analyzes usage patterns
 * and applies cost-saving measures while maintaining quality.
 */

import { createServerClient } from '@/lib/supabase';
import { TierManager } from './tiering';
import { SemanticCache } from './semantic-cache';
import {
  DEFAULT_AUTOPILOT_CONFIG,
  type AutopilotConfig,
  type CostRecommendation,
  type RecommendationType,
  type ImpactLevel,
  type ActionType,
  type AutopilotDecision,
  type OptimizationResult,
  type OptimizationAction,
  type TierDistribution,
  type CacheStats,
} from './types';

type RecommendationRow = {
  id: string;
  type: CostRecommendation['type'];
  title: string;
  description: string;
  estimated_savings_usd: number | null;
  impact: CostRecommendation['impact'];
  confidence: number | null;
  action: CostRecommendation['action'];
  applied: boolean | null;
  applied_at?: string | null;
  created_at?: string | null;
};

// Re-export default config
export { DEFAULT_AUTOPILOT_CONFIG };

/**
 * Cost Autopilot
 *
 * Analyzes usage patterns and generates/applies cost optimization recommendations.
 */
export class CostAutopilot {
  private config: AutopilotConfig;
  private userId: string;

  constructor(userId: string, config?: Partial<AutopilotConfig>) {
    this.userId = userId;
    this.config = {
      ...DEFAULT_AUTOPILOT_CONFIG,
      ...config,
    } as AutopilotConfig;
  }

  /**
   * Analyze and generate recommendations
   */
  async analyze(collectionId?: string): Promise<CostRecommendation[]> {
    if (!this.config.enabled) {
      return [];
    }

    const recommendations: CostRecommendation[] = [];

    // 1. Analyze caching opportunities
    const cacheRec = await this.analyzeCaching(collectionId);
    if (cacheRec) recommendations.push(cacheRec);

    // 2. Analyze tiering opportunities
    const tieringRec = await this.analyzeTiering(collectionId);
    if (tieringRec) recommendations.push(tieringRec);

    // 3. Analyze query patterns
    const patternRecs = await this.analyzeQueryPatterns(collectionId);
    recommendations.push(...patternRecs);

    // 4. Analyze model selection
    const modelRec = await this.analyzeModelSelection(collectionId);
    if (modelRec) recommendations.push(modelRec);

    // Sort by estimated savings
    return recommendations.sort((a, b) => b.estimatedSavingsUsd - a.estimatedSavingsUsd);
  }

  /**
   * Apply a recommendation
   */
  async applyRecommendation(
    recommendationId: string,
    dryRun = false
  ): Promise<OptimizationResult> {
    const startTime = Date.now();
    const result: OptimizationResult = {
      success: false,
      actions: [],
      totalSavingsUsd: 0,
      recommendations: [],
      durationMs: 0,
    };

    // Get recommendation
    const supabase = createServerClient();
    const { data: rec, error } = await supabase
      .from('cost_recommendations')
      .select('*')
      .eq('id', recommendationId)
      .eq('user_id', this.userId)
      .single();

    if (error || !rec) {
      result.durationMs = Date.now() - startTime;
      return result;
    }

    const recommendation = this.mapToRecommendation(rec);

    // Check quality threshold
    if (!this.checkQualityConstraint(recommendation)) {
      result.actions.push({
        type: recommendation.action.type,
        target: recommendation.action.target,
        status: 'skipped',
        error: 'Would exceed quality threshold',
        savingsUsd: 0,
      });
      result.durationMs = Date.now() - startTime;
      return result;
    }

    if (dryRun) {
      result.success = true;
      result.actions.push({
        type: recommendation.action.type,
        target: recommendation.action.target,
        status: 'success',
        savingsUsd: recommendation.estimatedSavingsUsd,
      });
      result.totalSavingsUsd = recommendation.estimatedSavingsUsd;
      result.durationMs = Date.now() - startTime;
      return result;
    }

    // Execute action
    const actionResult = await this.executeAction(recommendation);
    result.actions.push(actionResult);

    if (actionResult.status === 'success') {
      result.success = true;
      result.totalSavingsUsd = actionResult.savingsUsd;

      // Mark recommendation as applied
      await supabase
        .from('cost_recommendations')
        .update({
          applied: true,
          applied_at: new Date().toISOString(),
        })
        .eq('id', recommendationId);

      // Record decision
      await this.recordDecision(recommendationId, 'apply', 'Applied by autopilot');
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  /**
   * Run full optimization cycle
   */
  async runOptimization(
    collectionId?: string,
    types?: RecommendationType[],
    dryRun = false
  ): Promise<OptimizationResult> {
    const startTime = Date.now();
    const result: OptimizationResult = {
      success: false,
      actions: [],
      totalSavingsUsd: 0,
      recommendations: [],
      durationMs: 0,
    };

    // Generate recommendations
    const recommendations = await this.analyze(collectionId);
    result.recommendations = recommendations;

    // Filter by types if specified
    const filteredRecs = types
      ? recommendations.filter((r) => types.includes(r.type))
      : recommendations;

    // Apply recommendations based on mode
    for (const rec of filteredRecs) {
      // Check confidence threshold based on mode
      if (!this.shouldApply(rec)) {
        continue;
      }

      // Save recommendation to DB
      await this.saveRecommendation(rec, collectionId);

      if (this.config.autoApply || dryRun) {
        const applyResult = await this.applyRecommendation(rec.id, dryRun);
        result.actions.push(...applyResult.actions);
        result.totalSavingsUsd += applyResult.totalSavingsUsd;
      }
    }

    result.success = true;
    result.durationMs = Date.now() - startTime;
    return result;
  }

  /**
   * Get pending recommendations
   */
  async getPendingRecommendations(
    collectionId?: string
  ): Promise<CostRecommendation[]> {
    const supabase = createServerClient();

    let query = supabase
      .from('cost_recommendations')
      .select('*')
      .eq('user_id', this.userId)
      .eq('applied', false)
      .order('estimated_savings_usd', { ascending: false });

    if (collectionId) {
      query = query.eq('collection_id', collectionId);
    }

    const { data, error } = await query;

    if (error || !data) {
      return [];
    }

    return data.map(this.mapToRecommendation);
  }

  /**
   * Update autopilot configuration
   */
  updateConfig(config: Partial<AutopilotConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): AutopilotConfig {
    return { ...this.config };
  }

  // ============================================
  // Analysis Methods
  // ============================================

  private async analyzeCaching(
    collectionId?: string
  ): Promise<CostRecommendation | null> {
    const cache = new SemanticCache(this.userId);
    const stats = await cache.getStats();

    // Check if caching could be improved
    if (stats.hitRate < 0.3) {
      // Low hit rate - suggest enabling/improving cache
      const estimatedSavings = this.estimateCacheSavings(stats);

      if (estimatedSavings > 0.5) {
        return {
          id: this.generateId('cache'),
          type: 'caching',
          title: 'Enable semantic query caching',
          description: `Current cache hit rate is ${(stats.hitRate * 100).toFixed(1)}%. Enabling semantic caching could reduce costs by matching similar queries.`,
          estimatedSavingsUsd: estimatedSavings,
          impact: estimatedSavings > 10 ? 'high' : estimatedSavings > 5 ? 'medium' : 'low',
          confidence: 0.8,
          action: {
            type: 'enable_cache',
            target: collectionId || 'all',
            params: { similarityThreshold: 0.95, ttlSeconds: 3600 },
          },
          applied: false,
          createdAt: new Date().toISOString(),
        };
      }
    }

    // Check if TTL should be adjusted
    if (stats.hitRate > 0.6 && stats.averageLatencySavingsMs > 200) {
      // Good cache performance - suggest longer TTL
      return {
        id: this.generateId('cache'),
        type: 'caching',
        title: 'Increase cache TTL',
        description: `Cache is performing well with ${(stats.hitRate * 100).toFixed(1)}% hit rate. Increasing TTL could further improve performance.`,
        estimatedSavingsUsd: this.estimateTTLSavings(stats),
        impact: 'low',
        confidence: 0.7,
        action: {
          type: 'adjust_cache_ttl',
          target: collectionId || 'all',
          params: { ttlSeconds: 7200 },
        },
        applied: false,
        createdAt: new Date().toISOString(),
      };
    }

    return null;
  }

  private async analyzeTiering(
    collectionId?: string
  ): Promise<CostRecommendation | null> {
    const tierManager = new TierManager(this.userId);
    const distribution = await tierManager.getTierDistribution(collectionId);
    const plan = await tierManager.scheduleMigration(collectionId);

    if (plan.demotions.length > 10) {
      // Significant data can be demoted
      const estimatedSavings = Math.abs(plan.estimatedCostChange) * 30; // Monthly

      return {
        id: this.generateId('tier'),
        type: 'tiering',
        title: 'Move inactive data to cold storage',
        description: `${plan.demotions.length} chunks haven't been accessed recently and can be moved to cold storage.`,
        estimatedSavingsUsd: estimatedSavings,
        impact: estimatedSavings > 20 ? 'high' : estimatedSavings > 10 ? 'medium' : 'low',
        confidence: 0.85,
        action: {
          type: 'migrate_tier',
          target: collectionId || 'all',
          params: { demotionCount: plan.demotions.length },
        },
        applied: false,
        createdAt: new Date().toISOString(),
      };
    }

    return null;
  }

  private async analyzeQueryPatterns(
    collectionId?: string
  ): Promise<CostRecommendation[]> {
    const recommendations: CostRecommendation[] = [];
    const supabase = createServerClient();

    // Get query stats
    const { data: queryStats } = await supabase.rpc('get_query_pattern_stats', {
      p_user_id: this.userId,
      p_collection_id: collectionId,
    });

    if (!queryStats) {
      return recommendations;
    }

    // Check for batch processing opportunity
    const avgInterval = queryStats.avg_query_interval_ms;
    if (avgInterval && avgInterval < 1000) {
      // Many queries in quick succession
      recommendations.push({
        id: this.generateId('batch'),
        type: 'batch_processing',
        title: 'Enable batch query processing',
        description: 'Frequent queries detected. Batch processing could reduce overhead and cost.',
        estimatedSavingsUsd: queryStats.query_count * 0.0001 * 0.3, // 30% savings
        impact: 'medium',
        confidence: 0.7,
        action: {
          type: 'batch_queries',
          target: collectionId || 'all',
          params: { batchSize: 10, windowMs: 100 },
        },
        applied: false,
        createdAt: new Date().toISOString(),
      });
    }

    // Check for topK optimization
    const avgTopK = queryStats.avg_top_k;
    const avgUsedResults = queryStats.avg_used_results;
    if (avgTopK && avgUsedResults && avgTopK > avgUsedResults * 1.5) {
      // Retrieving more than needed
      const newTopK = Math.ceil(avgUsedResults * 1.2);
      recommendations.push({
        id: this.generateId('topk'),
        type: 'query_optimization',
        title: 'Reduce retrieval topK',
        description: `Average topK (${avgTopK}) is higher than actual usage (${avgUsedResults.toFixed(1)}). Reducing topK could save costs.`,
        estimatedSavingsUsd: queryStats.query_count * 0.0001 * ((avgTopK - newTopK) / avgTopK),
        impact: 'low',
        confidence: 0.75,
        action: {
          type: 'reduce_topk',
          target: collectionId || 'all',
          params: { newTopK },
        },
        applied: false,
        createdAt: new Date().toISOString(),
      });
    }

    return recommendations;
  }

  private async analyzeModelSelection(
    collectionId?: string
  ): Promise<CostRecommendation | null> {
    const supabase = createServerClient();

    // Get current model usage and quality metrics
    const { data: modelStats } = await supabase.rpc('get_model_usage_stats', {
      p_user_id: this.userId,
      p_collection_id: collectionId,
    });

    if (!modelStats) {
      return null;
    }

    // Check if cheaper model could work
    const currentModel = modelStats.embedding_model;
    const qualityScore = modelStats.avg_quality_score;

    if (
      currentModel === 'text-embedding-3-large' &&
      qualityScore > this.config.qualityThreshold + 0.1
    ) {
      // Quality is high enough to use smaller model
      return {
        id: this.generateId('model'),
        type: 'model_selection',
        title: 'Switch to smaller embedding model',
        description: `Quality score (${(qualityScore * 100).toFixed(1)}%) suggests smaller embedding model would suffice.`,
        estimatedSavingsUsd: modelStats.monthly_embedding_cost * 0.6, // ~60% savings
        impact: 'medium',
        confidence: 0.65,
        action: {
          type: 'switch_model',
          target: collectionId || 'all',
          params: {
            from: 'text-embedding-3-large',
            to: 'text-embedding-3-small',
          },
        },
        applied: false,
        createdAt: new Date().toISOString(),
      };
    }

    return null;
  }

  // ============================================
  // Execution Methods
  // ============================================

  private async executeAction(
    recommendation: CostRecommendation
  ): Promise<OptimizationAction> {
    const { action } = recommendation;

    try {
      switch (action.type) {
        case 'enable_cache':
          return await this.executeEnableCache(action, recommendation);

        case 'adjust_cache_ttl':
          return await this.executeAdjustCacheTTL(action, recommendation);

        case 'migrate_tier':
          return await this.executeMigrateTier(action, recommendation);

        case 'reduce_topk':
          return await this.executeReduceTopK(action, recommendation);

        case 'batch_queries':
          return await this.executeBatchQueries(action, recommendation);

        case 'switch_model':
          return await this.executeSwitchModel(action, recommendation);

        default:
          return {
            type: action.type,
            target: action.target,
            status: 'skipped',
            error: `Unknown action type: ${action.type}`,
            savingsUsd: 0,
          };
      }
    } catch (error) {
      return {
        type: action.type,
        target: action.target,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        savingsUsd: 0,
      };
    }
  }

  private async executeEnableCache(
    action: CostRecommendation['action'],
    recommendation: CostRecommendation
  ): Promise<OptimizationAction> {
    const supabase = createServerClient();
    const params = action.params as { similarityThreshold: number; ttlSeconds: number };

    await supabase
      .from('cost_engineering_settings')
      .upsert({
        user_id: this.userId,
        cache_enabled: true,
        cache_similarity_threshold: params.similarityThreshold,
        cache_ttl_seconds: params.ttlSeconds,
        updated_at: new Date().toISOString(),
      });

    return {
      type: 'enable_cache',
      target: action.target,
      status: 'success',
      savingsUsd: recommendation.estimatedSavingsUsd,
    };
  }

  private async executeAdjustCacheTTL(
    action: CostRecommendation['action'],
    recommendation: CostRecommendation
  ): Promise<OptimizationAction> {
    const supabase = createServerClient();
    const params = action.params as { ttlSeconds: number };

    await supabase
      .from('cost_engineering_settings')
      .update({
        cache_ttl_seconds: params.ttlSeconds,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', this.userId);

    return {
      type: 'adjust_cache_ttl',
      target: action.target,
      status: 'success',
      savingsUsd: recommendation.estimatedSavingsUsd,
    };
  }

  private async executeMigrateTier(
    action: CostRecommendation['action'],
    recommendation: CostRecommendation
  ): Promise<OptimizationAction> {
    const tierManager = new TierManager(this.userId);
    const plan = await tierManager.scheduleMigration(
      action.target !== 'all' ? action.target : undefined
    );
    const result = await tierManager.executeMigration(plan);

    if (result.errors.length > 0) {
      return {
        type: 'migrate_tier',
        target: action.target,
        status: 'failed',
        error: `${result.errors.length} chunks failed to migrate`,
        savingsUsd: recommendation.estimatedSavingsUsd * (result.demoted / (plan.demotions.length || 1)),
      };
    }

    return {
      type: 'migrate_tier',
      target: action.target,
      status: 'success',
      savingsUsd: recommendation.estimatedSavingsUsd,
    };
  }

  private async executeReduceTopK(
    action: CostRecommendation['action'],
    recommendation: CostRecommendation
  ): Promise<OptimizationAction> {
    const supabase = createServerClient();
    const params = action.params as { newTopK: number };

    await supabase
      .from('cost_engineering_settings')
      .upsert({
        user_id: this.userId,
        default_top_k: params.newTopK,
        updated_at: new Date().toISOString(),
      });

    return {
      type: 'reduce_topk',
      target: action.target,
      status: 'success',
      savingsUsd: recommendation.estimatedSavingsUsd,
    };
  }

  private async executeBatchQueries(
    action: CostRecommendation['action'],
    recommendation: CostRecommendation
  ): Promise<OptimizationAction> {
    const supabase = createServerClient();
    const params = action.params as { batchSize: number; windowMs: number };

    await supabase
      .from('cost_engineering_settings')
      .upsert({
        user_id: this.userId,
        batch_enabled: true,
        batch_size: params.batchSize,
        batch_window_ms: params.windowMs,
        updated_at: new Date().toISOString(),
      });

    return {
      type: 'batch_queries',
      target: action.target,
      status: 'success',
      savingsUsd: recommendation.estimatedSavingsUsd,
    };
  }

  private async executeSwitchModel(
    action: CostRecommendation['action'],
    recommendation: CostRecommendation
  ): Promise<OptimizationAction> {
    const supabase = createServerClient();
    const params = action.params as { from: string; to: string };

    await supabase
      .from('cost_engineering_settings')
      .upsert({
        user_id: this.userId,
        embedding_model: params.to,
        updated_at: new Date().toISOString(),
      });

    return {
      type: 'switch_model',
      target: action.target,
      status: 'success',
      savingsUsd: recommendation.estimatedSavingsUsd,
    };
  }

  // ============================================
  // Helper Methods
  // ============================================

  private shouldApply(recommendation: CostRecommendation): boolean {
    const thresholds = {
      conservative: { minConfidence: 0.9, minSavings: 10 },
      balanced: { minConfidence: 0.75, minSavings: 5 },
      aggressive: { minConfidence: 0.6, minSavings: 1 },
    };

    const threshold = thresholds[this.config.mode];

    return (
      recommendation.confidence >= threshold.minConfidence &&
      recommendation.estimatedSavingsUsd >= threshold.minSavings
    );
  }

  private checkQualityConstraint(recommendation: CostRecommendation): boolean {
    // For model changes, check quality impact
    if (recommendation.type === 'model_selection') {
      // Assume quality impact is embedded in confidence
      return recommendation.confidence >= this.config.qualityThreshold;
    }

    return true;
  }

  private estimateCacheSavings(stats: CacheStats): number {
    // Estimate based on potential hit rate improvement
    const potentialHitRate = 0.5; // Conservative estimate
    const avgQueryCost = 0.001; // $0.001 per query
    const monthlyQueries = (stats.hitCount + stats.missCount) * 30;

    return monthlyQueries * avgQueryCost * (potentialHitRate - stats.hitRate);
  }

  private estimateTTLSavings(stats: CacheStats): number {
    // Longer TTL = more cache hits
    const additionalHitRate = 0.1;
    const avgQueryCost = 0.001;
    const monthlyQueries = (stats.hitCount + stats.missCount) * 30;

    return monthlyQueries * avgQueryCost * additionalHitRate;
  }

  private async saveRecommendation(
    recommendation: CostRecommendation,
    collectionId?: string
  ): Promise<void> {
    const supabase = createServerClient();

    await supabase.from('cost_recommendations').insert({
      id: recommendation.id,
      user_id: this.userId,
      collection_id: collectionId,
      type: recommendation.type,
      title: recommendation.title,
      description: recommendation.description,
      estimated_savings_usd: recommendation.estimatedSavingsUsd,
      impact: recommendation.impact,
      confidence: recommendation.confidence,
      action: recommendation.action,
      applied: false,
      created_at: recommendation.createdAt,
    });
  }

  private async recordDecision(
    recommendationId: string,
    decision: 'apply' | 'skip' | 'defer',
    reason: string
  ): Promise<void> {
    const supabase = createServerClient();

    await supabase.from('autopilot_decisions').insert({
      id: this.generateId('decision'),
      user_id: this.userId,
      recommendation_id: recommendationId,
      decision,
      reason,
      created_at: new Date().toISOString(),
    });
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  private mapToRecommendation(row: RecommendationRow): CostRecommendation {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description,
      estimatedSavingsUsd: row.estimated_savings_usd ?? 0,
      impact: row.impact,
      confidence: row.confidence ?? 0,
      action: row.action,
      applied: row.applied ?? false,
      appliedAt: row.applied_at ?? undefined,
      createdAt: row.created_at || new Date().toISOString(),
    };
  }
}
