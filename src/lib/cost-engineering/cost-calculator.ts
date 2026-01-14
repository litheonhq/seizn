/**
 * Seizn Vector Cost Engineering - Cost Calculator
 *
 * Calculates and estimates costs for vector storage and queries.
 * Provides detailed breakdowns and optimization suggestions.
 */

import { createServerClient } from '@/lib/supabase';
import {
  TierConfig,
  TierDistribution,
  CostComponents,
  MonthlyCostReport,
  CostEstimate,
  CostEstimateRequest,
  CostRecommendation,
  DEFAULT_TIER_CONFIG, } from './types';

// Re-export default config
export { DEFAULT_TIER_CONFIG } from './types';

// ============================================
// Pricing Constants
// ============================================

/**
 * Embedding model pricing (per 1M tokens)
 */
export const EMBEDDING_PRICING: Record<string, number> = {
  'text-embedding-3-small': 0.02,
  'text-embedding-3-large': 0.13,
  'text-embedding-ada-002': 0.10,
  'voyage-3': 0.06,
  'voyage-3-lite': 0.02,
  'gemini-embedding': 0.025,
};

/**
 * Rerank model pricing (per 1000 queries)
 */
export const RERANK_PRICING: Record<string, number> = {
  'cohere-rerank-v3': 2.0,
  'cohere-rerank-english-v3': 1.0,
  'bge-reranker-v2-m3': 0.5,
  'jina-reranker-v2': 0.5,
};

/**
 * LLM pricing (per 1M tokens: [input, output])
 */
export const LLM_PRICING: Record<string, [number, number]> = {
  'gpt-4o': [2.5, 10.0],
  'gpt-4o-mini': [0.15, 0.6],
  'gpt-4-turbo': [10.0, 30.0],
  'claude-3-5-sonnet': [3.0, 15.0],
  'claude-3-5-haiku': [0.8, 4.0],
  'claude-3-opus': [15.0, 75.0],
  'gemini-1.5-pro': [3.5, 10.5],
  'gemini-1.5-flash': [0.075, 0.3],
};

/**
 * Vector storage pricing (per 1M vectors per month)
 */
export const STORAGE_PRICING = {
  hot: 10.0,
  warm: 3.0,
  cold: 0.5,
  default: 5.0,
};

/**
 * Cost Calculator
 *
 * Calculates costs for various operations and generates reports.
 */
export class CostCalculator {
  private userId: string;
  private tierConfig: TierConfig;

  constructor(userId: string, tierConfig?: Partial<TierConfig>) {
    this.userId = userId;
    this.tierConfig = { ...DEFAULT_TIER_CONFIG, ...tierConfig } as TierConfig;
  }

  /**
   * Estimate monthly cost for a given configuration
   */
  estimateMonthlyCost(request: CostEstimateRequest): CostEstimate {
    const {
      vectorCount,
      dimensions,
      queriesPerMonth,
      averageTopK,
      rerankEnabled,
      expectedCacheHitRate = 0.3,
    } = request;

    // Calculate storage costs by tier
    const distribution = this.estimateTierDistribution(vectorCount, request.tierConfig);
    const storageCost = this.calculateStorageCost(distribution);

    // Calculate query costs
    const effectiveQueries = queriesPerMonth * (1 - expectedCacheHitRate);
    const embeddingCost = this.calculateEmbeddingCost(
      effectiveQueries,
      dimensions,
      'voyage-3'
    );
    const searchCost = this.calculateSearchCost(effectiveQueries, averageTopK);
    const rerankCost = rerankEnabled
      ? this.calculateRerankCost(effectiveQueries, averageTopK, 'cohere-rerank-v3')
      : 0;

    const totalMonthlyCost = storageCost + embeddingCost + searchCost + rerankCost;
    const costPer1000Queries = (totalMonthlyCost / (queriesPerMonth / 1000)) || 0;

    // Generate optimization suggestions
    const optimizations = this.generateOptimizations({
      distribution,
      cacheHitRate: expectedCacheHitRate,
      rerankEnabled,
      totalCost: totalMonthlyCost,
    });

    return {
      monthlyCostUsd: storageCost,
      monthlyQueryCostUsd: embeddingCost + searchCost + rerankCost,
      totalMonthlyCostUsd: totalMonthlyCost,
      costPer1000Queries,
      breakdown: {
        storage: {
          hot: distribution.hot * (STORAGE_PRICING.hot / 1_000_000),
          warm: distribution.warm * (STORAGE_PRICING.warm / 1_000_000),
          cold: distribution.cold * (STORAGE_PRICING.cold / 1_000_000),
          total: storageCost,
        },
        query: {
          embedding: embeddingCost,
          search: searchCost,
          rerank: rerankCost,
          total: embeddingCost + searchCost + rerankCost,
        },
        cacheSavings: this.calculateCacheSavings(
          queriesPerMonth,
          expectedCacheHitRate,
          embeddingCost / effectiveQueries
        ),
        tieringSavings: this.calculateTieringSavings(distribution, vectorCount),
        totalCost: totalMonthlyCost,
        totalSavings: 0, // Calculated in report
      },
      optimizations,
    };
  }

