/**
 * UUID validation primitives shared across routes (R15 — locked 2026-05-08).
 *
 * Why a dedicated module: caller-supplied UUIDs that flow into Postgres
 * column equality predicates (`.eq('id', ...)`, `.eq('user_id', ...)`,
 * etc.) trigger generic `22P02 invalid input syntax for type uuid` when
 * malformed. The error message historically leaked column / type
 * information that the R11 audit flagged. Surface bad input as a clean
 * 400 BEFORE it reaches Postgres.
 *
 * Regex shape: permissive enough to accept RFC 9562 v6/v7/v8 (timestamp-
 * sortable variants likely to be adopted for memory IDs in the future)
 * while still rejecting obvious garbage. Strict variant nibble check is
 * NOT applied — Postgres `uuid` type stores any 16-byte value, so we
 * defer that level of validation to Postgres itself if it ever matters.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Helper for the common "validate-or-400" pattern. Returns the validated
 * string on success, throws on miss. The thrown error is shaped for
 * direct propagation to a route handler that catches by name.
 */
export class UuidValidationError extends Error {
  constructor(public readonly field: string) {
    super(`${field} must be a valid UUID`);
    this.name = 'UuidValidationError';
  }
}

export function requireUuid(value: unknown, field: string): string {
  if (!isUuid(value)) {
    throw new UuidValidationError(field);
  }
  return value;
}
