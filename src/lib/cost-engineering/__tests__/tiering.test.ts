/**
 * TierManager Tests
 *
 * Tests for the storage tiering functionality including:
 * - Recording chunk access
 * - Determining appropriate tiers
 * - Getting tier distributions
 * - Scheduling migrations
 * - Executing migrations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TierManager, getTierColor, getTierLabel, calculateStorageCost } from '../tiering';
import { DEFAULT_TIER_CONFIG } from '../types';
import type { TierDistribution, StorageTier } from '../types';

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

describe('TierManager', () => {
  let tierManager: TierManager;
  const testUserId = 'test-user-123';

  beforeEach(() => {
    vi.clearAllMocks();
    tierManager = new TierManager(testUserId);
  });

  describe('constructor', () => {
    it('should initialize with default config when no config provided', () => {
      const manager = new TierManager(testUserId);
      const settings = manager.getTierSettings('hot');
      expect(settings.maxAgeDays).toBe(DEFAULT_TIER_CONFIG.hot.maxAgeDays);
      expect(settings.minAccessCount).toBe(DEFAULT_TIER_CONFIG.hot.minAccessCount);
    });

    it('should merge custom config with defaults', () => {
      const customConfig = {
        hot: { ...DEFAULT_TIER_CONFIG.hot, maxAgeDays: 14 },
      };
      const manager = new TierManager(testUserId, customConfig);
      const settings = manager.getTierSettings('hot');
      expect(settings.maxAgeDays).toBe(14);
    });

    it('should preserve all tier settings from default config', () => {
      const manager = new TierManager(testUserId);
      expect(manager.getTierSettings('cold').indexType).toBe('flat');
      expect(manager.getTierSettings('warm').indexType).toBe('hnsw');
    });
  });

  describe('recordAccess', () => {
    it('should not call RPC when chunkIds is empty', async () => {
      await tierManager.recordAccess([]);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('should call RPC for each chunk ID', async () => {
      mockRpc.mockResolvedValue({ error: null });
      const chunkIds = ['chunk-1', 'chunk-2', 'chunk-3'];

      await tierManager.recordAccess(chunkIds);

      expect(mockRpc).toHaveBeenCalledTimes(3);
      expect(mockRpc).toHaveBeenCalledWith('upsert_chunk_access', expect.objectContaining({
        p_chunk_id: 'chunk-1',
        p_user_id: testUserId,
      }));
    });

    it('should continue processing when one chunk fails', async () => {
      mockRpc
        .mockResolvedValueOnce({ error: { message: 'Error' } })
        .mockResolvedValueOnce({ error: null })
        .mockResolvedValueOnce({ error: null });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await tierManager.recordAccess(['chunk-1', 'chunk-2', 'chunk-3']);

      expect(mockRpc).toHaveBeenCalledTimes(3);
      expect(consoleSpy).toHaveBeenCalledOnce();
      consoleSpy.mockRestore();
    });
  });

  describe('determineTier', () => {
    it('should return cold tier when no stats exist', async () => {
      mockFrom.mockImplementation(() => createChainableMock({ data: null, error: null }));

      const tier = await tierManager.determineTier('chunk-1');
      expect(tier).toBe('cold');
    });

    it('should return hot tier for frequently accessed recent chunks', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 2); // 2 days ago

      mockFrom.mockImplementation(() => createChainableMock({
        data: {
          chunk_id: 'chunk-1',
          collection_id: 'col-1',
          user_id: testUserId,
          access_count: 10,
          last_accessed_at: recentDate.toISOString(),
          created_at: recentDate.toISOString(),
          tier: 'warm',
        },
        error: null,
      }));

      const tier = await tierManager.determineTier('chunk-1');
      expect(tier).toBe('hot');
    });

    it('should return warm tier for moderately accessed chunks', async () => {
      const moderateDate = new Date();
      moderateDate.setDate(moderateDate.getDate() - 15); // 15 days ago

      mockFrom.mockImplementation(() => createChainableMock({
        data: {
          chunk_id: 'chunk-1',
          collection_id: 'col-1',
          user_id: testUserId,
          access_count: 1,
          last_accessed_at: moderateDate.toISOString(),
          created_at: moderateDate.toISOString(),
          tier: 'cold',
        },
        error: null,
      }));

      const tier = await tierManager.determineTier('chunk-1');
      expect(tier).toBe('warm');
    });

    it('should return cold tier for old, rarely accessed chunks', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60); // 60 days ago

      mockFrom.mockImplementation(() => createChainableMock({
        data: {
          chunk_id: 'chunk-1',
          collection_id: 'col-1',
          user_id: testUserId,
          access_count: 1,
          last_accessed_at: oldDate.toISOString(),
          created_at: oldDate.toISOString(),
          tier: 'cold',
        },
        error: null,
      }));

      const tier = await tierManager.determineTier('chunk-1');
      expect(tier).toBe('cold');
    });
  });

  describe('getTierDistribution', () => {
    it('should return zero distribution when no data', async () => {
      mockFrom.mockImplementation(() => createChainableMock({ data: null, error: { message: 'Error' } }));

      const distribution = await tierManager.getTierDistribution();
      expect(distribution).toEqual({ hot: 0, warm: 0, cold: 0, total: 0 });
    });

    it('should correctly count tier distribution', async () => {
      const mockData = [
        { tier: 'hot' },
        { tier: 'hot' },
        { tier: 'warm' },
        { tier: 'cold' },
        { tier: 'cold' },
        { tier: 'cold' },
      ];

      mockFrom.mockImplementation(() => createChainableMock({ data: mockData, error: null }));

      const distribution = await tierManager.getTierDistribution();
      expect(distribution).toEqual({ hot: 2, warm: 1, cold: 3, total: 6 });
    });

    it('should filter by collection when specified', async () => {
      const chain = createChainableMock({ data: [{ tier: 'hot' }], error: null });
      mockFrom.mockImplementation(() => chain);

      const distribution = await tierManager.getTierDistribution('collection-123');
      expect(chain.eq).toHaveBeenCalledWith('collection_id', 'collection-123');
    });
  });

  describe('scheduleMigration', () => {
    it('should return empty plan when no chunks to migrate', async () => {
      mockFrom.mockImplementation(() => createChainableMock({ data: [], error: null }));

      const plan = await tierManager.scheduleMigration();
      expect(plan.demotions).toHaveLength(0);
      expect(plan.promotions).toHaveLength(0);
      expect(plan.estimatedCostChange).toBe(0);
    });

    it('should identify chunks for demotion when hot tier is stale', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 14); // 14 days ago (exceeds hot.maxAgeDays = 7)

      mockFrom.mockImplementation(() => createChainableMock({
        data: [
          {
            chunk_id: 'chunk-1',
            tier: 'hot',
            access_count: 5,
            last_accessed_at: oldDate.toISOString(),
          },
        ],
        error: null,
      }));

      const plan = await tierManager.scheduleMigration();
      expect(plan.demotions).toHaveLength(1);
      expect(plan.demotions[0].from).toBe('hot');
      expect(plan.demotions[0].to).toBe('warm');
    });

    it('should identify chunks for promotion when cold tier has recent access', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 3); // 3 days ago

      mockFrom.mockImplementation(() => createChainableMock({
        data: [
          {
            chunk_id: 'chunk-1',
            tier: 'cold',
            access_count: 10,
            last_accessed_at: recentDate.toISOString(),
          },
        ],
        error: null,
      }));

      const plan = await tierManager.scheduleMigration();
      expect(plan.promotions).toHaveLength(1);
      expect(plan.promotions[0].from).toBe('cold');
      expect(plan.promotions[0].to).toBe('hot');
    });
  });

  describe('executeMigration', () => {
    it('should return correct counts after migration', async () => {
      mockFrom.mockImplementation(() => createChainableMock({ error: null }));

      const plan = {
        demotions: [{ chunkId: 'chunk-1', from: 'hot' as StorageTier, to: 'warm' as StorageTier, reason: 'test' }],
        promotions: [{ chunkId: 'chunk-2', from: 'cold' as StorageTier, to: 'hot' as StorageTier, reason: 'test' }],
        estimatedCostChange: 0,
      };

      const result = await tierManager.executeMigration(plan);
      expect(result.demoted).toBe(1);
      expect(result.promoted).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should capture errors during migration', async () => {
      // Create a chain that rejects on the final await
      const chain: Record<string, unknown> = {};
      const methods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'lt', 'in', 'order', 'limit'];
      methods.forEach(method => {
        chain[method] = vi.fn().mockImplementation(() => chain);
      });
      chain.single = vi.fn().mockRejectedValue(new Error('Update failed'));
      chain.then = vi.fn().mockImplementation((resolve: (value: unknown) => void, reject: (error: Error) => void) => {
        return Promise.reject(new Error('Update failed')).catch(reject);
      });
      mockFrom.mockImplementation(() => chain);

      const plan = {
        demotions: [{ chunkId: 'chunk-1', from: 'hot' as StorageTier, to: 'warm' as StorageTier, reason: 'test' }],
        promotions: [],
        estimatedCostChange: 0,
      };

      const result = await tierManager.executeMigration(plan);
      expect(result.demoted).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].chunkId).toBe('chunk-1');
    });
  });

  describe('getTierSettings', () => {
    it('should return correct settings for each tier', () => {
      expect(tierManager.getTierSettings('hot').costPerMVectors).toBe(10);
      expect(tierManager.getTierSettings('warm').costPerMVectors).toBe(3);
      expect(tierManager.getTierSettings('cold').costPerMVectors).toBe(0.5);
    });
  });
});

describe('getTierColor', () => {
  it('should return red for hot tier', () => {
    expect(getTierColor('hot')).toBe('#ef4444');
  });

  it('should return amber for warm tier', () => {
    expect(getTierColor('warm')).toBe('#f59e0b');
  });

  it('should return blue for cold tier', () => {
    expect(getTierColor('cold')).toBe('#3b82f6');
  });

  it('should return gray for unknown tier', () => {
    expect(getTierColor('unknown' as StorageTier)).toBe('#6b7280');
  });
});

describe('getTierLabel', () => {
  it('should return correct label for hot tier', () => {
    expect(getTierLabel('hot')).toBe('Hot (Fast)');
  });

  it('should return correct label for warm tier', () => {
    expect(getTierLabel('warm')).toBe('Warm (Standard)');
  });

  it('should return correct label for cold tier', () => {
    expect(getTierLabel('cold')).toBe('Cold (Archive)');
  });

  it('should return tier name for unknown tier', () => {
    expect(getTierLabel('unknown' as StorageTier)).toBe('unknown');
  });
});

describe('calculateStorageCost', () => {
  it('should calculate cost correctly with default config', () => {
    const distribution: TierDistribution = {
      hot: 1_000_000,
      warm: 2_000_000,
      cold: 5_000_000,
      total: 8_000_000,
    };

    const cost = calculateStorageCost(distribution);
    // hot: 1M * $10/M = $10
    // warm: 2M * $3/M = $6
    // cold: 5M * $0.5/M = $2.5
    // Total: $18.5
    expect(cost).toBe(18.5);
  });

  it('should return 0 for empty distribution', () => {
    const distribution: TierDistribution = { hot: 0, warm: 0, cold: 0, total: 0 };
    const cost = calculateStorageCost(distribution);
    expect(cost).toBe(0);
  });

  it('should handle fractional vector counts', () => {
    const distribution: TierDistribution = {
      hot: 500_000,
      warm: 1_500_000,
      cold: 2_500_000,
      total: 4_500_000,
    };

    const cost = calculateStorageCost(distribution);
    // hot: 0.5M * $10/M = $5
    // warm: 1.5M * $3/M = $4.5
    // cold: 2.5M * $0.5/M = $1.25
    // Total: $10.75
    expect(cost).toBe(10.75);
  });

  it('should accept custom tier config', () => {
    const distribution: TierDistribution = {
      hot: 1_000_000,
      warm: 0,
      cold: 0,
      total: 1_000_000,
    };

    const customConfig = {
      ...DEFAULT_TIER_CONFIG,
      hot: { ...DEFAULT_TIER_CONFIG.hot, costPerMVectors: 20 },
    };

    const cost = calculateStorageCost(distribution, customConfig);
    expect(cost).toBe(20);
  });
});
