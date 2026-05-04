import { describe, expect, it } from 'vitest';

import {
  explainAuthorCanonRecord,
  explainAuthorCanonSet,
  filterAuthorCanonAsOf,
  type AuthorMemoryRecord,
} from '@/lib/author/memory-v3';

const records: AuthorMemoryRecord[] = [
  {
    id: 'agent-old',
    kind: 'world_rule',
    status: 'canon',
    content: 'Sori is an agent.',
    validAt: '2026-01-01T00:00:00.000Z',
    invalidAt: '2026-05-01T00:00:00.000Z',
  },
  {
    id: 'student-current',
    kind: 'world_rule',
    status: 'canon',
    content: 'Sori is a student.',
    validAt: '2026-05-01T00:00:00.000Z',
    invalidatesId: 'agent-old',
  },
  {
    id: 'draft-unreviewed',
    kind: 'author_note',
    status: 'candidate',
    content: 'Unreviewed assistant draft.',
  },
  {
    id: 'past-only-club',
    kind: 'event',
    status: 'past_only',
    content: 'Sori attended the old club meeting.',
    validAt: '2026-02-01T00:00:00.000Z',
    invalidAt: '2026-03-01T00:00:00.000Z',
  },
];

describe('Author Memory v3 temporal canon helpers', () => {
  it('explains why an invalidated canon record is excluded', () => {
    expect(explainAuthorCanonRecord(records[0], records)).toEqual({
      recordId: 'agent-old',
      decision: 'excluded_invalidated',
      included: false,
      reasons: ['invalid at 2026-05-01T00:00:00.000Z'],
      invalidatedById: 'student-current',
      supersededById: undefined,
    });
  });

  it('includes current canon and excludes candidates by default', () => {
    expect(filterAuthorCanonAsOf(records).map((record) => record.id)).toEqual([
      'student-current',
    ]);
  });

  it('supports as-of historical canon queries', () => {
    expect(
      filterAuthorCanonAsOf(records, { asOf: '2026-04-01T00:00:00.000Z' })
        .map((record) => record.id)
    ).toEqual(['agent-old']);
  });

  it('can include past-only facts when explicitly requested', () => {
    expect(
      filterAuthorCanonAsOf(records, {
        asOf: '2026-02-15T00:00:00.000Z',
        includePastOnly: true,
      }).map((record) => record.id)
    ).toEqual(['agent-old', 'past-only-club']);
  });

  it('builds stable explanations for a record set', () => {
    expect(explainAuthorCanonSet(records).map((item) => [item.recordId, item.decision]))
      .toEqual([
        ['agent-old', 'excluded_invalidated'],
        ['draft-unreviewed', 'excluded_status'],
        ['past-only-club', 'excluded_non_canon'],
        ['student-current', 'included'],
      ]);
  });
});
