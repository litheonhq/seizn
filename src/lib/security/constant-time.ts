import { timingSafeEqual } from 'node:crypto';

/**
 * Compare two strings in constant time.
 * Returns false when either value is missing or lengths differ.
 */
export function constantTimeEqual(
  provided: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (!provided || !expected) return false;

  try {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);

    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(providedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}
