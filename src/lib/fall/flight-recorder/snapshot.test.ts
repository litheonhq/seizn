/**
 * Trace Snapshot Determinism Tests
 *
 * Tests to verify deterministic snapshot generation and comparison.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StoredTrace, TraceConfig } from './types';

// Unmock crypto for this test file to get real hash behavior
vi.unmock('crypto');

// Import after unmocking
const {
  generateDeterministicSnapshotId,
  normalizeSnapshot,
  compareSnapshots,
  sortResultsDeterministically,
  generateReplaySnapshotId,
  areSnapshotsEquivalent,
} = await import('./snapshot');

type SnapshotInput = Parameters<typeof generateDeterministicSnapshotId>[0];

// ============================================
// Test Fixtures
// ============================================

function createMockStoredTrace(overrides?: Partial<StoredTrace>): StoredTrace {
  const now = new Date('2024-01-15T10:00:00Z');

  return {
    id: 'trace-123',
    requestId: 'req-456',
    userId: 'user-789',
    plan: 'pro',
    collectionId: 'col-abc',
    queryText: 'What is machine learning?',
    effectiveConfig: {
      searchType: 'hybrid',
      embeddingModel: 'text-embedding-3-small',
      topK: 10,
      rerankEnabled: true,
      rerankModel: 'rerank-english-v3.0',
    },
    timingsMs: {
      embedding: 50,
      search: 100,
      rerank: 80,
      total: 230,
    },
    resultsCount: 5,
    sampled: true,
    trace: {
      traceId: 'trace-id-123',
      startedAt: now.toISOString(),
      endedAt: new Date(now.getTime() + 230).toISOString(),
      totalDurationMs: 230,
      autopilot: {
        enabled: true,
        reason: 'hybrid-search-selected',
      },
      config: {
        searchType: 'hybrid',
        embeddingModel: 'text-embedding-3-small',
        topK: 10,
        rerankEnabled: true,
        rerankModel: 'rerank-english-v3.0',
      },
      spans: [
        {
          name: 'embedding',
          startedAt: now.toISOString(),
          endedAt: new Date(now.getTime() + 50).toISOString(),
          durationMs: 50,
          status: 'success',
          input: { text: 'What is machine learning?' },
          output: { dimensions: 1536 },
        },
        {
          name: 'vector_search',
          startedAt: new Date(now.getTime() + 50).toISOString(),
          endedAt: new Date(now.getTime() + 150).toISOString(),
          durationMs: 100,
          status: 'success',
          input: { topK: 10 },
          output: { count: 10 },
        },
        {
          name: 'rerank',
          startedAt: new Date(now.getTime() + 150).toISOString(),
          endedAt: new Date(now.getTime() + 230).toISOString(),
          durationMs: 80,
          status: 'success',
          input: { model: 'rerank-english-v3.0', count: 10 },
          output: { count: 5 },
        },
      ],
      events: [
        {
          type: 'embed',
          ts: now.toISOString(),
          payload: { model: 'text-embedding-3-small', tokens: 6 },
        },
        {
          type: 'candidates',
          ts: new Date(now.getTime() + 150).toISOString(),
          payload: { count: 10, source: 'hybrid' },
        },
        {
          type: 'rerank',
          ts: new Date(now.getTime() + 230).toISOString(),
          payload: { model: 'rerank-english-v3.0', inputCount: 10, outputCount: 5 },
        },
      ],
      resultStats: {
        count: 5,
        scores: {
          min: 0.72,
          max: 0.95,
          avg: 0.84,
        },
        documentIds: ['doc-1', 'doc-2', 'doc-3', 'doc-4', 'doc-5'],
        rerankDeltas: [
          { id: 'doc-1', originalScore: 0.88, rerankScore: 0.95, delta: 0.07 },
          { id: 'doc-2', originalScore: 0.92, rerankScore: 0.89, delta: -0.03 },
          { id: 'doc-3', originalScore: 0.85, rerankScore: 0.82, delta: -0.03 },
          { id: 'doc-4', originalScore: 0.78, rerankScore: 0.79, delta: 0.01 },
          { id: 'doc-5', originalScore: 0.71, rerankScore: 0.72, delta: 0.01 },
        ],
      },
    },
    createdAt: now.toISOString(),
    ...overrides,
  };
}

// ============================================
// Deterministic ID Generation Tests
// ============================================

describe('generateDeterministicSnapshotId', () => {
  it('should generate identical IDs for identical inputs', () => {
    const input: SnapshotInput = {
      query: 'What is machine learning?',
      collectionId: 'col-123',
      config: {
        searchType: 'hybrid',
        topK: 10,
      },
    };

    const id1 = generateDeterministicSnapshotId(input);
    const id2 = generateDeterministicSnapshotId(input);

    expect(id1).toBe(id2);
    expect(id1).toHaveLength(32);
  });

  it('should normalize query text (lowercase, trim, collapse whitespace)', () => {
    const id1 = generateDeterministicSnapshotId({
      query: 'What is machine learning?',
    });

    const id2 = generateDeterministicSnapshotId({
      query: '  WHAT  IS  MACHINE  LEARNING?  ',
    });

    expect(id1).toBe(id2);
  });

  it('should generate different IDs for different queries', () => {
    const id1 = generateDeterministicSnapshotId({
      query: 'What is machine learning?',
    });

    const id2 = generateDeterministicSnapshotId({
      query: 'What is deep learning?',
    });

    expect(id1).not.toBe(id2);
  });

  it('should handle collectionIds in sorted order', () => {
    const id1 = generateDeterministicSnapshotId({
      collectionIds: ['col-a', 'col-b', 'col-c'],
    });

    const id2 = generateDeterministicSnapshotId({
      collectionIds: ['col-c', 'col-a', 'col-b'],
    });

    expect(id1).toBe(id2);
  });

  it('should treat collectionId same as single-item collectionIds', () => {
    const id1 = generateDeterministicSnapshotId({
      collectionId: 'col-123',
    });

    const id2 = generateDeterministicSnapshotId({
      collectionIds: ['col-123'],
    });

    expect(id1).toBe(id2);
  });

  it('should handle config with sorted keys', () => {
    const id1 = generateDeterministicSnapshotId({
      config: {
        searchType: 'hybrid',
        topK: 10,
        rerankEnabled: true,
      },
    });

    // Different key order
    const id2 = generateDeterministicSnapshotId({
      config: {
        rerankEnabled: true,
        topK: 10,
        searchType: 'hybrid',
      },
    });

    expect(id1).toBe(id2);
  });

  it('should ignore undefined values in config', () => {
    const id1 = generateDeterministicSnapshotId({
      config: {
        searchType: 'hybrid',
        topK: 10,
      },
    });

    const id2 = generateDeterministicSnapshotId({
      config: {
        searchType: 'hybrid',
        topK: 10,
        rerankEnabled: undefined,
      },
    });

    expect(id1).toBe(id2);
  });
});

// ============================================
// Snapshot Normalization Tests
// ============================================

describe('normalizeSnapshot', () => {
  it('should generate consistent snapshot ID', () => {
    const trace = createMockStoredTrace();
    const normalized = normalizeSnapshot(trace);

    expect(normalized.snapshotId).toHaveLength(32);
    expect(normalized.contentHash).toHaveLength(32);
  });

  it('should convert timestamps to relative offsets', () => {
    const trace = createMockStoredTrace();
    const normalized = normalizeSnapshot(trace);

    // First span should have startOffset of 0
    expect(normalized.spans[0].startOffset).toBe(0);
    expect(normalized.spans[0].endOffset).toBe(50);

    // Second span should start at 50ms
    expect(normalized.spans[1].startOffset).toBe(50);
    expect(normalized.spans[1].endOffset).toBe(150);

    // Third span
    expect(normalized.spans[2].startOffset).toBe(150);
    expect(normalized.spans[2].endOffset).toBe(230);
  });

  it('should normalize events with relative offsets', () => {
    const trace = createMockStoredTrace();
    const normalized = normalizeSnapshot(trace);

    expect(normalized.events[0].offset).toBe(0);
    expect(normalized.events[0].type).toBe('embed');

    expect(normalized.events[1].offset).toBe(150);
    expect(normalized.events[1].type).toBe('candidates');
  });

  it('should preserve span input/output with sorted keys', () => {
    const trace = createMockStoredTrace();
    const normalized = normalizeSnapshot(trace);

    expect(normalized.spans[0].input).toEqual({ text: 'What is machine learning?' });
    expect(normalized.spans[0].output).toEqual({ dimensions: 1536 });
  });

  it('should generate same content hash for traces with different timestamps', () => {
    const trace1 = createMockStoredTrace();

    // Create trace with different base timestamp
    const trace2 = createMockStoredTrace();
    const newBase = new Date('2024-02-20T15:30:00Z');
    trace2.trace.startedAt = newBase.toISOString();
    trace2.trace.endedAt = new Date(newBase.getTime() + 230).toISOString();
    trace2.trace.spans = trace1.trace.spans.map((span, idx) => {
      const offsets = [0, 50, 150];
      const durations = [50, 100, 80];
      return {
        ...span,
        startedAt: new Date(newBase.getTime() + offsets[idx]).toISOString(),
        endedAt: new Date(newBase.getTime() + offsets[idx] + durations[idx]).toISOString(),
      };
    });

    const normalized1 = normalizeSnapshot(trace1);
    const normalized2 = normalizeSnapshot(trace2);

    // Content hash should be same (semantic content is identical)
    expect(normalized1.contentHash).toBe(normalized2.contentHash);
  });

  it('should preserve result stats with deterministic ordering', () => {
    const trace = createMockStoredTrace();
    const normalized = normalizeSnapshot(trace);

    expect(normalized.resultStats?.count).toBe(5);
    expect(normalized.resultStats?.documentIds).toEqual([
      'doc-1', 'doc-2', 'doc-3', 'doc-4', 'doc-5',
    ]);

    // Rerank deltas should be sorted by original score desc, then by id
    expect(normalized.resultStats?.rerankDeltas?.[0].id).toBe('doc-2'); // highest original score
  });
});

// ============================================
// Snapshot Comparison Tests
// ============================================

describe('compareSnapshots', () => {
  it('should detect identical snapshots', () => {
    const trace = createMockStoredTrace();
    const normalized1 = normalizeSnapshot(trace);
    const normalized2 = normalizeSnapshot(trace);

    const diff = compareSnapshots(normalized1, normalized2);

    expect(diff.identical).toBe(true);
    expect(diff.differenceType).toBe('none');
    expect(diff.differences).toHaveLength(0);
  });

  it('should detect config changes', () => {
    const trace1 = createMockStoredTrace();
    const trace2 = createMockStoredTrace({
      effectiveConfig: {
        ...trace1.effectiveConfig,
        topK: 20, // Changed
      },
    });
    trace2.trace.config = trace2.effectiveConfig;

    const normalized1 = normalizeSnapshot(trace1);
    const normalized2 = normalizeSnapshot(trace2);

    const diff = compareSnapshots(normalized1, normalized2);

    expect(diff.identical).toBe(false);
    expect(diff.differenceType).toBe('config');
    expect(diff.summary.configChanges).toBeGreaterThan(0);

    const topKChange = diff.differences.find((d) => d.path === 'config.topK');
    expect(topKChange).toBeDefined();
    expect(topKChange?.valueA).toBe(10);
    expect(topKChange?.valueB).toBe(20);
  });

  it('should detect result count changes', () => {
    const trace1 = createMockStoredTrace();
    const trace2 = createMockStoredTrace();
    trace2.trace.resultStats = {
      ...trace2.trace.resultStats!,
      count: 3, // Changed
      documentIds: ['doc-1', 'doc-2', 'doc-3'],
    };

    const normalized1 = normalizeSnapshot(trace1);
    const normalized2 = normalizeSnapshot(trace2);

    const diff = compareSnapshots(normalized1, normalized2);

    expect(diff.identical).toBe(false);
    expect(diff.summary.resultChanges).toBeGreaterThan(0);
  });

  it('should detect result ordering changes (non-semantic)', () => {
    const trace1 = createMockStoredTrace();
    const trace2 = createMockStoredTrace();

    // Same documents, different order
    trace2.trace.resultStats = {
      ...trace2.trace.resultStats!,
      documentIds: ['doc-2', 'doc-1', 'doc-3', 'doc-4', 'doc-5'],
    };

    const normalized1 = normalizeSnapshot(trace1);
    const normalized2 = normalizeSnapshot(trace2);

    const diff = compareSnapshots(normalized1, normalized2);

    // Reordering is not a semantic change
    expect(diff.identical).toBe(true);

    const orderChange = diff.differences.find(
      (d) => d.path === 'resultStats.documentIds' && d.type === 'reordered'
    );
    expect(orderChange).toBeDefined();
    expect(orderChange?.semantic).toBe(false);
  });

  it('should detect span status changes as semantic', () => {
    const trace1 = createMockStoredTrace();
    const trace2 = createMockStoredTrace();

    // Change span status to error
    trace2.trace.spans[1].status = 'error';
    trace2.trace.spans[1].error = 'Search failed';

    const normalized1 = normalizeSnapshot(trace1);
    const normalized2 = normalizeSnapshot(trace2);

    const diff = compareSnapshots(normalized1, normalized2);

    expect(diff.identical).toBe(false);
    expect(diff.summary.spanChanges).toBeGreaterThan(0);
  });

  it('should detect added/removed events', () => {
    const trace1 = createMockStoredTrace();
    const trace2 = createMockStoredTrace();

    // Add an error event
    trace2.trace.events.push({
      type: 'error',
      ts: new Date().toISOString(),
      payload: { message: 'Something went wrong' },
    });

    const normalized1 = normalizeSnapshot(trace1);
    const normalized2 = normalizeSnapshot(trace2);

    const diff = compareSnapshots(normalized1, normalized2);

    expect(diff.identical).toBe(false);
    expect(diff.summary.eventChanges).toBeGreaterThan(0);
  });
});

// ============================================
// Utility Function Tests
// ============================================

describe('sortResultsDeterministically', () => {
  it('should sort by score descending', () => {
    const results = [
      { id: 'a', score: 0.5 },
      { id: 'b', score: 0.9 },
      { id: 'c', score: 0.7 },
    ];

    const sorted = sortResultsDeterministically(results);

    expect(sorted[0].id).toBe('b');
    expect(sorted[1].id).toBe('c');
    expect(sorted[2].id).toBe('a');
  });

  it('should break ties using document ID', () => {
    const results = [
      { id: 'doc-c', score: 0.8 },
      { id: 'doc-a', score: 0.8 },
      { id: 'doc-b', score: 0.8 },
    ];

    const sorted = sortResultsDeterministically(results);

    expect(sorted[0].id).toBe('doc-a');
    expect(sorted[1].id).toBe('doc-b');
    expect(sorted[2].id).toBe('doc-c');
  });

  it('should not modify original array', () => {
    const results = [
      { id: 'a', score: 0.5 },
      { id: 'b', score: 0.9 },
    ];

    const sorted = sortResultsDeterministically(results);

    expect(results[0].id).toBe('a'); // Original unchanged
    expect(sorted[0].id).toBe('b'); // Sorted copy
  });
});

describe('generateReplaySnapshotId', () => {
  it('should generate consistent ID for same inputs', () => {
    const originalId = 'abc123def456';
    const config: Partial<TraceConfig> = {
      topK: 20,
      rerankEnabled: true,
    };

    const id1 = generateReplaySnapshotId(originalId, config);
    const id2 = generateReplaySnapshotId(originalId, config);

    expect(id1).toBe(id2);
  });

  it('should generate different ID for different configs', () => {
    const originalId = 'abc123def456';

    const id1 = generateReplaySnapshotId(originalId, { topK: 10 });
    const id2 = generateReplaySnapshotId(originalId, { topK: 20 });

    expect(id1).not.toBe(id2);
  });
});

describe('areSnapshotsEquivalent', () => {
  it('should return true for identical snapshots', () => {
    const trace = createMockStoredTrace();
    const normalized1 = normalizeSnapshot(trace);
    const normalized2 = normalizeSnapshot(trace);

    expect(areSnapshotsEquivalent(normalized1, normalized2)).toBe(true);
  });

  it('should return false for different queries', () => {
    const trace1 = createMockStoredTrace();
    const trace2 = createMockStoredTrace({
      queryText: 'Different query',
    });

    const normalized1 = normalizeSnapshot(trace1);
    const normalized2 = normalizeSnapshot(trace2);

    // Different query = different snapshot ID
    expect(normalized1.snapshotId).not.toBe(normalized2.snapshotId);
    expect(areSnapshotsEquivalent(normalized1, normalized2)).toBe(false);
  });

  it('should return false for same query but different content', () => {
    const trace1 = createMockStoredTrace();
    const trace2 = createMockStoredTrace();

    // Same query but different results
    trace2.trace.resultStats = {
      ...trace2.trace.resultStats!,
      count: 3,
      documentIds: ['doc-x', 'doc-y', 'doc-z'],
    };

    const normalized1 = normalizeSnapshot(trace1);
    const normalized2 = normalizeSnapshot(trace2);

    // Same snapshot ID (same input)
    expect(normalized1.snapshotId).toBe(normalized2.snapshotId);
    // Different content hash (different output)
    expect(normalized1.contentHash).not.toBe(normalized2.contentHash);
    expect(areSnapshotsEquivalent(normalized1, normalized2)).toBe(false);
  });
});
