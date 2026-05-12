import { describe, expect, it } from 'vitest';

import {
  groupAuditEntriesByDay,
  utcDayKey,
} from '@/components/dashboard/redesign/views/timeline/group-audit-entries';
import type { AuthorAuditLogEntry } from '@/lib/author/audit';

const entry = (overrides: Partial<AuthorAuditLogEntry>): AuthorAuditLogEntry => ({
  id: 'e',
  projectId: 'p',
  userId: 'u',
  eventType: 'coach.analysis',
  payload: {},
  decisionId: 'd',
  createdAt: '2026-05-13T12:00:00.000Z',
  ...overrides,
});

describe('groupAuditEntriesByDay', () => {
  it('emits singletons for lone events', () => {
    const rows = groupAuditEntriesByDay([
      entry({ id: 'a', eventType: 'project.created' }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe('event');
  });

  it('compresses 2+ same-day same-type entries into a group', () => {
    const rows = groupAuditEntriesByDay([
      entry({ id: 'a', createdAt: '2026-05-13T18:00:00.000Z' }),
      entry({ id: 'b', createdAt: '2026-05-13T15:00:00.000Z' }),
      entry({ id: 'c', createdAt: '2026-05-13T10:00:00.000Z' }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe('group');
    const group = rows[0]! as Extract<typeof rows[number], { kind: 'group' }>;
    expect(group.count).toBe(3);
    expect(group.latest.id).toBe('a');
    expect(group.earliest.id).toBe('c');
    expect(group.eventType).toBe('coach.analysis');
  });

  it('breaks the run when day changes even if event_type matches', () => {
    const rows = groupAuditEntriesByDay([
      entry({ id: 'a', createdAt: '2026-05-13T01:00:00.000Z' }),
      entry({ id: 'b', createdAt: '2026-05-12T23:00:00.000Z' }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.kind === 'event')).toBe(true);
  });

  it('breaks the run when event_type changes within the same day', () => {
    const rows = groupAuditEntriesByDay([
      entry({ id: 'a', eventType: 'coach.analysis' }),
      entry({ id: 'b', eventType: 'simulation.run' }),
      entry({ id: 'c', eventType: 'coach.analysis' }),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.kind === 'event')).toBe(true);
  });

  it('mixes singletons and groups in one feed', () => {
    const rows = groupAuditEntriesByDay([
      entry({ id: 'a', eventType: 'coach.analysis' }),
      entry({ id: 'b', eventType: 'coach.analysis' }),
      entry({ id: 'c', eventType: 'project.created' }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.kind).toBe('group');
    expect(rows[1]!.kind).toBe('event');
  });

  it('utcDayKey ignores hours/minutes', () => {
    expect(utcDayKey('2026-05-13T23:59:59.999Z')).toBe('2026-05-13');
    expect(utcDayKey('2026-05-14T00:00:00.000Z')).toBe('2026-05-14');
  });
});
