import { describe, it, expect } from 'vitest';
import {
  checkAuthFailRateLimit,
  recordAuthFailureAttempt,
  resetRateLimit,
} from '@/lib/rate-limit';

function makeIp(): string {
  return `test-ip-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

describe('auth failure rate limiter', () => {
  it('checkAuthFailRateLimit does not consume quota', async () => {
    const ip = makeIp();
    await resetRateLimit(ip);

    const first = await checkAuthFailRateLimit(ip);
    const second = await checkAuthFailRateLimit(ip);
    const third = await checkAuthFailRateLimit(ip);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(true);
    expect(first.remaining).toBe(5);
    expect(second.remaining).toBe(5);
    expect(third.remaining).toBe(5);
  });

  it('recordAuthFailureAttempt increments failures and eventually blocks', async () => {
    const ip = makeIp();
    await resetRateLimit(ip);

    for (let i = 0; i < 4; i++) {
      const result = await recordAuthFailureAttempt(ip);
      expect(result.allowed).toBe(true);
    }

    const beforeBlock = await checkAuthFailRateLimit(ip);
    expect(beforeBlock.allowed).toBe(true);
    expect(beforeBlock.remaining).toBe(1);

    await recordAuthFailureAttempt(ip);
    const blocked = await checkAuthFailRateLimit(ip);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });
});