  /**
   * Calculate storage cost for a tier distribution
   */
  calculateStorageCost(distribution: TierDistribution): number {
    return (
      (distribution.hot / 1_000_000) * STORAGE_PRICING.hot +
      (distribution.warm / 1_000_000) * STORAGE_PRICING.warm +
      (distribution.cold / 1_000_000) * STORAGE_PRICING.cold
    );
  }

  /**
   * Calculate embedding cost
   */
  calculateEmbeddingCost(
    queryCount: number,
    dimensions: number,
    model: string = 'voyage-3'
  ): number {
    // Estimate tokens per query (roughly query length / 4)
    const avgTokensPerQuery = 50; // Conservative estimate
    const totalTokens = queryCount * avgTokensPerQuery;
    const pricePerMToken = EMBEDDING_PRICING[model] || EMBEDDING_PRICING['voyage-3'];

    return (totalTokens / 1_000_000) * pricePerMToken;
  }

  /**
   * Calculate search cost (vector similarity operations)
   */
  calculateSearchCost(queryCount: number, topK: number): number {
    // Base cost per search operation
    const baseCostPerSearch = 0.00001; // $0.00001 per search
    const topKMultiplier = 1 + Math.log10(topK + 1) * 0.2;

    return queryCount * baseCostPerSearch * topKMultiplier;
  }

  /**
   * Calculate rerank cost
   */
  calculateRerankCost(
    queryCount: number,
    candidateCount: number,
    model: string = 'cohere-rerank-v3'
  ): number {
    const pricePer1000 = RERANK_PRICING[model] || RERANK_PRICING['cohere-rerank-v3'];
    // Cost scales with number of candidates
    const effectiveCost = (pricePer1000 / 1000) * (candidateCount / 10);

    return queryCount * effectiveCost;
  }

  /**
   * Calculate LLM cost for RAG
   */
  calculateLLMCost(
    queryCount: number,
    avgInputTokens: number,
    avgOutputTokens: number,
    model: string = 'gpt-4o-mini'
  ): number {
    const [inputPrice, outputPrice] = LLM_PRICING[model] || LLM_PRICING['gpt-4o-mini'];

    const inputCost = (queryCount * avgInputTokens / 1_000_000) * inputPrice;
    const outputCost = (queryCount * avgOutputTokens / 1_000_000) * outputPrice;

    return inputCost + outputCost;
  }

