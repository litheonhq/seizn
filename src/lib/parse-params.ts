/**
 * Safe numeric parameter parsing utilities.
 * Ensures all user-supplied numeric params are bounded to prevent DoS / resource exhaustion.
 */

/**
 * Parse an integer search param with min/max bounds.
 *
 * @param raw - raw string value (e.g. from searchParams.get())
 * @param defaultValue - value if raw is null/undefined/NaN
 * @param min - lower bound (inclusive, default 0)
 * @param max - upper bound (inclusive, default 1000)
 */
export function boundedInt(
  raw: string | null | undefined,
  defaultValue: number,
  min = 0,
  max = 1000,
): number {
  if (raw == null) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) return defaultValue;
  return Math.min(Math.max(parsed, min), max);
}

/**
 * Convenience: parse typical pagination params (limit + offset).
 *
 * @returns `{ limit, offset }` both bounded
 */
export function parsePagination(
  searchParams: URLSearchParams,
  defaults: { limit?: number; offset?: number; maxLimit?: number } = {},
): { limit: number; offset: number } {
  const { limit: defaultLimit = 20, offset: defaultOffset = 0, maxLimit = 100 } = defaults;
  return {
    limit: boundedInt(searchParams.get('limit'), defaultLimit, 1, maxLimit),
    offset: boundedInt(searchParams.get('offset'), defaultOffset, 0, 100_000),
  };
}
