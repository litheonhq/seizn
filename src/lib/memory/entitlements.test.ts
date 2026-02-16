import { describe, expect, it } from 'vitest';

import {
  ENCRYPTED_MEMORY_REQUIRED_PLAN,
  canUseEncryptedMemories,
  getEncryptedMemoryPlanError,
} from './entitlements';

describe('memory entitlements', () => {
  it('denies encrypted memories for free or missing plan', () => {
    expect(canUseEncryptedMemories('free')).toBe(false);
    expect(canUseEncryptedMemories(' Free ')).toBe(false);
    expect(canUseEncryptedMemories(null)).toBe(false);
    expect(canUseEncryptedMemories(undefined)).toBe(false);
  });

  it('allows encrypted memories for starter+ tiers', () => {
    expect(canUseEncryptedMemories('starter')).toBe(true);
    expect(canUseEncryptedMemories('plus')).toBe(true);
    expect(canUseEncryptedMemories('pro')).toBe(true);
    expect(canUseEncryptedMemories('enterprise')).toBe(true);
  });

  it('returns a stable starter requirement error payload', () => {
    expect(getEncryptedMemoryPlanError()).toEqual({
      error: 'E2E encrypted memories are available on Starter plan or above.',
      required_plan: ENCRYPTED_MEMORY_REQUIRED_PLAN,
    });
  });
});

