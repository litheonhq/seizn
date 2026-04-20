import { describe, expect, it } from 'vitest';
import { diffBranchEntries, type MemoryBranchEntry } from '@/lib/memory/versioning';

function entry(overrides: Partial<MemoryBranchEntry>): MemoryBranchEntry {
  return {
    id: overrides.id || `entry-${overrides.memory_id}`,
    branch_id: overrides.branch_id || 'branch',
    memory_id: overrides.memory_id || 'memory',
    operation: overrides.operation || 'updated',
    content: overrides.content ?? 'content',
    metadata: overrides.metadata || {},
    created_at: overrides.created_at || '2026-04-20T00:00:00.000Z',
  };
}

describe('memory branch diff', () => {
  it('reports added entries from the source branch', () => {
    const diff = diffBranchEntries(
      [entry({ memory_id: 'm1', operation: 'added', content: 'new' })],
      []
    );

    expect(diff).toEqual([
      expect.objectContaining({ kind: 'added', memoryId: 'm1' }),
    ]);
  });

  it('reports changed entries when content diverges', () => {
    const diff = diffBranchEntries(
      [entry({ memory_id: 'm1', content: 'branch version' })],
      [entry({ memory_id: 'm1', content: 'main version' })]
    );

    expect(diff).toEqual([
      expect.objectContaining({ kind: 'changed', memoryId: 'm1' }),
    ]);
  });

  it('uses the latest entry for each memory', () => {
    const diff = diffBranchEntries(
      [
        entry({ memory_id: 'm1', content: 'old', created_at: '2026-04-20T00:00:00.000Z' }),
        entry({ memory_id: 'm1', content: 'latest', created_at: '2026-04-20T00:01:00.000Z' }),
      ],
      [entry({ memory_id: 'm1', content: 'latest' })]
    );

    expect(diff).toEqual([]);
  });

  it('reports removed target entries absent from the source', () => {
    const diff = diffBranchEntries(
      [],
      [entry({ memory_id: 'm2', operation: 'updated', content: 'target only' })]
    );

    expect(diff).toEqual([
      expect.objectContaining({ kind: 'removed', memoryId: 'm2' }),
    ]);
  });
});