  /**
   * Generate monthly cost report
   */
  async generateMonthlyReport(
    month?: Date,
    collectionId?: string
  ): Promise<MonthlyCostReport> {
    const supabase = createServerClient();
    const reportDate = month || new Date();
    const periodStart = new Date(reportDate.getFullYear(), reportDate.getMonth(), 1);
    const periodEnd = new Date(reportDate.getFullYear(), reportDate.getMonth() + 1, 0);

    // Get query stats for the period
    let query = supabase
      .from('query_costs')
      .select('*')
      .eq('user_id', this.userId)
      .gte('created_at', periodStart.toISOString())
      .lte('created_at', periodEnd.toISOString());

    if (collectionId) {
      query = query.eq('collection_id', collectionId);
    }

    const { data: queryCosts, error } = await query;

    if (error) {
      console.error('Failed to get query costs:', error);
    }

    // Calculate totals
    const costs = queryCosts || [];
    const totalQueries = costs.length;
    const embeddingCost = costs.reduce((sum, c) => sum + (c.embedding_cost || 0), 0);
    const searchCost = costs.reduce((sum, c) => sum + (c.search_cost || 0), 0);
    const rerankCost = costs.reduce((sum, c) => sum + (c.rerank_cost || 0), 0);

    // Get cache stats
    const { data: cacheStats } = await supabase
      .from('cost_cache_metrics')
      .select('hit_count, miss_count')
      .eq('user_id', this.userId)
      .single();

    const cacheHits = cacheStats?.hit_count || 0;
    const cacheMisses = cacheStats?.miss_count || 0;
    const cacheHitRate = cacheHits / (cacheHits + cacheMisses) || 0;

    // Get tier distribution
    const { data: tierData } = await supabase
      .from('chunk_access_stats')
      .select('tier')
      .eq('user_id', this.userId);

    const tierDistribution = this.countTiers(tierData || []);
    const storageCost = this.calculateStorageCost(tierDistribution);

    // Calculate totals
    const actualCostUsd = embeddingCost + searchCost + rerankCost + storageCost;
    const baselineCostUsd = this.calculateBaselineCost(
      totalQueries,
      cacheHits,
      tierDistribution
    );
    const savingsUsd = baselineCostUsd - actualCostUsd;
    const savingsPercent = baselineCostUsd > 0 ? (savingsUsd / baselineCostUsd) * 100 : 0;

    // Generate recommendations
    const recommendations = await this.generateReportRecommendations(
      cacheHitRate,
      tierDistribution,
      actualCostUsd
    );

    return {
      periodStart,
      periodEnd,
      totalQueries,
      cacheHits,
      cacheHitRate,
      tierDistribution,
      baselineCostUsd,
      actualCostUsd,
      savingsUsd,
      savingsPercent,
      components: {
        storage: {
          hot: (tierDistribution.hot / 1_000_000) * STORAGE_PRICING.hot,
          warm: (tierDistribution.warm / 1_000_000) * STORAGE_PRICING.warm,
          cold: (tierDistribution.cold / 1_000_000) * STORAGE_PRICING.cold,
          total: storageCost,
        },
        query: {
          embedding: embeddingCost,
          search: searchCost,
          rerank: rerankCost,
          total: embeddingCost + searchCost + rerankCost,
        },
        cacheSavings: this.calculateCacheSavings(
          totalQueries + cacheHits,
          cacheHitRate,
          (embeddingCost + searchCost) / (totalQueries || 1)
        ),
        tieringSavings: this.calculateTieringSavings(
          tierDistribution,
          tierDistribution.total
        ),
        totalCost: actualCostUsd,
        totalSavings: savingsUsd,
      },
      recommendations,
    };
  }

  /**
   * Calculate cost for a single query
   */
  calculateQueryCost(params: {
    embeddingModel?: string;
    embeddingTokens?: number;
    rerankModel?: string;
    rerankCandidates?: number;
    llmModel?: string;
    llmInputTokens?: number;
    llmOutputTokens?: number;
    cacheHit?: boolean;
  }): number {
    if (params.cacheHit) {
      return 0; // Cache hits are free
    }

    let totalCost = 0;

    // Embedding cost
    if (params.embeddingTokens) {
      const embeddingPrice =
        EMBEDDING_PRICING[params.embeddingModel || 'voyage-3'] || 0.06;
      totalCost += (params.embeddingTokens / 1_000_000) * embeddingPrice;
    }

    // Rerank cost
    if (params.rerankCandidates) {
      const rerankPrice =
        RERANK_PRICING[params.rerankModel || 'cohere-rerank-v3'] || 2.0;
      totalCost += (rerankPrice / 1000) * (params.rerankCandidates / 10);
    }

    // LLM cost
    if (params.llmInputTokens || params.llmOutputTokens) {
      const [inputPrice, outputPrice] =
        LLM_PRICING[params.llmModel || 'gpt-4o-mini'] || [0.15, 0.6];
      totalCost += ((params.llmInputTokens || 0) / 1_000_000) * inputPrice;
      totalCost += ((params.llmOutputTokens || 0) / 1_000_000) * outputPrice;
    }

    return totalCost;
  }

  // ============================================
  // Helper Methods
  // ============================================

  private estimateTierDistribution(
    totalVectors: number,
    config?: TierConfig
  ): TierDistribution {
    // Default distribution: 20% hot, 30% warm, 50% cold
    return {
      hot: Math.round(totalVectors * 0.2),
      warm: Math.round(totalVectors * 0.3),
      cold: Math.round(totalVectors * 0.5),
      total: totalVectors,
    };
  }

  private countTiers(data: Array<{ tier: string }>): TierDistribution {
    const distribution = { hot: 0, warm: 0, cold: 0, total: data.length };

    for (const item of data) {
      if (item.tier === 'hot') distribution.hot++;
      else if (item.tier === 'warm') distribution.warm++;
      else distribution.cold++;
    }

    return distribution;
  }

  private calculateCacheSavings(
    totalQueries: number,
    hitRate: number,
    avgQueryCost: number
  ): number {
    const cachedQueries = totalQueries * hitRate;
    return cachedQueries * avgQueryCost;
  }

