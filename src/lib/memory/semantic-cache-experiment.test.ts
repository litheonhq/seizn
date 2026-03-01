import { afterEach, describe, expect, it } from 'vitest';
import { resolveSemanticCacheDecision } from '@/lib/memory/semantic-cache-experiment';

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
