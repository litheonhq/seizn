/**
 * Normalize redirect targets to safe same-origin paths.
 */

function isUnsafePath(path: string): boolean {
  return !path.startsWith('/') || path.startsWith('//') || path.includes('\\');
}

/**
 * Accept only internal relative paths such as `/dashboard`.
 */
export function sanitizeRelativeRedirect(
  value: string | null | undefined,
  fallback = '/dashboard'
): string {
  if (!value) return fallback;

  const trimmed = value.trim();
  if (!trimmed || isUnsafePath(trimmed)) {
    return fallback;
  }

  return trimmed;
}

/**
 * Accepts relative paths or absolute URLs, but forces same-origin output path.
 */
export function sanitizeSameOriginRedirect(
  value: string | null | undefined,
  baseUrl: string,
  fallback = '/dashboard'
): string {
  if (!value) return fallback;

  try {
    const base = new URL(baseUrl);
    const candidate = new URL(value, base);

    if (candidate.origin !== base.origin) {
      return fallback;
    }

    return sanitizeRelativeRedirect(
      `${candidate.pathname}${candidate.search}${candidate.hash}`,
      fallback
    );
  } catch {
    return fallback;
  }
}

