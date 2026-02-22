import { afterEach, describe, expect, it } from 'vitest';
import { getSanitizedEnv, sanitizeEnvValue } from '@/lib/env';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('env sanitization', () => {
  it('removes BOM and invisible characters from env values', () => {
    const raw = '\ufeff  sk-test\u200b\u200c\u200d-key  ';
    expect(sanitizeEnvValue(raw)).toBe('sk-test-key');
  });

  it('returns undefined for missing or effectively empty env values', () => {
    delete process.env.EMPTY_KEY;
    expect(getSanitizedEnv('EMPTY_KEY')).toBeUndefined();

    process.env.EMPTY_KEY = '\ufeff \u200b ';
    expect(getSanitizedEnv('EMPTY_KEY')).toBeUndefined();
  });

  it('returns sanitized env value when set', () => {
    process.env.TEST_API_KEY = '\ufeff  value-123  ';
    expect(getSanitizedEnv('TEST_API_KEY')).toBe('value-123');
  });
});
