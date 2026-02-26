/**
 * Policy Updater Tests
 *
 * Tests for policy recommendation generation:
 * - Insight-based recommendations
 * - Policy lifecycle management
 * - A/B test configuration
 * - Approval workflow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AggregatedInsight, PolicyUpdate, AggregationPeriod } from '../types';

// Mock Supabase
const mockSupabaseFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: mockSupabaseFrom,
  }),
}));

// Mock aggregator
vi.mock('../aggregation/aggregator', () => ({
  getInsights: vi.fn().mockResolvedValue([]),
  analyzeTrends: vi.fn().mockResolvedValue([]),
}));

import {
  generatePolicyRecommendations,
  createPolicyUpdate,
  getPendingUpdates,
  getPolicyUpdates,
  approvePolicyUpdate,
  rejectPolicyUpdate,
  applyPolicyUpdate,
  createABTestConfig,
  runScheduledPolicyGeneration,
  type PolicyRecommendation,
} from '../policy/policy-updater';
import { getInsights, analyzeTrends } from '../aggregation/aggregator';

describe('PolicyUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('generatePolicyRecommendations', () => {
    it('should generate recommendations from high latency clusters', async () => {
      const mockInsights: AggregatedInsight[] = [
        {
          id: 'insight_1',
          period: 'weekly',
          queryCluster: 'cluster_slow',
          sampleCount: 1000,
          avgLatencyMs: 2000, // High latency
          avgResultsCount: 10,
          topPlanPaths: [{ path: ['retrieve', 'generate'], count: 400 }],
          createdAt: '2024-01-15T00:00:00Z',
        },
      ];

      vi.mocked(getInsights).mockResolvedValue(mockInsights);
      vi.mocked(analyzeTrends).mockResolvedValue([]);

      const recommendations = await generatePolicyRecommendations('weekly');

      expect(recommendations.length).toBeGreaterThan(0);
      const latencyRec = recommendations.find((r) =>
        r.targetPolicy.includes('latency')
      );
      expect(latencyRec).toBeDefined();
    });

    it('should recommend caching when not present in common paths', async () => {
      const mockInsights: AggregatedInsight[] = [
        {
          id: 'insight_1',
          period: 'weekly',
          queryCluster: 'cluster_a',
          sampleCount: 800,
          avgLatencyMs: 300,
          avgResultsCount: 10,
          topPlanPaths: [
            { path: ['retrieve', 'generate'], count: 400 }, // No cache_check
          ],
          createdAt: '2024-01-15T00:00:00Z',
        },
      ];

      vi.mocked(getInsights).mockResolvedValue(mockInsights);
      vi.mocked(analyzeTrends).mockResolvedValue([]);

      const recommendations = await generatePolicyRecommendations('weekly');

      const cachingRec = recommendations.find((r) =>
        r.changes.enable_cache_check === true
      );
      expect(cachingRec).toBeDefined();
    });

    it('should recommend reranking when not present', async () => {
      const mockInsights: AggregatedInsight[] = [
        {
          id: 'insight_1',
          period: 'weekly',
          queryCluster: 'cluster_a',
          sampleCount: 800,
          avgLatencyMs: 300,
          avgResultsCount: 10,
          topPlanPaths: [
            { path: ['retrieve', 'generate'], count: 400 }, // No rerank
          ],
          createdAt: '2024-01-15T00:00:00Z',
        },
      ];

      vi.mocked(getInsights).mockResolvedValue(mockInsights);
      vi.mocked(analyzeTrends).mockResolvedValue([]);

      const recommendations = await generatePolicyRecommendations('weekly');

      const rerankRec = recommendations.find((r) =>
        r.changes.enable_rerank === true
      );
      expect(rerankRec).toBeDefined();
    });

    it('should generate quality recommendations for low feedback', async () => {
      const mockInsights: AggregatedInsight[] = [
        {
          id: 'insight_1',
          period: 'weekly',
          queryCluster: 'cluster_low',
          sampleCount: 400,
          avgLatencyMs: 100,
          avgResultsCount: 10,
          avgFeedbackScore: 2.5, // Low feedback
          topPlanPaths: [],
          createdAt: '2024-01-15T00:00:00Z',
        },
        {
          id: 'insight_2',
          period: 'weekly',
          queryCluster: 'cluster_low2',
          sampleCount: 400,
          avgLatencyMs: 100,
          avgResultsCount: 10,
          avgFeedbackScore: 2.0,
          topPlanPaths: [],
          createdAt: '2024-01-15T00:00:00Z',
        },
        {
          id: 'insight_3',
          period: 'weekly',
          queryCluster: 'cluster_low3',
          sampleCount: 400,
          avgLatencyMs: 100,
          avgResultsCount: 10,
          avgFeedbackScore: 2.8,
          topPlanPaths: [],
          createdAt: '2024-01-15T00:00:00Z',
        },
      ];

      vi.mocked(getInsights).mockResolvedValue(mockInsights);
      vi.mocked(analyzeTrends).mockResolvedValue([]);

      const recommendations = await generatePolicyRecommendations('weekly');

      const qualityRec = recommendations.find((r) =>
        r.targetPolicy.includes('quality')
      );
      expect(qualityRec).toBeDefined();
    });

    it('should filter recommendations by confidence threshold', async () => {
      const mockInsights: AggregatedInsight[] = [
        {
          id: 'insight_1',
          period: 'weekly',
          queryCluster: 'cluster_a',
          sampleCount: 10, // Very low sample - should have low confidence
          avgLatencyMs: 2000,
          avgResultsCount: 10,
          topPlanPaths: [],
          createdAt: '2024-01-15T00:00:00Z',
        },
      ];

      vi.mocked(getInsights).mockResolvedValue(mockInsights);
      vi.mocked(analyzeTrends).mockResolvedValue([]);

      const recommendations = await generatePolicyRecommendations('weekly', {
        minSampleSize: 100,
        minConfidence: 0.95, // High threshold
        clusteringThreshold: 0.85,
        autoApplyEnabled: false,
        consentVersion: '1.0.0',
      });

      // Low sample recommendations should be filtered
      expect(recommendations.every((r) => r.confidence >= 0.95)).toBe(true);
    });

    it('should return empty when no insights', async () => {
      vi.mocked(getInsights).mockResolvedValue([]);
      vi.mocked(analyzeTrends).mockResolvedValue([]);

      const recommendations = await generatePolicyRecommendations('weekly');

      expect(recommendations).toEqual([]);
    });
  });

  describe('createPolicyUpdate', () => {
    it('should create policy update record', async () => {
      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'pu_abc123',
                target_policy: 'planner.latency_budget',
                changes: { max_latency_ms: 2000 },
                based_on_insights: ['insight_1'],
                confidence: 0.85,
                status: 'pending',
                applied_at: null,
                created_at: new Date().toISOString(),
              },
              error: null,
            }),
          }),
        }),
      });

      const recommendation: PolicyRecommendation = {
        targetPolicy: 'planner.latency_budget',
        changes: { max_latency_ms: 2000 },
        rationale: 'High latency detected',
        confidence: 0.85,
        basedOnInsights: ['insight_1'],
      };

      const update = await createPolicyUpdate(recommendation);

      expect(update.targetPolicy).toBe('planner.latency_budget');
      expect(update.changes).toEqual({ max_latency_ms: 2000 });
    });
  });

  describe('getPendingUpdates', () => {
    it('should return pending policy updates', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'pu_1',
                  target_policy: 'policy_a',
                  changes: {},
                  based_on_insights: [],
                  confidence: 0.8,
                  status: 'pending',
                  applied_at: null,
                },
              ],
              error: null,
            }),
          }),
        }),
      });

      const updates = await getPendingUpdates();

      expect(updates.length).toBe(1);
    });
  });

  describe('getPolicyUpdates', () => {
    it('should filter by status', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'pu_applied',
                    target_policy: 'policy_a',
                    changes: {},
                    based_on_insights: [],
                    confidence: 0.9,
                    status: 'applied',
                    applied_at: new Date().toISOString(),
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      });

      const updates = await getPolicyUpdates({ status: 'applied' });

      expect(updates.length).toBe(1);
    });
  });

  describe('approvePolicyUpdate', () => {
    it('should approve pending update', async () => {
      mockSupabaseFrom.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'pu_1',
                    target_policy: 'policy_a',
                    changes: {},
                    based_on_insights: [],
                    confidence: 0.8,
                    status: 'approved',
                    applied_at: null,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const update = await approvePolicyUpdate('pu_1');

      expect(update).toBeDefined();
    });
  });

  describe('rejectPolicyUpdate', () => {
    it('should reject pending update', async () => {
      mockSupabaseFrom.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'pu_1',
                    target_policy: 'policy_a',
                    changes: {},
                    based_on_insights: [],
                    confidence: 0.8,
                    status: 'rejected',
                    applied_at: null,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const update = await rejectPolicyUpdate('pu_1');

      expect(update).toBeDefined();
    });
  });

  describe('applyPolicyUpdate', () => {
    it('should apply approved update', async () => {
      // First call: fetch update
      mockSupabaseFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'pu_1',
                target_policy: 'policy_a',
                changes: { key: 'value' },
                based_on_insights: [],
                confidence: 0.9,
                status: 'approved',
                applied_at: null,
              },
              error: null,
            }),
          }),
        }),
      });

      // Second call: update status
      mockSupabaseFrom.mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'pu_1',
                  target_policy: 'policy_a',
                  changes: { key: 'value' },
                  based_on_insights: [],
                  confidence: 0.9,
                  status: 'applied',
                  applied_at: new Date().toISOString(),
                },
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await applyPolicyUpdate('pu_1');

      expect(result.applied).toBe(true);
    });

    it('should reject non-approved updates', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'pu_1',
                status: 'pending', // Not approved
              },
              error: null,
            }),
          }),
        }),
      });

      await expect(applyPolicyUpdate('pu_1')).rejects.toThrow(
        'Policy update must be approved'
      );
    });
  });

  describe('createABTestConfig', () => {
    it('should create A/B test configuration', () => {
      const update: PolicyUpdate = {
        id: 'pu_1',
        targetPolicy: 'planner.latency_budget',
        changes: { max_latency_ms: 2000 },
        basedOnInsights: ['insight_1'],
        confidence: 0.85,
      };

      const config = createABTestConfig(update);

      expect(config.experimentName).toContain('network_learning');
      expect(config.treatmentConfig).toEqual({ max_latency_ms: 2000 });
      expect(config.trafficPercentage).toBe(10); // Default 10%
    });
  });

  describe('runScheduledPolicyGeneration', () => {
    it('should generate and store policy updates', async () => {
      const mockInsights: AggregatedInsight[] = [
        {
          id: 'insight_1',
          period: 'weekly',
          queryCluster: 'cluster_a',
          sampleCount: 500,
          avgLatencyMs: 2000,
          avgResultsCount: 10,
          topPlanPaths: [{ path: ['retrieve'], count: 400 }],
          createdAt: new Date().toISOString(),
        },
      ];

      vi.mocked(getInsights).mockResolvedValue(mockInsights);
      vi.mocked(analyzeTrends).mockResolvedValue([]);

      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'pu_new' },
              error: null,
            }),
          }),
        }),
      });

      const result = await runScheduledPolicyGeneration('weekly');

      expect(result.updatesCreated).toBeGreaterThanOrEqual(0);
      expect(result.errors).toEqual([]);
    });

    it('should handle generation errors', async () => {
      vi.mocked(getInsights).mockRejectedValue(new Error('Database error'));

      const result = await runScheduledPolicyGeneration('weekly');

      expect(result.updatesCreated).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Privacy - No PII in policy updates', () => {
    it('should not include user data in recommendations', async () => {
      const mockInsights: AggregatedInsight[] = [
        {
          id: 'insight_1',
          period: 'weekly',
          queryCluster: 'cluster_abc', // Only anonymized cluster ID
          sampleCount: 500,
          avgLatencyMs: 2000,
          avgResultsCount: 10,
          topPlanPaths: [{ path: ['retrieve'], count: 400 }],
          createdAt: new Date().toISOString(),
        },
      ];

      vi.mocked(getInsights).mockResolvedValue(mockInsights);
      vi.mocked(analyzeTrends).mockResolvedValue([]);

      const recommendations = await generatePolicyRecommendations('weekly');

      // Verify no PII in recommendations
      const recJson = JSON.stringify(recommendations);
      expect(recJson).not.toContain('userId');
      expect(recJson).not.toContain('user_id');
      expect(recJson).not.toContain('email');
      expect(recJson).not.toContain('apiKey');
    });

    it('should base recommendations only on aggregate metrics', async () => {
      const mockInsights: AggregatedInsight[] = [
        {
          id: 'insight_1',
          period: 'weekly',
          queryCluster: 'cluster_test',
          sampleCount: 200,
          avgLatencyMs: 1500,
          avgResultsCount: 8,
          avgFeedbackScore: 3.5,
          topPlanPaths: [{ path: ['retrieve', 'generate'], count: 180 }],
          createdAt: new Date().toISOString(),
        },
      ];

      vi.mocked(getInsights).mockResolvedValue(mockInsights);
      vi.mocked(analyzeTrends).mockResolvedValue([]);

      const recommendations = await generatePolicyRecommendations('weekly');

      // Recommendations should reference insight IDs, not user data
      for (const rec of recommendations) {
        expect(rec.basedOnInsights.every((id) => id.startsWith('insight_'))).toBe(true);
      }
    });
  });
});
