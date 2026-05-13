import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getCachedCoachAnalysis,
  setCachedCoachAnalysis,
} from '@/lib/author/coach/cache';
import type { CoachAnalysis } from '@/lib/author/coach/schema';

const sampleAnalysis: CoachAnalysis = {
  hash: 'abc123',
  storyLayers: [],
  characterArcs: [],
  criticNotes: [],
  antiCliche: [],
  latencyMs: 12,
  cached: false,
};

const redisGetMock = vi.fn();
const redisSetMock = vi.fn();

vi.mock('@/lib/redis', () => ({
  getRedis: () => ({
    get: redisGetMock,
    set: redisSetMock,
  }),
}));

describe('Coach Redis cache', () => {
  afterEach(() => {
    redisGetMock.mockReset();
    redisSetMock.mockReset();
  });

  it('returns null on cache miss', async () => {
    redisGetMock.mockResolvedValueOnce(null);
    const result = await getCachedCoachAnalysis('abc123');
    expect(result).toBeNull();
    expect(redisGetMock).toHaveBeenCalledWith('coach:analysis:abc123');
  });

  it('returns the stored value on cache hit', async () => {
    redisGetMock.mockResolvedValueOnce(sampleAnalysis);
    const result = await getCachedCoachAnalysis('abc123');
    expect(result).toEqual(sampleAnalysis);
  });

  it('returns null when Redis throws (network failure is non-fatal)', async () => {
    redisGetMock.mockRejectedValueOnce(new Error('upstash down'));
    const result = await getCachedCoachAnalysis('abc123');
    expect(result).toBeNull();
  });

  it('writes with the 7-day TTL', async () => {
    redisSetMock.mockResolvedValueOnce('OK');
    await setCachedCoachAnalysis('xyz789', sampleAnalysis);
    expect(redisSetMock).toHaveBeenCalledWith(
      'coach:analysis:xyz789',
      sampleAnalysis,
      { ex: 60 * 60 * 24 * 7 },
    );
  });

  it('swallows write errors silently', async () => {
    redisSetMock.mockRejectedValueOnce(new Error('upstash down'));
    // Should not throw.
    await expect(setCachedCoachAnalysis('xyz789', sampleAnalysis)).resolves.toBeUndefined();
  });
});
