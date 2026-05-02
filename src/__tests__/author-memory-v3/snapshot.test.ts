import { describe, expect, it } from 'vitest';

import {
  createAuthorMemorySnapshot,
  filterCurrentCanonRecords,
  type AuthorMemoryRecord,
} from '@/lib/author/memory-v3';

const records: AuthorMemoryRecord[] = [
  {
    id: 'fact-retired-agent',
    kind: 'world_rule',
    status: 'invalidated',
    content: 'Sori is an agent.',
    validAt: '2026-01-01T00:00:00.000Z',
    invalidAt: '2026-05-01T00:00:00.000Z',
  },
  {
    id: 'fact-current-student',
    kind: 'world_rule',
    status: 'canon',
    content: 'Sori is a student.',
    validAt: '2026-05-01T00:00:00.000Z',
    invalidatesId: 'fact-retired-agent',
  },
  {
    id: 'candidate-unreviewed',
    kind: 'author_note',
    status: 'candidate',
    content: 'Unreviewed assistant suggestion.',
  },
];

describe('Author Memory v3 snapshots', () => {
  it('creates a stable snapshot hash independent of input order', () => {
    const first = createAuthorMemorySnapshot({
      projectId: 'knot',
      records,
      generatedAt: '2026-05-02T00:00:00.000Z',
    });
    const second = createAuthorMemorySnapshot({
      projectId: 'knot',
      records: [...records].reverse(),
      generatedAt: '2026-05-03T00:00:00.000Z',
    });

    expect(first.snapshotHash).toBe(second.snapshotHash);
    expect(first.itemCount).toBe(3);
  });

  it('changes the snapshot hash when canon content changes', () => {
    const baseline = createAuthorMemorySnapshot({ records });
    const changed = createAuthorMemorySnapshot({
      records: records.map((record) =>
        record.id === 'fact-current-student'
          ? { ...record, content: 'Sori is a registered transfer student.' }
          : record
      ),
    });

    expect(changed.snapshotHash).not.toBe(baseline.snapshotHash);
  });

  it('filters current canon and excludes invalidated or unreviewed facts', () => {
    const current = filterCurrentCanonRecords(records);

    expect(current.map((record) => record.id)).toEqual(['fact-current-student']);
    expect(current[0].content).toBe('Sori is a student.');
  });

  it('respects valid and invalid times for current-canon queries', () => {
    expect(
      filterCurrentCanonRecords(records, { asOf: '2026-04-01T00:00:00.000Z' })
        .map((record) => record.id)
    ).toEqual([]);

    expect(
      filterCurrentCanonRecords(records, { asOf: '2026-05-02T00:00:00.000Z' })
        .map((record) => record.id)
    ).toEqual(['fact-current-student']);
  });
});
