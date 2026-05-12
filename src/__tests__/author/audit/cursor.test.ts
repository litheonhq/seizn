import { describe, expect, it } from 'vitest';

import {
  cursorFromEntry,
  decodeAuthorAuditCursor,
  encodeAuthorAuditCursor,
  searchAuthorAuditEntries,
  type AuthorAuditLogEntry,
} from '@/lib/author/audit';

const baseEntry = (overrides: Partial<AuthorAuditLogEntry>): AuthorAuditLogEntry => ({
  id: 'e1',
  projectId: 'p1',
  userId: 'u1',
  eventType: 'project.created',
  payload: {},
  decisionId: 'd1',
  createdAt: '2026-05-13T00:00:00.000Z',
  ...overrides,
});

describe('Author audit cursor', () => {
  it('encodes and decodes a cursor round-trip', () => {
    const original = { createdAt: '2026-05-13T12:34:56.789Z', id: 'aabbccdd-eeff-0011-2233-445566778899' };
    const encoded = encodeAuthorAuditCursor(original);
    expect(typeof encoded).toBe('string');
    expect(encoded).not.toContain('|');
    expect(decodeAuthorAuditCursor(encoded)).toEqual(original);
  });

  it('returns null for malformed or empty cursors', () => {
    expect(decodeAuthorAuditCursor(null)).toBeNull();
    expect(decodeAuthorAuditCursor('')).toBeNull();
    expect(decodeAuthorAuditCursor('not-base64-with-pipe')).toBeNull();
    // Valid base64 but the decoded form lacks a pipe.
    expect(decodeAuthorAuditCursor(Buffer.from('noPipe', 'utf8').toString('base64url'))).toBeNull();
    // Valid base64 but the createdAt doesn't look like an ISO timestamp.
    expect(decodeAuthorAuditCursor(Buffer.from('hello|world', 'utf8').toString('base64url'))).toBeNull();
  });

  it('cursorFromEntry returns the (createdAt, id) pair', () => {
    const entry = baseEntry({ id: 'abc', createdAt: '2026-05-13T01:02:03.000Z' });
    expect(cursorFromEntry(entry)).toEqual({ createdAt: '2026-05-13T01:02:03.000Z', id: 'abc' });
  });
});

describe('searchAuthorAuditEntries with keyset cursor', () => {
  const entries: AuthorAuditLogEntry[] = [
    baseEntry({ id: 'a', createdAt: '2026-05-13T03:00:00.000Z', eventType: 'simulation.run' }),
    baseEntry({ id: 'b', createdAt: '2026-05-13T02:00:00.000Z', eventType: 'coach.analysis' }),
    baseEntry({ id: 'c', createdAt: '2026-05-13T01:00:00.000Z', eventType: 'simulation.run' }),
    baseEntry({ id: 'd', createdAt: '2026-05-13T00:00:00.000Z', eventType: 'project.created' }),
  ];

  it('returns strictly older entries when before cursor is supplied', () => {
    const result = searchAuthorAuditEntries(entries, {
      before: { createdAt: '2026-05-13T02:00:00.000Z', id: 'b' },
    });
    expect(result.map((e) => e.id)).toEqual(['c', 'd']);
  });

  it('breaks ties on id when two rows share createdAt', () => {
    const ties: AuthorAuditLogEntry[] = [
      baseEntry({ id: 'x', createdAt: '2026-05-13T05:00:00.000Z' }),
      baseEntry({ id: 'y', createdAt: '2026-05-13T05:00:00.000Z' }),
      baseEntry({ id: 'z', createdAt: '2026-05-13T05:00:00.000Z' }),
    ];
    const result = searchAuthorAuditEntries(ties, {
      before: { createdAt: '2026-05-13T05:00:00.000Z', id: 'y' },
    });
    // 'y' is excluded; 'x' has id greater than 'y' alphabetically so also
    // excluded under the (createdAt DESC, id DESC) order. Only 'z' remains.
    // Wait: with id DESC ordering, "older than y" means id < 'y' -> 'x'.
    // Let me re-check: sort is createdAt DESC, id DESC -> [z, y, x].
    // before=y means "strictly after y in the page list" -> 'x'.
    expect(result.map((e) => e.id)).toEqual(['x']);
  });

  it('filters by coach.analysis event type', () => {
    const result = searchAuthorAuditEntries(entries, { eventTypes: ['coach.analysis'] });
    expect(result.map((e) => e.id)).toEqual(['b']);
  });
});
