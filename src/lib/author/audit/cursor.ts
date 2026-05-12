// Opaque keyset-cursor helpers for paginated audit-log reads.
//
// The encoded form is base64(`${createdAt}|${id}`). Clients should treat the
// resulting string as opaque -- the structure may change without notice.

import type { AuthorAuditLogEntry } from './types';

export interface AuthorAuditCursor {
  createdAt: string;
  id: string;
}

export function encodeAuthorAuditCursor(cursor: AuthorAuditCursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`, 'utf8').toString('base64url');
}

export function decodeAuthorAuditCursor(raw: string | null | undefined): AuthorAuditCursor | null {
  if (!raw) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const idx = decoded.indexOf('|');
  if (idx <= 0 || idx === decoded.length - 1) return null;
  const createdAt = decoded.slice(0, idx);
  const id = decoded.slice(idx + 1);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(createdAt)) return null;
  return { createdAt, id };
}

export function cursorFromEntry(entry: AuthorAuditLogEntry): AuthorAuditCursor {
  return { createdAt: entry.createdAt, id: entry.id };
}
