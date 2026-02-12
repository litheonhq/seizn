/**
 * Shared cron job authentication utility.
 *
 * Rejects ALL requests when CRON_SECRET is not configured (fail-closed).
 * Uses timing-safe comparison to prevent timing attacks.
 */

import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';

/**
 * Verify cron job authorization.
 *
 * Returns true only if:
 *  1. CRON_SECRET env var is set (non-empty)
 *  2. Request has Authorization: Bearer <CRON_SECRET> header
 *  3. The token matches via timing-safe comparison
 *
 * Returns false in ALL other cases (fail-closed).
 */
export function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  // Fail-closed: reject if CRON_SECRET is not configured
  if (!cronSecret) {
    console.error('[CronAuth] CRON_SECRET not configured — rejecting request');
    return false;
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice(7);

  // Timing-safe comparison to prevent timing attacks
  try {
    const tokenBuf = Buffer.from(token);
    const secretBuf = Buffer.from(cronSecret);
    if (tokenBuf.length !== secretBuf.length) return false;
    return timingSafeEqual(tokenBuf, secretBuf);
  } catch {
    return false;
  }
}
