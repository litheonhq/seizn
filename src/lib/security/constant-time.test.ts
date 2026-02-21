import { describe, expect, it } from 'vitest';
import { constantTimeEqual } from './constant-time';

describe('constantTimeEqual', () => {
  it('returns true for equal strings', () => {
    expect(constantTimeEqual('secret-value', 'secret-value')).toBe(true);
  });

  it('returns false for different strings', () => {
    expect(constantTimeEqual('secret-value', 'different-value')).toBe(false);
  });

  it('returns false when either value is missing', () => {
    expect(constantTimeEqual(undefined, 'secret-value')).toBe(false);
    expect(constantTimeEqual('secret-value', undefined)).toBe(false);
    expect(constantTimeEqual(null, 'secret-value')).toBe(false);
  });
});

