/**
 * CostCalculator Tests
 *
 * Tests for the cost calculation functionality including:
 * - Monthly cost estimation
 * - Storage cost calculation
 * - Embedding cost calculation
 * - Search cost calculation
 * - Rerank cost calculation
 * - LLM cost calculation
 * - Query cost calculation
 * - Monthly report generation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CostCalculator,
  EMBEDDING_PRICING,
  RERANK_PRICING,
  LLM_PRICING,
  STORAGE_PRICING,
  formatCost,
  calculateSavingsPercent,
} from '../cost-calculator';
import type { TierDistribution, CostEstimateRequest } from '../types';

// Mock Supabase with proper chainable methods
vi.mock('@/lib/supabase', () => {
  const createChainableMock = (finalValue: unknown) => {
    const chain: Record<string, unknown> = {};
    const methods = ['select', 'eq', 'gte', 'lte', 'single', 'insert', 'update', 'delete'];
    methods.forEach(method => {
      chain[method] = vi.fn().mockImplementation(() => {
        if (method === 'single') {
          return Promise.resolve(finalValue);
        }
        return chain;
      });
    });
    // Make it thenable for async operations
    chain.then = vi.fn().mockImplementation((resolve: (value: unknown) => void) => resolve(finalValue));
    return chain;
  };

  return {
    createServerClient: vi.fn(() => ({
      from: vi.fn((table: string) => {
        if (table === 'query_costs') {
          return createChainableMock({
            data: [
              { embedding_cost: 0.01, search_cost: 0.001, rerank_cost: 0.005 },
              { embedding_cost: 0.02, search_cost: 0.002, rerank_cost: 0.01 },
            ],
            error: null,
          });
        }
        if (table === 'cost_cache_metrics') {
          return createChainableMock({
            data: { hit_count: 100, miss_count: 400 },
            error: null,
          });
        }
        if (table === 'chunk_access_stats') {
          return createChainableMock({
            data: [
              { tier: 'hot' },
              { tier: 'hot' },
              { tier: 'warm' },
              { tier: 'cold' },
              { tier: 'cold' },
            ],
            error: null,
          });
        }
        return createChainableMock({ data: null, error: null });
      }),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  };
});

describe('CostCalculator', () => {
  let calculator: CostCalculator;
  const testUserId = 'test-user-123';

  beforeEach(() => {
    vi.clearAllMocks();
    calculator = new CostCalculator(testUserId);
  });

  describe('constructor', () => {
    it('should initialize with default tier config', () => {
      const calc = new CostCalculator(testUserId);
      expect(calc).toBeDefined();
    });

    it('should merge custom tier config with defaults', () => {
      const customConfig = {
        hot: { maxAgeDays: 14, minAccessCount: 10, costPerMVectors: 15, indexType: 'hnsw' as const },
      };
      const calc = new CostCalculator(testUserId, customConfig);
      expect(calc).toBeDefined();
    });
  });

  describe('calculateStorageCost', () => {
    it('should calculate storage cost correctly', () => {
      const distribution: TierDistribution = {
        hot: 1_000_000,
        warm: 2_000_000,
        cold: 5_000_000,
        total: 8_000_000,
      };

      const cost = calculator.calculateStorageCost(distribution);
      // hot: 1M * $10/M = $10
      // warm: 2M * $3/M = $6
      // cold: 5M * $0.5/M = $2.5
      // Total: $18.5
      expect(cost).toBe(18.5);
    });

    it('should return 0 for empty distribution', () => {
      const distribution: TierDistribution = { hot: 0, warm: 0, cold: 0, total: 0 };
      const cost = calculator.calculateStorageCost(distribution);
      expect(cost).toBe(0);
    });

    it('should handle fractional vector counts', () => {
      const distribution: TierDistribution = {
        hot: 500_000,
        warm: 1_500_000,
        cold: 2_500_000,
        total: 4_500_000,
      };

      const cost = calculator.calculateStorageCost(distribution);
      // hot: 0.5M * $10/M = $5
      // warm: 1.5M * $3/M = $4.5
      // cold: 2.5M * $0.5/M = $1.25
      // Total: $10.75
      expect(cost).toBe(10.75);
    });
  });

  describe('calculateEmbeddingCost', () => {
    it('should calculate embedding cost with default model', () => {
      const cost = calculator.calculateEmbeddingCost(10000, 1024);
      // 10000 queries * 50 tokens/query = 500,000 tokens
      // 500,000 / 1,000,000 * $0.06 (voyage-3) = $0.03
      expect(cost).toBeCloseTo(0.03, 2);
    });

    it('should calculate embedding cost with specific model', () => {
      const cost = calculator.calculateEmbeddingCost(10000, 1024, 'text-embedding-3-large');
      // 10000 queries * 50 tokens/query = 500,000 tokens
      // 500,000 / 1,000,000 * $0.13 = $0.065
      expect(cost).toBeCloseTo(0.065, 3);
    });

    it('should handle zero queries', () => {
      const cost = calculator.calculateEmbeddingCost(0, 1024, 'voyage-3');
      expect(cost).toBe(0);
    });
  });

  describe('calculateSearchCost', () => {
    it('should calculate search cost correctly', () => {
      const cost = calculator.calculateSearchCost(10000, 10);
      // Base: $0.00001 per search
      // topK multiplier: 1 + log10(11) * 0.2 ≈ 1.21
      // 10000 * $0.00001 * 1.21 ≈ $0.121
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(1);
    });

    it('should scale with topK', () => {
      const costLowK = calculator.calculateSearchCost(10000, 5);
      const costHighK = calculator.calculateSearchCost(10000, 50);
      expect(costHighK).toBeGreaterThan(costLowK);
    });

    it('should handle zero queries', () => {
      const cost = calculator.calculateSearchCost(0, 10);
      expect(cost).toBe(0);
    });
  });

  describe('calculateRerankCost', () => {
    it('should calculate rerank cost with default model', () => {
      const cost = calculator.calculateRerankCost(1000, 10);
      // cohere-rerank-v3: $2.0/1000 queries
      // Cost scales with candidates: ($2.0/1000) * (10/10) = $0.002 per query
      // 1000 * $0.002 = $2.0
      expect(cost).toBeGreaterThan(0);
    });

    it('should calculate rerank cost with specific model', () => {
      const cost = calculator.calculateRerankCost(1000, 10, 'bge-reranker-v2-m3');
      // $0.5/1000 queries, scaled by candidates
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(calculator.calculateRerankCost(1000, 10, 'cohere-rerank-v3'));
    });

    it('should scale with candidate count', () => {
      const costFewCandidates = calculator.calculateRerankCost(1000, 5);
      const costManyCandidates = calculator.calculateRerankCost(1000, 50);
      expect(costManyCandidates).toBeGreaterThan(costFewCandidates);
    });
  });

  describe('calculateLLMCost', () => {
    it('should calculate LLM cost with default model', () => {
      const cost = calculator.calculateLLMCost(1000, 500, 200);
      // gpt-4o-mini: $0.15/1M input, $0.6/1M output
      // Input: 1000 * 500 / 1M * $0.15 = $0.075
      // Output: 1000 * 200 / 1M * $0.6 = $0.12
      // Total: $0.195
      expect(cost).toBeCloseTo(0.195, 3);
    });

    it('should calculate LLM cost with specific model', () => {
      const cost = calculator.calculateLLMCost(1000, 500, 200, 'gpt-4o');
      // gpt-4o: $2.5/1M input, $10.0/1M output
      // Input: 1000 * 500 / 1M * $2.5 = $1.25
      // Output: 1000 * 200 / 1M * $10.0 = $2.0
      // Total: $3.25
      expect(cost).toBeCloseTo(3.25, 2);
    });

    it('should handle zero tokens', () => {
      const cost = calculator.calculateLLMCost(1000, 0, 0);
      expect(cost).toBe(0);
    });
  });

  describe('calculateQueryCost', () => {
    it('should return 0 for cache hits', () => {
      const cost = calculator.calculateQueryCost({
        embeddingTokens: 100,
        llmInputTokens: 500,
        llmOutputTokens: 200,
        cacheHit: true,
      });
      expect(cost).toBe(0);
    });

    it('should calculate cost with embedding only', () => {
      const cost = calculator.calculateQueryCost({
        embeddingModel: 'voyage-3',
        embeddingTokens: 100,
      });
      // 100 / 1M * $0.06 = $0.000006
      expect(cost).toBeCloseTo(0.000006, 6);
    });

    it('should calculate cost with all components', () => {
      const cost = calculator.calculateQueryCost({
        embeddingModel: 'voyage-3',
        embeddingTokens: 100,
        rerankModel: 'cohere-rerank-v3',
        rerankCandidates: 10,
        llmModel: 'gpt-4o-mini',
        llmInputTokens: 500,
        llmOutputTokens: 200,
      });
      expect(cost).toBeGreaterThan(0);
    });

    it('should handle missing optional parameters', () => {
      const cost = calculator.calculateQueryCost({});
      expect(cost).toBe(0);
    });
  });

  describe('estimateMonthlyCost', () => {
    it('should estimate monthly cost correctly', () => {
      const request: CostEstimateRequest = {
        vectorCount: 1_000_000,
        dimensions: 1024,
        queriesPerMonth: 100_000,
        averageTopK: 10,
        rerankEnabled: true,
        expectedCacheHitRate: 0.3,
      };

      const estimate = calculator.estimateMonthlyCost(request);

      expect(estimate.totalMonthlyCostUsd).toBeGreaterThan(0);
      expect(estimate.breakdown.storage.total).toBeGreaterThan(0);
      expect(estimate.breakdown.query.total).toBeGreaterThan(0);
      expect(estimate.costPer1000Queries).toBeGreaterThan(0);
    });

    it('should include storage breakdown by tier', () => {
      const request: CostEstimateRequest = {
        vectorCount: 1_000_000,
        dimensions: 1024,
        queriesPerMonth: 10_000,
        averageTopK: 10,
        rerankEnabled: false,
      };

      const estimate = calculator.estimateMonthlyCost(request);

      expect(estimate.breakdown.storage.hot).toBeDefined();
      expect(estimate.breakdown.storage.warm).toBeDefined();
      expect(estimate.breakdown.storage.cold).toBeDefined();
    });

    it('should not include rerank cost when disabled', () => {
      const request: CostEstimateRequest = {
        vectorCount: 1_000_000,
        dimensions: 1024,
        queriesPerMonth: 10_000,
        averageTopK: 10,
        rerankEnabled: false,
      };

      const estimate = calculator.estimateMonthlyCost(request);
      expect(estimate.breakdown.query.rerank).toBe(0);
    });

    it('should include rerank cost when enabled', () => {
      const request: CostEstimateRequest = {
        vectorCount: 1_000_000,
        dimensions: 1024,
        queriesPerMonth: 10_000,
        averageTopK: 10,
        rerankEnabled: true,
      };

      const estimate = calculator.estimateMonthlyCost(request);
      expect(estimate.breakdown.query.rerank).toBeGreaterThan(0);
    });

    it('should generate optimizations when applicable', () => {
      const request: CostEstimateRequest = {
        vectorCount: 1_000_000,
        dimensions: 1024,
        queriesPerMonth: 10_000,
        averageTopK: 10,
        rerankEnabled: false,
        expectedCacheHitRate: 0.1, // Low cache hit rate should trigger optimization
      };

      const estimate = calculator.estimateMonthlyCost(request);
      expect(estimate.optimizations).toBeDefined();
      expect(Array.isArray(estimate.optimizations)).toBe(true);
    });
  });

  describe('generateMonthlyReport', () => {
    it('should generate monthly report', async () => {
      const report = await calculator.generateMonthlyReport();

      expect(report.periodStart).toBeDefined();
      expect(report.periodEnd).toBeDefined();
      expect(report.totalQueries).toBeGreaterThanOrEqual(0);
      expect(report.components).toBeDefined();
    });

    it('should include correct period dates', async () => {
      const testDate = new Date(2024, 5, 15); // June 15, 2024
      const report = await calculator.generateMonthlyReport(testDate);

      expect(report.periodStart.getMonth()).toBe(5); // June
      expect(report.periodStart.getDate()).toBe(1);
      expect(report.periodEnd.getMonth()).toBe(5);
    });

    it('should calculate savings correctly', async () => {
      const report = await calculator.generateMonthlyReport();

      expect(report.baselineCostUsd).toBeGreaterThanOrEqual(0);
      expect(report.actualCostUsd).toBeGreaterThanOrEqual(0);
      expect(report.savingsUsd).toBeDefined();
      expect(report.savingsPercent).toBeDefined();
    });

    it('should include tier distribution', async () => {
      const report = await calculator.generateMonthlyReport();

      expect(report.tierDistribution).toBeDefined();
      expect(report.tierDistribution.hot).toBeGreaterThanOrEqual(0);
      expect(report.tierDistribution.warm).toBeGreaterThanOrEqual(0);
      expect(report.tierDistribution.cold).toBeGreaterThanOrEqual(0);
    });

    it('should include recommendations', async () => {
      const report = await calculator.generateMonthlyReport();
      expect(report.recommendations).toBeDefined();
      expect(Array.isArray(report.recommendations)).toBe(true);
    });
  });
});

describe('Pricing Constants', () => {
  it('should have embedding pricing for all models', () => {
    expect(EMBEDDING_PRICING['text-embedding-3-small']).toBe(0.02);
    expect(EMBEDDING_PRICING['text-embedding-3-large']).toBe(0.13);
    expect(EMBEDDING_PRICING['voyage-3']).toBe(0.06);
  });

  it('should have rerank pricing for all models', () => {
    expect(RERANK_PRICING['cohere-rerank-v3']).toBe(2.0);
    expect(RERANK_PRICING['bge-reranker-v2-m3']).toBe(0.5);
  });

  it('should have LLM pricing with input and output rates', () => {
    expect(LLM_PRICING['gpt-4o']).toEqual([2.5, 10.0]);
    expect(LLM_PRICING['gpt-4o-mini']).toEqual([0.15, 0.6]);
    expect(LLM_PRICING['claude-3-5-sonnet']).toEqual([3.0, 15.0]);
  });

  it('should have storage pricing for all tiers', () => {
    expect(STORAGE_PRICING.hot).toBe(10.0);
    expect(STORAGE_PRICING.warm).toBe(3.0);
    expect(STORAGE_PRICING.cold).toBe(0.5);
  });
});

describe('formatCost', () => {
  it('should format cost as currency string', () => {
    expect(formatCost(10.5)).toBe('$10.50');
    expect(formatCost(0.123)).toBe('$0.12');
    expect(formatCost(1000)).toBe('$1000.00');
  });

  it('should respect precision parameter', () => {
    expect(formatCost(10.5678, 3)).toBe('$10.568');
    expect(formatCost(10.5678, 0)).toBe('$11');
  });

  it('should handle zero', () => {
    expect(formatCost(0)).toBe('$0.00');
  });
});

describe('calculateSavingsPercent', () => {
  it('should calculate savings percentage correctly', () => {
    expect(calculateSavingsPercent(100, 80)).toBe(20);
    expect(calculateSavingsPercent(100, 50)).toBe(50);
    expect(calculateSavingsPercent(100, 0)).toBe(100);
  });

  it('should return 0 when baseline is 0', () => {
    expect(calculateSavingsPercent(0, 50)).toBe(0);
  });

  it('should handle negative savings (cost increase)', () => {
    expect(calculateSavingsPercent(100, 150)).toBe(-50);
  });
});
