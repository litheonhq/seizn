// Pure helpers for the Timeline view.
//
// Groups consecutive audit-log entries that share
//   (user_id × event_type × UTC calendar day)
// into a single "X events on <day>" row whenever the group has 2+ entries.
// Lone events stay as singletons. Order is preserved (newest first).
//
// Kept pure so it can be unit-tested without rendering.

import type { AuthorAuditLogEntry } from '@/lib/author/audit';

export interface TimelineEventRow {
  kind: 'event';
  entry: AuthorAuditLogEntry;
  dayKey: string;
}

export interface TimelineGroupRow {
  kind: 'group';
  eventType: AuthorAuditLogEntry['eventType'];
  userId: string;
  dayKey: string;
  count: number;
  /** Newest entry in the group, used as the click target's primary timestamp. */
  latest: AuthorAuditLogEntry;
  /** Oldest entry in the group, used to render the "first at HH:MM" hint. */
  earliest: AuthorAuditLogEntry;
  /** All entries, newest first, so the UI can expand the group inline. */
  entries: AuthorAuditLogEntry[];
}

export type TimelineRow = TimelineEventRow | TimelineGroupRow;

/**
 * UTC YYYY-MM-DD slice of an ISO timestamp. We intentionally avoid the
 * viewer's local timezone for v1 -- groupings are stable across devices and
 * time zones, which matters more than "today" feeling exactly right.
 */
export function utcDayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function groupAuditEntriesByDay(entries: AuthorAuditLogEntry[]): TimelineRow[] {
  // Entries arrive newest-first per the API contract; we just walk forward
  // and collect runs that share the group key.
  const rows: TimelineRow[] = [];
  let bucket: AuthorAuditLogEntry[] = [];

  const flushBucket = () => {
    if (bucket.length === 0) return;
    if (bucket.length === 1) {
      const only = bucket[0]!;
      rows.push({ kind: 'event', entry: only, dayKey: utcDayKey(only.createdAt) });
    } else {
      const latest = bucket[0]!;
      const earliest = bucket[bucket.length - 1]!;
      rows.push({
        kind: 'group',
        eventType: latest.eventType,
        userId: latest.userId,
        dayKey: utcDayKey(latest.createdAt),
        count: bucket.length,
        latest,
        earliest,
        entries: [...bucket],
      });
    }
    bucket = [];
  };

  for (const entry of entries) {
    if (bucket.length === 0) {
      bucket.push(entry);
      continue;
    }
    const head = bucket[0]!;
    const sameGroup =
      head.userId === entry.userId &&
      head.eventType === entry.eventType &&
      utcDayKey(head.createdAt) === utcDayKey(entry.createdAt);
    if (sameGroup) {
      bucket.push(entry);
    } else {
      flushBucket();
      bucket.push(entry);
    }
  }
  flushBucket();

  return rows;
}
