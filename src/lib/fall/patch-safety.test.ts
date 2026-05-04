import { describe, expect, it } from 'vitest';
import {
  UnsafePatchError,
  applySafeStatePatch,
  assertSafePatchValue,
} from './patch-safety';

describe('applySafeStatePatch', () => {
  it('applies supported top-level and nested state patches', () => {
    const state = {
      messages: [{ role: 'user', content: 'before' }],
      context: { locale: 'ko' },
      memory: { score: 1 },
      toolCalls: [],
    };

    const patched = applySafeStatePatch(state, {
      messages: [{ role: 'user', content: 'after' }],
      context: { day: 'D29' },
      memory: { score: 2 },
      toolCalls: [{ id: 'tool-1', name: 'lookup', arguments: {} }],
      customState: { enabled: true },
    });

    expect(patched.messages).toEqual([{ role: 'user', content: 'after' }]);
    expect(patched.context).toEqual({ locale: 'ko', day: 'D29' });
    expect(patched.memory).toEqual({ score: 2 });
    expect(patched.toolCalls).toHaveLength(1);
    expect(patched.customState).toEqual({ enabled: true });
  });

  it('rejects top-level prototype pollution keys', () => {
    const patch = JSON.parse('{"__proto__":{"polluted":true}}') as Record<string, unknown>;

    expect(() => applySafeStatePatch({}, patch)).toThrow(UnsafePatchError);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects nested prototype pollution keys', () => {
    const patch = JSON.parse(
      '{"context":{"safe":true,"constructor":{"prototype":{"polluted":true}}}}'
    ) as Record<string, unknown>;

    expect(() => assertSafePatchValue(patch)).toThrow(UnsafePatchError);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects forbidden keys inside arrays', () => {
    const patch = JSON.parse(
      '{"messages":[{"role":"user","content":"x","prototype":{"polluted":true}}]}'
    ) as Record<string, unknown>;

    expect(() => applySafeStatePatch({}, patch)).toThrow(UnsafePatchError);
  });
});
