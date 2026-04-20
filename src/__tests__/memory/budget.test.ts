import { describe, expect, it } from 'vitest';
import {
  createInMemoryBudgetSimulator,
  estimateMemorySizeBytes,
  selectDemotionCandidates,
  type BudgetMemoryRow,
} from '@/lib/memory/budget';

function row(input: Partial<BudgetMemoryRow> & { id: string; sizeBytes: number }): BudgetMemoryRow {
  return {
    tier: 'hot',
    pinned: false,
    recallCount: 0,
    lastRecalledAt: null,
    createdAt: '2026-04-20T00:00:00.000Z',
    ...input,
  };
}

describe('memory budget engine', () => {
  it('selects low-activation memories when the hot budget is exceeded', () => {
    const memories = [
      row({ id: 'old-low', sizeBytes: 42, recallCount: 0, createdAt: '2026-04-18T00:00:00.000Z' }),
      row({ id: 'new-low', sizeBytes: 42, recallCount: 0, createdAt: '2026-04-20T00:00:00.000Z' }),
      row({ id: 'popular', sizeBytes: 42, recallCount: 9, createdAt: '2026-04-17T00:00:00.000Z' }),
    ];

    const selection = selectDemotionCandidates(memories, 40, 'hot');

    expect(selection.freedBytes).toBe(42);
    expect(selection.candidates.map((candidate) => candidate.id)).toEqual(['old-low']);
  });

  it('never demotes pinned memories', async () => {
    const simulator = createInMemoryBudgetSimulator({ hotBudgetBytes: 80 });

    await simulator.write({ id: 'plot-critical', content: 'twist', sizeBytes: 60, pinned: true });
    await simulator.write({ id: 'ambient', content: 'small talk', sizeBytes: 60 });

    const snapshot = simulator.snapshot();
    expect(snapshot.find((memory) => memory.id === 'plot-critical')?.tier).toBe('hot');
    expect(snapshot.find((memory) => memory.id === 'ambient')?.tier).toBe('warm');
  });

  it('serializes concurrent writes without corrupting hot usage', async () => {
    const simulator = createInMemoryBudgetSimulator({ hotBudgetBytes: 120 });

    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        simulator.write({ id: `m${index}`, content: `memory ${index}`, sizeBytes: 40 })
      )
    );

    const snapshot = simulator.snapshot();
    expect(new Set(snapshot.map((memory) => memory.id)).size).toBe(8);
    expect(simulator.hotUsedBytes()).toBeLessThanOrEqual(120);
    expect(snapshot.filter((memory) => memory.tier === 'warm').length).toBeGreaterThan(0);
  });

  it('estimates utf8 byte size deterministically', () => {
    expect(estimateMemorySizeBytes('abc')).toBe(3);
    expect(estimateMemorySizeBytes({ a: 1 })).toBe(Buffer.byteLength('{"a":1}', 'utf8'));
  });
});