  private calculateTieringSavings(
    distribution: TierDistribution,
    totalVectors: number
  ): number {
    // Calculate savings compared to all-hot storage
    const allHotCost = (totalVectors / 1_000_000) * STORAGE_PRICING.hot;
    const actualCost = this.calculateStorageCost(distribution);
    return allHotCost - actualCost;
  }

  private calculateBaselineCost(
    totalQueries: number,
    cacheHits: number,
    distribution: TierDistribution
  ): number {
    // Baseline: no caching, all hot storage
    const baselineQueries = totalQueries + cacheHits;
    const baselineQueryCost = this.calculateEmbeddingCost(baselineQueries, 1024, 'voyage-3');
    const baselineStorageCost = (distribution.total / 1_000_000) * STORAGE_PRICING.hot;

    return baselineQueryCost + baselineStorageCost;
  }

  private async generateReportRecommendations(
    cacheHitRate: number,
    tierDistribution: TierDistribution,
    currentCost: number
  ): Promise<CostRecommendation[]> {
    const recommendations: CostRecommendation[] = [];

    // Check cache improvement opportunity
    if (cacheHitRate < 0.4) {
      recommendations.push({
        id: `rec_cache_${Date.now()}`,
        type: 'caching',
        title: 'Improve cache hit rate',
        description: `Current cache hit rate is ${(cacheHitRate * 100).toFixed(1)}%. Improving to 50% could save ~${(currentCost * 0.1).toFixed(2)} USD/month.`,
        estimatedSavingsUsd: currentCost * 0.1,
        impact: 'medium',
        confidence: 0.75,
        action: {
          type: 'enable_cache',
          target: 'all',
          params: { similarityThreshold: 0.92 },
        },
        applied: false,
        createdAt: new Date().toISOString(),
      });
    }

    // Check tiering opportunity
    const hotPercent = tierDistribution.hot / (tierDistribution.total || 1);
    if (hotPercent > 0.3) {
      recommendations.push({
        id: `rec_tier_${Date.now()}`,
        type: 'tiering',
        title: 'Move inactive data to cold storage',
        description: `${(hotPercent * 100).toFixed(0)}% of data is in hot storage. Moving inactive data to cold could reduce costs.`,
        estimatedSavingsUsd: currentCost * 0.15,
        impact: 'high',
        confidence: 0.8,
        action: {
          type: 'migrate_tier',
          target: 'all',
          params: {},
        },
        applied: false,
        createdAt: new Date().toISOString(),
      });
    }

    return recommendations;
  }

  private generateOptimizations(params: {
    distribution: TierDistribution;
    cacheHitRate: number;
    rerankEnabled: boolean;
    totalCost: number;
  }): CostRecommendation[] {
    const { distribution, cacheHitRate, rerankEnabled, totalCost } = params;
    const recommendations: CostRecommendation[] = [];

    // Cache optimization
    if (cacheHitRate < 0.5) {
      recommendations.push({
        id: `opt_cache_${Date.now()}`,
        type: 'caching',
        title: 'Enable semantic caching',
        description: 'Semantic caching can reduce redundant embeddings for similar queries.',
        estimatedSavingsUsd: totalCost * (0.5 - cacheHitRate) * 0.5,
        impact: 'medium',
        confidence: 0.7,
        action: {
          type: 'enable_cache',
          target: 'all',
          params: { similarityThreshold: 0.95 },
        },
        applied: false,
        createdAt: new Date().toISOString(),
      });
    }

    // Tiering optimization
    const coldPercent = distribution.cold / (distribution.total || 1);
    if (coldPercent < 0.4) {
      recommendations.push({
        id: `opt_tier_${Date.now()}`,
        type: 'tiering',
        title: 'Enable automatic tiering',
        description: 'Auto-tiering moves infrequently accessed data to cheaper storage.',
        estimatedSavingsUsd: totalCost * 0.2,
        impact: 'high',
        confidence: 0.8,
        action: {
          type: 'migrate_tier',
          target: 'all',
          params: {},
        },
        applied: false,
        createdAt: new Date().toISOString(),
      });
    }

    return recommendations;
  }
}

/**
 * Format cost as currency string
 */
export function formatCost(costUsd: number, precision = 2): string {
  return `$${costUsd.toFixed(precision)}`;
}

/**
 * Calculate cost savings percentage
 */
export function calculateSavingsPercent(baseline: number, actual: number): number {
  if (baseline === 0) return 0;
  return ((baseline - actual) / baseline) * 100;
}
