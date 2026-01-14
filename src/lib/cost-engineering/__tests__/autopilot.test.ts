/**
 * CostAutopilot Tests
 *
 * Tests for the cost optimization autopilot including:
 * - Analysis and recommendation generation
 * - Applying recommendations
 * - Running full optimization cycles
 * - Getting pending recommendations
 * - Configuration management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CostAutopilot, DEFAULT_AUTOPILOT_CONFIG } from '../autopilot';
import type { AutopilotConfig, RecommendationType } from '../types';

// Mock Supabase with proper chainable pattern
const mockRpc = vi.fn();

// Create a chainable mock builder
const createChainableMock = (finalValue: unknown = { data: null, error: null }) => {
  const chain: Record<string, unknown> = {};
  const methods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'lt', 'in', 'order', 'limit'];

  methods.forEach(method => {
    chain[method] = vi.fn().mockImplementation(() => chain);
  });

  chain.single = vi.fn().mockImplementation(() => Promise.resolve(finalValue));
  chain.then = vi.fn().mockImplementation((resolve: (value: unknown) => void) => {
    return Promise.resolve(finalValue).then(resolve);
  });

  return chain;
};

const mockFrom = vi.fn(() => createChainableMock());

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

// Mock SemanticCache as a proper class
vi.mock('../semantic-cache', async () => {
  const { vi: vitest } = await import('vitest');
  return {
    SemanticCache: class {
      getStats = vitest.fn().mockResolvedValue({
        totalEntries: 100,
        hitRate: 0.25,
        hitCount: 50,
        missCount: 150,
        averageLatencySavingsMs: 100,
      });
    },
    DEFAULT_CACHE_CONFIG: { enabled: true },
  };
});

// Mock TierManager as a proper class
vi.mock('../tiering', async () => {
  const { vi: vitest } = await import('vitest');
  return {
    TierManager: class {
      getTierDistribution = vitest.fn().mockResolvedValue({ hot: 100, warm: 200, cold: 300, total: 600 });
      scheduleMigration = vitest.fn().mockResolvedValue({
        demotions: [],
        promotions: [],
        estimatedCostChange: 0,
      });
      executeMigration = vitest.fn().mockResolvedValue({
        demoted: 0,
        promoted: 0,
        errors: [],
        durationMs: 100,
      });
    },
    DEFAULT_TIER_CONFIG: {},
  };
});

describe('CostAutopilot', () => {
  let autopilot: CostAutopilot;
  const testUserId = 'test-user-123';

  beforeEach(() => {
    vi.clearAllMocks();
    autopilot = new CostAutopilot(testUserId);
  });

  describe('constructor', () => {
    it('should initialize with default config when no config provided', () => {
      const ap = new CostAutopilot(testUserId);
      const config = ap.getConfig();
      expect(config.enabled).toBe(DEFAULT_AUTOPILOT_CONFIG.enabled);
      expect(config.mode).toBe(DEFAULT_AUTOPILOT_CONFIG.mode);
      expect(config.qualityThreshold).toBe(DEFAULT_AUTOPILOT_CONFIG.qualityThreshold);
    });

    it('should merge custom config with defaults', () => {
      const customConfig: Partial<AutopilotConfig> = {
        enabled: true,
        mode: 'aggressive',
      };
      const ap = new CostAutopilot(testUserId, customConfig);
      const config = ap.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.mode).toBe('aggressive');
      expect(config.qualityThreshold).toBe(DEFAULT_AUTOPILOT_CONFIG.qualityThreshold);
    });

    it('should support all three optimization modes', () => {
      const conservative = new CostAutopilot(testUserId, { mode: 'conservative' });
      const balanced = new CostAutopilot(testUserId, { mode: 'balanced' });
      const aggressive = new CostAutopilot(testUserId, { mode: 'aggressive' });

      expect(conservative.getConfig().mode).toBe('conservative');
      expect(balanced.getConfig().mode).toBe('balanced');
      expect(aggressive.getConfig().mode).toBe('aggressive');
    });
  });

  describe('analyze', () => {
    it('should return empty array when autopilot is disabled', async () => {
      const disabled = new CostAutopilot(testUserId, { enabled: false });
      const recommendations = await disabled.analyze();
      expect(recommendations).toHaveLength(0);
    });

    it('should generate caching recommendations for low hit rate', async () => {
      const enabled = new CostAutopilot(testUserId, { enabled: true });

      mockRpc.mockResolvedValue({ data: null, error: null });

      const recommendations = await enabled.analyze();

      const cachingRec = recommendations.find(r => r.type === 'caching');
      expect(cachingRec).toBeDefined();
    });

    it('should sort recommendations by estimated savings', async () => {
      const enabled = new CostAutopilot(testUserId, { enabled: true });

      mockRpc.mockResolvedValue({ data: null, error: null });

      const recommendations = await enabled.analyze();

      for (let i = 1; i < recommendations.length; i++) {
        expect(recommendations[i - 1].estimatedSavingsUsd)
          .toBeGreaterThanOrEqual(recommendations[i].estimatedSavingsUsd);
      }
    });

    it('should include collection ID when filtering', async () => {
      const enabled = new CostAutopilot(testUserId, { enabled: true });
      const collectionId = 'collection-123';

      mockRpc.mockResolvedValue({ data: null, error: null });

      await enabled.analyze(collectionId);

      // Verify that collection-specific analysis was performed
      expect(mockRpc).toHaveBeenCalled();
    });
  });

  describe('applyRecommendation', () => {
    it('should return failed result when recommendation not found', async () => {
      mockFrom.mockImplementation(() => createChainableMock({ data: null, error: null }));

      const result = await autopilot.applyRecommendation('non-existent-id');

      expect(result.success).toBe(false);
      expect(result.actions).toHaveLength(0);
    });

    it('should skip recommendation exceeding quality threshold', async () => {
      mockFrom.mockImplementation(() => createChainableMock({
        data: {
          id: 'rec-1',
          type: 'model_selection',
          title: 'Switch model',
          description: 'Switch to smaller model',
          estimated_savings_usd: 10,
          impact: 'medium',
          confidence: 0.5,
          action: { type: 'switch_model', target: 'all', params: {} },
          applied: false,
          created_at: new Date().toISOString(),
        },
        error: null,
      }));

      const result = await autopilot.applyRecommendation('rec-1');

      expect(result.actions[0].status).toBe('skipped');
      expect(result.actions[0].error).toContain('quality threshold');
    });

    it('should execute dry run without applying changes', async () => {
      mockFrom.mockImplementation(() => createChainableMock({
        data: {
          id: 'rec-1',
          type: 'caching',
          title: 'Enable cache',
          description: 'Enable semantic caching',
          estimated_savings_usd: 5,
          impact: 'medium',
          confidence: 0.9,
          action: { type: 'enable_cache', target: 'all', params: {} },
          applied: false,
          created_at: new Date().toISOString(),
        },
        error: null,
      }));

      const result = await autopilot.applyRecommendation('rec-1', true);

      expect(result.success).toBe(true);
      expect(result.totalSavingsUsd).toBe(5);
    });

    it('should update recommendation as applied after successful execution', async () => {
      const chain = createChainableMock({
        data: {
          id: 'rec-1',
          type: 'caching',
          title: 'Enable cache',
          description: 'Enable semantic caching',
          estimated_savings_usd: 5,
          impact: 'medium',
          confidence: 0.9,
          action: {
            type: 'enable_cache',
            target: 'all',
            params: { similarityThreshold: 0.95, ttlSeconds: 3600 },
          },
          applied: false,
          created_at: new Date().toISOString(),
        },
        error: null,
      });
      mockFrom.mockImplementation(() => chain);

      await autopilot.applyRecommendation('rec-1', false);

      expect(chain.update).toHaveBeenCalled();
    });
  });

  describe('runOptimization', () => {
    it('should return results with recommendations', async () => {
      const enabled = new CostAutopilot(testUserId, { enabled: true, autoApply: false });

      mockRpc.mockResolvedValue({ data: null, error: null });
      mockFrom.mockImplementation(() => createChainableMock({ error: null }));

      const result = await enabled.runOptimization();

      expect(result.success).toBe(true);
      expect(result.recommendations).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should filter by recommendation types when specified', async () => {
      const enabled = new CostAutopilot(testUserId, { enabled: true, autoApply: false });

      mockRpc.mockResolvedValue({ data: null, error: null });
      mockFrom.mockImplementation(() => createChainableMock({ error: null }));

      const types: RecommendationType[] = ['caching', 'tiering'];
      const result = await enabled.runOptimization(undefined, types);

      expect(result.success).toBe(true);
      // All recommendations should be of specified types
      for (const rec of result.recommendations) {
        if (rec.type === 'caching' || rec.type === 'tiering') {
          // Valid type
        } else {
          // This should not happen if filtering works
          expect(types).toContain(rec.type);
        }
      }
    });

    it('should apply recommendations when autoApply is true', async () => {
      const autoApply = new CostAutopilot(testUserId, { enabled: true, autoApply: true });

      mockRpc.mockResolvedValue({ data: null, error: null });
      mockFrom.mockImplementation(() => createChainableMock({
        data: {
          id: 'rec-1',
          type: 'caching',
          confidence: 0.9,
          estimated_savings_usd: 10,
          action: { type: 'enable_cache', target: 'all', params: {} },
        },
        error: null,
      }));

      const result = await autoApply.runOptimization();

      expect(result.success).toBe(true);
    });

    it('should run in dry run mode correctly', async () => {
      const enabled = new CostAutopilot(testUserId, { enabled: true, autoApply: true });

      mockRpc.mockResolvedValue({ data: null, error: null });
      mockFrom.mockImplementation(() => createChainableMock({
        data: {
          id: 'rec-1',
          type: 'caching',
          confidence: 0.9,
          estimated_savings_usd: 10,
          action: { type: 'enable_cache', target: 'all', params: {} },
        },
        error: null,
      }));

      const result = await enabled.runOptimization(undefined, undefined, true);

      expect(result.success).toBe(true);
    });
  });

  describe('getPendingRecommendations', () => {
    it('should return empty array when no pending recommendations', async () => {
      mockFrom.mockImplementation(() => createChainableMock({ data: [], error: null }));

      const pending = await autopilot.getPendingRecommendations();
      expect(pending).toHaveLength(0);
    });

    it('should return pending recommendations sorted by savings', async () => {
      const mockRecommendations = [
        {
          id: 'rec-1',
          type: 'caching',
          title: 'Enable cache',
          description: 'Enable caching',
          estimated_savings_usd: 20,
          impact: 'high',
          confidence: 0.85,
          action: { type: 'enable_cache', target: 'all', params: {} },
          applied: false,
          created_at: new Date().toISOString(),
        },
        {
          id: 'rec-2',
          type: 'tiering',
          title: 'Move to cold',
          description: 'Move inactive data',
          estimated_savings_usd: 15,
          impact: 'medium',
          confidence: 0.9,
          action: { type: 'migrate_tier', target: 'all', params: {} },
          applied: false,
          created_at: new Date().toISOString(),
        },
      ];

      mockFrom.mockImplementation(() => createChainableMock({ data: mockRecommendations, error: null }));

      const pending = await autopilot.getPendingRecommendations();

      expect(pending).toHaveLength(2);
      expect(pending[0].estimatedSavingsUsd).toBe(20);
      expect(pending[1].estimatedSavingsUsd).toBe(15);
    });

    it('should filter by collection when specified', async () => {
      const chain = createChainableMock({ data: [], error: null });
      mockFrom.mockImplementation(() => chain);

      await autopilot.getPendingRecommendations('collection-123');

      expect(chain.eq).toHaveBeenCalledWith('collection_id', 'collection-123');
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      autopilot.updateConfig({ mode: 'aggressive' });
      expect(autopilot.getConfig().mode).toBe('aggressive');
    });

    it('should preserve other config values', () => {
      const originalThreshold = autopilot.getConfig().qualityThreshold;
      autopilot.updateConfig({ mode: 'aggressive' });
      expect(autopilot.getConfig().qualityThreshold).toBe(originalThreshold);
    });

    it('should allow enabling/disabling autopilot', () => {
      autopilot.updateConfig({ enabled: false });
      expect(autopilot.getConfig().enabled).toBe(false);

      autopilot.updateConfig({ enabled: true });
      expect(autopilot.getConfig().enabled).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('should return a copy of config', () => {
      const config = autopilot.getConfig();
      config.mode = 'aggressive';
      expect(autopilot.getConfig().mode).not.toBe('aggressive');
    });
  });
});
