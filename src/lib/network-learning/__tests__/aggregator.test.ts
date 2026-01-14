/**
 * Aggregator Tests
 *
 * Tests for signal aggregation:
 * - Period-based aggregation (daily/weekly/monthly)
 * - Insight computation
 * - Trend analysis
 * - Minimum sample size requirements
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AggregationPeriod, AnonymizedSignal } from '../types';

// Mock Supabase
const mockSupabaseFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: mockSupabaseFrom,
  }),
}));

// Mock signal collector
vi.mock('../collection/signal-collector', () => ({
  getSignals: vi.fn().mockResolvedValue([]),
}));

import {
  aggregateSignals,
  storeInsights,
  getInsights,
  getLatestInsight,
  analyzeTrends,
  runScheduledAggregation,
} from '../aggregation/aggregator';
import { getSignals } from '../collection/signal-collector';

describe('Aggregator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('aggregateSignals', () => {
    it('should aggregate signals by query cluster', async () => {
      const mockSignals: AnonymizedSignal[] = Array.from({ length: 150 }, (_, i) => ({
        id: `sig_${i}`,
        signalType: 'query_pattern',
        queryCluster: i < 100 ? 'cluster_a' : 'cluster_b',
        planPath: ['retrieve', 'generate'],
        metrics: {
          latencyMs: 100 + i,
          resultsCount: 10,
          feedbackScore: 4.0,
        },
        timestamp: '2024-01-15T10:00:00Z',
      }));

      vi.mocked(getSignals).mockResolvedValue(mockSignals);

      const insights = await aggregateSignals('daily');

      expect(insights.length).toBeGreaterThan(0);
      expect(insights[0].queryCluster).toBeDefined();
      expect(insights[0].sampleCount).toBeGreaterThanOrEqual(100);
    });

    it('should skip clusters with insufficient samples', async () => {
      const mockSignals: AnonymizedSignal[] = [
        ...Array.from({ length: 150 }, (_, i) => ({
          id: `sig_${i}`,
          signalType: 'query_pattern' as const,
          queryCluster: 'cluster_large',
          planPath: ['retrieve'],
          metrics: { latencyMs: 100, resultsCount: 5 },
          timestamp: '2024-01-15T10:00:00Z',
        })),
        // Small cluster with only 10 signals
        ...Array.from({ length: 10 }, (_, i) => ({
          id: `sig_small_${i}`,
          signalType: 'query_pattern' as const,
          queryCluster: 'cluster_small',
          planPath: ['retrieve'],
          metrics: { latencyMs: 100, resultsCount: 5 },
          timestamp: '2024-01-15T10:00:00Z',
        })),
      ];

      vi.mocked(getSignals).mockResolvedValue(mockSignals);

      const insights = await aggregateSignals('daily');

      // Small cluster should be filtered out (minSampleSize = 100 by default)
      const smallClusterInsight = insights.find((i) => i.queryCluster === 'cluster_small');
      expect(smallClusterInsight).toBeUndefined();
    });

    it('should calculate average latency', async () => {
      const mockSignals: AnonymizedSignal[] = Array.from({ length: 100 }, (_, i) => ({
        id: `sig_${i}`,
        signalType: 'query_pattern',
        queryCluster: 'cluster_test',
        planPath: ['retrieve'],
        metrics: {
          latencyMs: 200, // All same latency
          resultsCount: 10,
        },
        timestamp: '2024-01-15T10:00:00Z',
      }));

      vi.mocked(getSignals).mockResolvedValue(mockSignals);

      const insights = await aggregateSignals('daily');

      expect(insights[0].avgLatencyMs).toBe(200);
    });

    it('should calculate average feedback score', async () => {
      const mockSignals: AnonymizedSignal[] = Array.from({ length: 100 }, (_, i) => ({
        id: `sig_${i}`,
        signalType: 'feedback',
        queryCluster: 'cluster_test',
        planPath: [],
        metrics: {
          latencyMs: 100,
          resultsCount: 5,
          feedbackScore: 4.0,
        },
        timestamp: '2024-01-15T10:00:00Z',
      }));

      vi.mocked(getSignals).mockResolvedValue(mockSignals);

      const insights = await aggregateSignals('daily');

      expect(insights[0].avgFeedbackScore).toBe(4.0);
    });

    it('should compute top plan paths', async () => {
      const mockSignals: AnonymizedSignal[] = [
        ...Array.from({ length: 60 }, (_, i) => ({
          id: `sig_a_${i}`,
          signalType: 'plan_path' as const,
          queryCluster: 'cluster_test',
          planPath: ['retrieve', 'rerank', 'generate'],
          metrics: { latencyMs: 100, resultsCount: 5 },
          timestamp: '2024-01-15T10:00:00Z',
        })),
        ...Array.from({ length: 40 }, (_, i) => ({
          id: `sig_b_${i}`,
          signalType: 'plan_path' as const,
          queryCluster: 'cluster_test',
          planPath: ['cache_check', 'retrieve', 'generate'],
          metrics: { latencyMs: 80, resultsCount: 5 },
          timestamp: '2024-01-15T10:00:00Z',
        })),
      ];

      vi.mocked(getSignals).mockResolvedValue(mockSignals);

      const insights = await aggregateSignals('daily');

      expect(insights[0].topPlanPaths.length).toBeGreaterThan(0);
      // Most common path should be first
      expect(insights[0].topPlanPaths[0].count).toBeGreaterThanOrEqual(
        insights[0].topPlanPaths[1]?.count ?? 0
      );
    });

    it('should return empty when insufficient total samples', async () => {
      vi.mocked(getSignals).mockResolvedValue([]);

      const insights = await aggregateSignals('daily');

      expect(insights).toEqual([]);
    });

    it('should use correct period bounds', async () => {
      vi.mocked(getSignals).mockResolvedValue([]);

      await aggregateSignals('weekly');

      expect(getSignals).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: expect.any(String),
          endDate: expect.any(String),
        })
      );
    });
  });

  describe('storeInsights', () => {
    it('should store insights to database', async () => {
      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn().mockResolvedValue({
          error: null,
        }),
      });

      const insights = [
        {
          id: 'insight_1',
          period: 'daily' as AggregationPeriod,
          queryCluster: 'cluster_a',
          sampleCount: 100,
          avgLatencyMs: 150,
          avgResultsCount: 10,
          avgFeedbackScore: 4.2,
          topPlanPaths: [{ path: ['retrieve'], count: 80 }],
          createdAt: '2024-01-15T00:00:00Z',
        },
      ];

      await expect(storeInsights(insights)).resolves.not.toThrow();
    });

    it('should skip storage for empty insights', async () => {
      await storeInsights([]);

      expect(mockSupabaseFrom).not.toHaveBeenCalled();
    });
  });

  describe('getInsights', () => {
    it('should retrieve stored insights', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'insight_1',
                    period: 'daily',
                    period_start: '2024-01-15T00:00:00Z',
                    period_end: '2024-01-16T00:00:00Z',
                    query_cluster: 'cluster_a',
                    sample_count: 100,
                    avg_latency_ms: 150,
                    avg_results_count: 10,
                    avg_feedback_score: 4.0,
                    top_plan_paths: [],
                    created_at: '2024-01-15T12:00:00Z',
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      });

      const insights = await getInsights({ period: 'daily' });

      expect(insights.length).toBe(1);
      expect(insights[0].period).toBe('daily');
    });
  });

  describe('getLatestInsight', () => {
    it('should return latest insight for cluster', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: 'insight_latest',
                      period: 'weekly',
                      query_cluster: 'cluster_a',
                      sample_count: 500,
                      avg_latency_ms: 140,
                      avg_results_count: 12,
                      top_plan_paths: [],
                      created_at: '2024-01-15T00:00:00Z',
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      });

      const insight = await getLatestInsight('cluster_a', 'weekly');

      expect(insight).not.toBeNull();
      expect(insight?.queryCluster).toBe('cluster_a');
    });

    it('should return null when no insight exists', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      });

      const insight = await getLatestInsight('cluster_nonexistent', 'daily');

      expect(insight).toBeNull();
    });
  });

  describe('analyzeTrends', () => {
    it('should compare current and previous periods', async () => {
      // Mock signals for both periods
      vi.mocked(getSignals)
        .mockResolvedValueOnce(
          // Current period
          Array.from({ length: 100 }, (_, i) => ({
            id: `sig_current_${i}`,
            signalType: 'query_pattern' as const,
            queryCluster: 'cluster_test',
            planPath: ['retrieve'],
            metrics: { latencyMs: 100, resultsCount: 10 },
            timestamp: new Date().toISOString(),
          }))
        )
        .mockResolvedValueOnce(
          // Previous period
          Array.from({ length: 100 }, (_, i) => ({
            id: `sig_prev_${i}`,
            signalType: 'query_pattern' as const,
            queryCluster: 'cluster_test',
            planPath: ['retrieve'],
            metrics: { latencyMs: 150, resultsCount: 10 }, // Higher latency
            timestamp: new Date().toISOString(),
          }))
        );

      const trends = await analyzeTrends('weekly');

      expect(trends.length).toBeGreaterThan(0);
      expect(trends[0].latencyTrend).toBe('improving'); // 100 < 150
    });

    it('should detect degrading latency trend', async () => {
      vi.mocked(getSignals)
        .mockResolvedValueOnce(
          Array.from({ length: 100 }, () => ({
            id: 'sig_current',
            signalType: 'query_pattern' as const,
            queryCluster: 'cluster_test',
            planPath: [],
            metrics: { latencyMs: 200, resultsCount: 10 }, // Higher latency
            timestamp: new Date().toISOString(),
          }))
        )
        .mockResolvedValueOnce(
          Array.from({ length: 100 }, () => ({
            id: 'sig_prev',
            signalType: 'query_pattern' as const,
            queryCluster: 'cluster_test',
            planPath: [],
            metrics: { latencyMs: 100, resultsCount: 10 }, // Lower latency
            timestamp: new Date().toISOString(),
          }))
        );

      const trends = await analyzeTrends('daily');

      expect(trends.length).toBeGreaterThan(0);
      expect(trends[0].latencyTrend).toBe('degrading');
      expect(trends[0].latencyChangePercent).toBeGreaterThan(0);
    });

    it('should detect stable trends', async () => {
      vi.mocked(getSignals)
        .mockResolvedValueOnce(
          Array.from({ length: 100 }, () => ({
            id: 'sig_current',
            signalType: 'query_pattern' as const,
            queryCluster: 'cluster_test',
            planPath: [],
            metrics: { latencyMs: 100, resultsCount: 10 },
            timestamp: new Date().toISOString(),
          }))
        )
        .mockResolvedValueOnce(
          Array.from({ length: 100 }, () => ({
            id: 'sig_prev',
            signalType: 'query_pattern' as const,
            queryCluster: 'cluster_test',
            planPath: [],
            metrics: { latencyMs: 102, resultsCount: 10 }, // Only 2% change
            timestamp: new Date().toISOString(),
          }))
        );

      const trends = await analyzeTrends('daily');

      expect(trends[0].latencyTrend).toBe('stable');
    });
  });

  describe('runScheduledAggregation', () => {
    it('should aggregate and store insights', async () => {
      const mockSignals = Array.from({ length: 200 }, (_, i) => ({
        id: `sig_${i}`,
        signalType: 'query_pattern' as const,
        queryCluster: 'cluster_test',
        planPath: ['retrieve'],
        metrics: { latencyMs: 100, resultsCount: 10 },
        timestamp: new Date().toISOString(),
      }));

      vi.mocked(getSignals).mockResolvedValue(mockSignals);

      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn().mockResolvedValue({
          error: null,
        }),
      });

      const result = await runScheduledAggregation('daily');

      expect(result.insightsCreated).toBeGreaterThan(0);
      expect(result.errors).toEqual([]);
    });

    it('should handle aggregation errors', async () => {
      vi.mocked(getSignals).mockRejectedValue(new Error('Database error'));

      const result = await runScheduledAggregation('daily');

      expect(result.insightsCreated).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Privacy - No PII in aggregates', () => {
    it('should not include user IDs in insights', async () => {
      const mockSignals = Array.from({ length: 100 }, (_, i) => ({
        id: `sig_${i}`,
        signalType: 'query_pattern' as const,
        queryCluster: 'cluster_test',
        planPath: ['retrieve'],
        metrics: { latencyMs: 100, resultsCount: 10 },
        timestamp: new Date().toISOString(),
        // Note: AnonymizedSignal already excludes userId
      }));

      vi.mocked(getSignals).mockResolvedValue(mockSignals);

      const insights = await aggregateSignals('daily');

      // Verify no user-identifiable data in insights
      const insightJson = JSON.stringify(insights);
      expect(insightJson).not.toContain('user');
      expect(insightJson).not.toContain('email');
      expect(insightJson).not.toContain('userId');
    });

    it('should only expose cluster IDs, not original queries', async () => {
      const mockSignals = Array.from({ length: 100 }, () => ({
        id: 'sig_test',
        signalType: 'query_pattern' as const,
        queryCluster: 'cluster_abc123',
        planPath: ['retrieve'],
        metrics: { latencyMs: 100, resultsCount: 10 },
        timestamp: new Date().toISOString(),
      }));

      vi.mocked(getSignals).mockResolvedValue(mockSignals);

      const insights = await aggregateSignals('daily');

      // Only cluster ID should be present, not any original query text
      expect(insights[0].queryCluster).toMatch(/^cluster_/);
    });
  });
});
