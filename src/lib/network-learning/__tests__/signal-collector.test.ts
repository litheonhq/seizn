/**
 * Signal Collector Tests
 *
 * Tests for anonymized signal collection:
 * - Consent verification before collection
 * - PII removal/anonymization
 * - Query clustering
 * - Plan path sanitization
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SignalType } from '../types';

// Mock Supabase
const mockSupabaseFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: mockSupabaseFrom,
  }),
}));

// Mock consent manager
vi.mock('../consent/consent-manager', () => ({
  hasConsent: vi.fn().mockResolvedValue(true),
}));

import {
  collectSignal,
  collectBatchSignals,
  getSignals,
  getSignalCount,
  type CollectSignalInput,
} from '../collection/signal-collector';
import { hasConsent } from '../consent/consent-manager';

describe('SignalCollector', () => {
  const userId = 'user-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('collectSignal', () => {
    it('should collect signal when user has consent', async () => {
      vi.mocked(hasConsent).mockResolvedValue(true);

      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'sig_abc123' },
              error: null,
            }),
          }),
        }),
      });

      const input: CollectSignalInput = {
        userId,
        signalType: 'query_pattern',
        query: 'How to use React hooks?',
        latencyMs: 150,
        resultsCount: 10,
      };

      const signalId = await collectSignal(input);

      expect(signalId).toBe('sig_abc123');
      expect(hasConsent).toHaveBeenCalledWith(userId, 'query_pattern');
    });

    it('should return null when user has no consent', async () => {
      vi.mocked(hasConsent).mockResolvedValue(false);

      const input: CollectSignalInput = {
        userId,
        signalType: 'query_pattern',
        query: 'Test query',
        latencyMs: 100,
        resultsCount: 5,
      };

      const signalId = await collectSignal(input);

      expect(signalId).toBeNull();
      expect(mockSupabaseFrom).not.toHaveBeenCalled();
    });

    it('should anonymize query into cluster ID', async () => {
      vi.mocked(hasConsent).mockResolvedValue(true);

      let capturedInsert: Record<string, unknown> | null = null;
      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn().mockImplementation((data) => {
          capturedInsert = data;
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'sig_abc' },
                error: null,
              }),
            }),
          };
        }),
      });

      const input: CollectSignalInput = {
        userId,
        signalType: 'query_pattern',
        query: 'How to implement authentication in React?',
        latencyMs: 200,
        resultsCount: 15,
      };

      await collectSignal(input);

      // Query should be anonymized into a cluster ID
      expect(capturedInsert).not.toBeNull();
      expect(capturedInsert?.query_cluster).toBeDefined();
      expect(capturedInsert?.query_cluster).toMatch(/^cluster_/);
      // Original query should NOT be stored
      expect(JSON.stringify(capturedInsert)).not.toContain('How to implement');
    });

    it('should NOT store user ID with signal', async () => {
      vi.mocked(hasConsent).mockResolvedValue(true);

      let capturedInsert: Record<string, unknown> | null = null;
      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn().mockImplementation((data) => {
          capturedInsert = data;
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'sig_abc' },
                error: null,
              }),
            }),
          };
        }),
      });

      const input: CollectSignalInput = {
        userId: 'user-sensitive-id-123',
        signalType: 'query_pattern',
        query: 'Test query',
        latencyMs: 100,
        resultsCount: 5,
      };

      await collectSignal(input);

      // User ID should NOT be in the stored signal
      expect(capturedInsert).not.toBeNull();
      expect(capturedInsert?.user_id).toBeUndefined();
      expect(JSON.stringify(capturedInsert)).not.toContain('user-sensitive-id-123');
    });

    it('should sanitize plan paths', async () => {
      vi.mocked(hasConsent).mockResolvedValue(true);

      let capturedInsert: Record<string, unknown> | null = null;
      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn().mockImplementation((data) => {
          capturedInsert = data;
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'sig_abc' },
                error: null,
              }),
            }),
          };
        }),
      });

      const input: CollectSignalInput = {
        userId,
        signalType: 'plan_path',
        planPath: ['retrieve', 'user_john_docs', 'rerank', 'generate'],
        latencyMs: 300,
        resultsCount: 8,
      };

      await collectSignal(input);

      // Unknown steps should be sanitized to 'custom_step'
      expect(capturedInsert?.plan_path).toEqual(['retrieve', 'custom_step', 'rerank', 'generate']);
    });

    it('should round latency to integers', async () => {
      vi.mocked(hasConsent).mockResolvedValue(true);

      let capturedInsert: Record<string, unknown> | null = null;
      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn().mockImplementation((data) => {
          capturedInsert = data;
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'sig_abc' },
                error: null,
              }),
            }),
          };
        }),
      });

      const input: CollectSignalInput = {
        userId,
        signalType: 'retrieval_metric',
        latencyMs: 123.456,
        resultsCount: 10,
      };

      await collectSignal(input);

      expect(capturedInsert?.latency_ms).toBe(123);
    });

    it('should handle feedback score', async () => {
      vi.mocked(hasConsent).mockResolvedValue(true);

      let capturedInsert: Record<string, unknown> | null = null;
      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn().mockImplementation((data) => {
          capturedInsert = data;
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'sig_abc' },
                error: null,
              }),
            }),
          };
        }),
      });

      const input: CollectSignalInput = {
        userId,
        signalType: 'feedback',
        latencyMs: 100,
        resultsCount: 5,
        feedbackScore: 4.5,
      };

      await collectSignal(input);

      expect(capturedInsert?.feedback_score).toBe(4.5);
    });

    it('should return null on storage error', async () => {
      vi.mocked(hasConsent).mockResolvedValue(true);

      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Storage error' },
            }),
          }),
        }),
      });

      const input: CollectSignalInput = {
        userId,
        signalType: 'query_pattern',
        query: 'Test',
        latencyMs: 100,
        resultsCount: 5,
      };

      const result = await collectSignal(input);

      expect(result).toBeNull();
    });
  });

  describe('collectBatchSignals', () => {
    it('should collect multiple signals in parallel', async () => {
      vi.mocked(hasConsent).mockResolvedValue(true);

      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'sig_batch' },
              error: null,
            }),
          }),
        }),
      });

      const inputs: CollectSignalInput[] = [
        { userId, signalType: 'query_pattern', query: 'Query 1', latencyMs: 100, resultsCount: 5 },
        { userId, signalType: 'feedback', latencyMs: 50, resultsCount: 3, feedbackScore: 4 },
      ];

      const results = await collectBatchSignals(inputs);

      expect(results.length).toBe(2);
    });

    it('should skip signals without consent', async () => {
      vi.mocked(hasConsent)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'sig_ok' },
              error: null,
            }),
          }),
        }),
      });

      const inputs: CollectSignalInput[] = [
        { userId, signalType: 'query_pattern', query: 'Query', latencyMs: 100, resultsCount: 5 },
        { userId, signalType: 'feedback', latencyMs: 50, resultsCount: 3 },
      ];

      const results = await collectBatchSignals(inputs);

      expect(results.length).toBe(1);
    });
  });

  describe('getSignals', () => {
    it('should retrieve anonymized signals', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'sig_1',
                    signal_type: 'query_pattern',
                    query_cluster: 'cluster_abc',
                    plan_path: ['retrieve', 'generate'],
                    latency_ms: 150,
                    results_count: 10,
                    feedback_score: null,
                    created_at: '2024-01-01T00:00:00Z',
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      });

      const signals = await getSignals({
        signalType: 'query_pattern',
        limit: 100,
      });

      expect(signals.length).toBe(1);
      expect(signals[0].queryCluster).toBe('cluster_abc');
    });

    it('should filter by date range', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      await getSignals({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      expect(mockSupabaseFrom).toHaveBeenCalled();
    });
  });

  describe('getSignalCount', () => {
    it('should return count for query cluster', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            count: 42,
            error: null,
          }),
        }),
      });

      const count = await getSignalCount('cluster_abc');

      expect(count).toBe(42);
    });

    it('should return 0 on error', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            count: null,
            error: { message: 'Error' },
          }),
        }),
      });

      const count = await getSignalCount('cluster_abc');

      expect(count).toBe(0);
    });
  });

  describe('Privacy - PII verification', () => {
    it('should NOT store original query text', async () => {
      vi.mocked(hasConsent).mockResolvedValue(true);

      const sensitiveQueries = [
        'Find documents for john.doe@email.com',
        'Search records for SSN 123-45-6789',
        'My phone number is 555-123-4567',
        'Documents about John Smith from Company X',
      ];

      for (const query of sensitiveQueries) {
        let capturedInsert: Record<string, unknown> | null = null;
        mockSupabaseFrom.mockReturnValue({
          insert: vi.fn().mockImplementation((data) => {
            capturedInsert = data;
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'sig_test' },
                  error: null,
                }),
              }),
            };
          }),
        });

        await collectSignal({
          userId,
          signalType: 'query_pattern',
          query,
          latencyMs: 100,
          resultsCount: 5,
        });

        const storedData = JSON.stringify(capturedInsert);

        // Sensitive data should NOT appear in stored signal
        expect(storedData).not.toContain('john.doe@email.com');
        expect(storedData).not.toContain('123-45-6789');
        expect(storedData).not.toContain('555-123-4567');
        expect(storedData).not.toContain('John Smith');
      }
    });

    it('should produce deterministic cluster IDs for similar queries', async () => {
      vi.mocked(hasConsent).mockResolvedValue(true);

      const clusterIds: string[] = [];

      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn().mockImplementation((data) => {
          clusterIds.push(data.query_cluster);
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'sig_test' },
                error: null,
              }),
            }),
          };
        }),
      });

      // Same semantic query with different phrasing
      await collectSignal({
        userId,
        signalType: 'query_pattern',
        query: 'react hooks tutorial',
        latencyMs: 100,
        resultsCount: 5,
      });

      await collectSignal({
        userId,
        signalType: 'query_pattern',
        query: 'react hooks tutorial',
        latencyMs: 100,
        resultsCount: 5,
      });

      // Same query should produce same cluster ID
      expect(clusterIds[0]).toBe(clusterIds[1]);
    });
  });
});
