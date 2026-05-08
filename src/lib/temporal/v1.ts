/**
 * Bi-temporal helpers for /api/v1/memories (R9).
 *
 * Author Memory v3 already has a temporal stack at
 * src/lib/author/memory-v3/temporal.ts (7-status FSM, asOf filtering,
 * supersedes/invalidates graph). This module ports the *concept* to
 * the generic memories table without re-implementing the Author-side
 * domain logic — it focuses on the SQL filter primitives the v1 GET
 * route needs, not the canon-merge pipeline.
 *
 * Glossary (matches the migration 20260508009 columns):
 *   canon_status  — finite-state machine for "is this currently true?"
 *   valid_at      — when the fact became true
 *   invalidated_at — when it stopped being true (NULL = still true)
 *   supersedes_id — the row this one replaced
 *   invalidated_by_id — the row that invalidated this one
 */

export type MemoryCanonStatus =
  | 'canon'
  | 'candidate'
  | 'contradicted'
  | 'invalidated'
  | 'superseded'
  | 'retired'
  | 'past_only';

export const MEMORY_CANON_STATUSES: readonly MemoryCanonStatus[] = [
  'canon',
  'candidate',
  'contradicted',
  'invalidated',
  'superseded',
  'retired',
  'past_only',
] as const;

export function isMemoryCanonStatus(value: unknown): value is MemoryCanonStatus {
  return typeof value === 'string' && (MEMORY_CANON_STATUSES as readonly string[]).includes(value);
}

/**
 * Statuses that count as "currently true" for default reads. `past_only`
 * is intentionally excluded — it means "this was once true but author
 * explicitly marked as not part of current canon".
 */
export const ACTIVE_CANON_STATUSES: readonly MemoryCanonStatus[] = ['canon', 'candidate'] as const;

export interface TemporalQueryOptions {
  /** ISO timestamp. If set, return rows whose validity window contains it. */
  asOf?: string | null;
  /**
   * If true, include all temporal states (canon/contradicted/superseded/etc.)
   * Default false → only ACTIVE_CANON_STATUSES.
   */
  includeHistory?: boolean;
}

/**
 * Apply temporal filters to a Supabase query builder. Returns the
 * query unchanged when no filters apply. Caller is responsible for
 * the upstream `from('memories')` and any other predicates.
 */
export function applyTemporalFilters<Q extends {
  in: (column: string, values: readonly string[]) => Q;
  lte: (column: string, value: string) => Q;
  or: (filter: string) => Q;
  is: (column: string, value: 'null') => Q;
}>(
  query: Q,
  options: TemporalQueryOptions = {},
): Q {
  let q = query;
  // R12 audit fix (C3): pre-fix, the asOf branch and the default-current
  // branch both correctly excluded already-invalidated rows, but the
  // include_history+canon_status combination passed through with no
  // invalidated_at filter — returning rows whose `invalidated_at` was
  // already in the future (logically inconsistent for a non-asOf read).
  // Now: when caller did NOT pass asOf, we always exclude invalidated
  // rows regardless of include_history. include_history just bypasses
  // the canon_status enum filter (so all 7 states are visible), not the
  // basic "is this currently true" predicate.
  if (!options.includeHistory) {
    q = q.in('canon_status', ACTIVE_CANON_STATUSES);
  }
  if (options.asOf) {
    // valid_at <= asOf AND (invalidated_at IS NULL OR invalidated_at > asOf)
    q = q.lte('valid_at', options.asOf);
    q = q.or(`invalidated_at.is.null,invalidated_at.gt.${options.asOf}`);
  } else {
    // Default and include_history-without-asOf both: drop rows that
    // have already been invalidated. include_history was meant to
    // surface non-canon STATUSES, not stale invalidated_at rows.
    q = q.is('invalidated_at', 'null');
  }
  return q;
}

/**
 * Validate caller-supplied temporal fields on POST / PATCH. Throws on
 * invariant violations so the caller can return 400.
 */
export interface TemporalInputs {
  canon_status?: MemoryCanonStatus | null;
  valid_at?: string | null;
  invalidated_at?: string | null;
  supersedes_id?: string | null;
}

export class TemporalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemporalValidationError';
  }
}

export function validateTemporalInputs(input: TemporalInputs): void {
  if (input.canon_status != null && !isMemoryCanonStatus(input.canon_status)) {
    throw new TemporalValidationError(
      `canon_status must be one of: ${MEMORY_CANON_STATUSES.join(', ')}`,
    );
  }
  if (input.valid_at != null && Number.isNaN(Date.parse(input.valid_at))) {
    throw new TemporalValidationError('valid_at must be a valid ISO timestamp');
  }
  if (input.invalidated_at != null && Number.isNaN(Date.parse(input.invalidated_at))) {
    throw new TemporalValidationError('invalidated_at must be a valid ISO timestamp');
  }
  if (
    input.valid_at != null &&
    input.invalidated_at != null &&
    Date.parse(input.invalidated_at) < Date.parse(input.valid_at)
  ) {
    throw new TemporalValidationError(
      'invalidated_at cannot be earlier than valid_at',
    );
  }
}

/**
 * Helpers for callers that want to declare a memory as superseding an
 * older one in a single insert — returns the metadata patch to apply
 * along with the new row, plus the UPDATE statement the caller should
 * issue to flip the previous row to status='superseded'.
 *
 * Kept as a value-object so the v1 route can sequence the writes
 * (insert new → update old → return) without us reaching into
 * @supabase/supabase-js inside a pure helper.
 */
export interface SupersedePlan {
  newRowFields: {
    supersedes_id: string;
    valid_at: string;
  };
  oldRowUpdate: {
    canon_status: 'superseded';
    invalidated_at: string;
  };
}

export function planSupersedence(args: {
  supersededId: string;
  validAt: string;
}): SupersedePlan {
  return {
    newRowFields: {
      supersedes_id: args.supersededId,
      valid_at: args.validAt,
    },
    oldRowUpdate: {
      canon_status: 'superseded',
      invalidated_at: args.validAt,
    },
  };
}
