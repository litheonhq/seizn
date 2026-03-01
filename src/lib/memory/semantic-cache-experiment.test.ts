import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  recordSemanticCacheExperimentEvent,
  resolveSemanticCacheDecision,
} from '@/lib/memory/semantic-cache-experiment';

function resetEnv() {
  delete process.env.MEMORY_SEMANTIC_CACHE_AB_ENABLED;
  delete process.env.MEMORY_SEMANTIC_CACHE_AB_SCOPE;
  delete process.env.MEMORY_SEMANTIC_CACHE_AB_RATIO;
}

describe('resolveSemanticCacheDecision', () => {
  afterEach(() => {
    resetEnv();
  });

  it('keeps cache enabled when experiment is disabled', () => {
    const decision = resolveSemanticCacheDecision({ userId: 'user-1', keyId: null });
    expect(decision.enabled).toBe(false);
    expect(decision.allowRead).toBe(true);
    expect(decision.allowWrite).toBe(true);
    expect(decision.reason).toBe('experiment_disabled');
  });

  it('skips experiment for API-key traffic in dashboard scope', () => {
    process.env.MEMORY_SEMANTIC_CACHE_AB_ENABLED = '1';
    process.env.MEMORY_SEMANTIC_CACHE_AB_SCOPE = 'dashboard';
    process.env.MEMORY_SEMANTIC_CACHE_AB_RATIO = '100';

    const decision = resolveSemanticCacheDecision({ userId: 'user-1', keyId: 'key-1' });
    expect(decision.enabled).toBe(true);
    expect(decision.variant).toBeNull();
    expect(decision.allowRead).toBe(true);
    expect(decision.allowWrite).toBe(true);
    expect(decision.reason).toBe('not_eligible_scope');
  });

  it('assigns stable control variant with 0% ratio', () => {
    process.env.MEMORY_SEMANTIC_CACHE_AB_ENABLED = 'true';
    process.env.MEMORY_SEMANTIC_CACHE_AB_SCOPE = 'all';
    process.env.MEMORY_SEMANTIC_CACHE_AB_RATIO = '0';

    const decisionA = resolveSemanticCacheDecision({ userId: 'stable-user', keyId: null });
    const decisionB = resolveSemanticCacheDecision({ userId: 'stable-user', keyId: null });

    expect(decisionA.variant).toBe('control');
    expect(decisionA.allowRead).toBe(false);
    expect(decisionA.allowWrite).toBe(false);
    expect(decisionA.bucket).toBe(decisionB.bucket);
  });

  it('assigns treatment for all eligible traffic with 100% ratio', () => {
    process.env.MEMORY_SEMANTIC_CACHE_AB_ENABLED = 'on';
    process.env.MEMORY_SEMANTIC_CACHE_AB_SCOPE = 'all';
    process.env.MEMORY_SEMANTIC_CACHE_AB_RATIO = '100';

    const decision = resolveSemanticCacheDecision({ userId: 'user-any', keyId: null });
    expect(decision.variant).toBe('treatment');
    expect(decision.allowRead).toBe(true);
    expect(decision.allowWrite).toBe(true);
    expect(decision.reason).toBe('assigned_treatment');
  });

  it('falls back to non-experiment mode on invalid ratio', () => {
    process.env.MEMORY_SEMANTIC_CACHE_AB_ENABLED = '1';
    process.env.MEMORY_SEMANTIC_CACHE_AB_RATIO = '999';

    const decision = resolveSemanticCacheDecision({ userId: 'user-1', keyId: null });
    expect(decision.enabled).toBe(false);
    expect(decision.variant).toBeNull();
    expect(decision.allowRead).toBe(true);
    expect(decision.reason).toBe('invalid_ratio');
  });
});

describe('recordSemanticCacheExperimentEvent', () => {
  it('ignores missing table errors to keep rollout non-blocking', async () => {
    const insert = vi.fn().mockResolvedValue({
      error: { code: '42P01', message: 'relation "memory_semantic_cache_experiment_events" does not exist' },
    });
    const supabase = {
      from: vi.fn().mockReturnValue({ insert }),
    } as unknown as Parameters<typeof recordSemanticCacheExperimentEvent>[0];

    await expect(
      recordSemanticCacheExperimentEvent(supabase, {
        userId: 'user-1',
        namespace: 'default',
        source: 'v1',
        requestedMode: 'auto',
        resolvedMode: 'hybrid',
        variant: 'treatment',
        cacheHit: true,
        latencyMs: 42,
        resultCount: 3,
      })
    ).resolves.toBeUndefined();
  });

  it('throws non-schema errors so callers can observe unexpected failures', async () => {
    const insert = vi.fn().mockResolvedValue({
      error: { code: '42501', message: 'permission denied' },
    });
    const supabase = {
      from: vi.fn().mockReturnValue({ insert }),
    } as unknown as Parameters<typeof recordSemanticCacheExperimentEvent>[0];

    await expect(
      recordSemanticCacheExperimentEvent(supabase, {
        userId: 'user-1',
        namespace: 'default',
        source: 'v0',
        requestedMode: 'keyword',
        resolvedMode: 'keyword',
        variant: 'control',
        cacheHit: false,
        latencyMs: 55,
        resultCount: 0,
      })
    ).rejects.toEqual({ code: '42501', message: 'permission denied' });
  });
});
