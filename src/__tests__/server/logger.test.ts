import { afterEach, describe, expect, it, vi } from 'vitest';
import { logServerError, sanitizeForLogs } from '@/lib/server/logger';

afterEach(() => {
  delete process.env.CODEX_ENABLE_TEST_LOGS;
});

describe('server logger redaction', () => {
  it('redacts sensitive values in strings', () => {
    const input =
      'Bearer secret-token email=user@example.com https://x.test?token=abc123';

    expect(sanitizeForLogs(input)).toBe(
      '[REDACTED] email=[REDACTED] https://x.test?token=[REDACTED]'
    );
  });

  it('redacts sensitive keys in objects', () => {
    expect(
      sanitizeForLogs({
        authorization: 'Bearer secret-token',
        nested: {
          apiKey: 'sk_test_1234567890abcdef',
          note: 'hello',
        },
      })
    ).toEqual({
      authorization: '[REDACTED]',
      nested: {
        apiKey: '[REDACTED]',
        note: 'hello',
      },
    });
  });

  it('serializes errors without leaking secrets', () => {
    const error = new Error(
      'request failed for user@example.com with Bearer secret-token'
    );

    expect(sanitizeForLogs(error)).toMatchObject({
      name: 'Error',
      message: 'request failed for [REDACTED] with [REDACTED]',
    });
  });

  it('logs sanitized payloads', () => {
    process.env.CODEX_ENABLE_TEST_LOGS = '1';
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logServerError('Request failed', {
      token: 'secret-token',
      email: 'user@example.com',
    });

    expect(spy).toHaveBeenCalledWith('Request failed', {
      detail: {
        token: '[REDACTED]',
        email: '[REDACTED]',
      },
    });

    spy.mockRestore();
  });

  it('stays quiet in test environment by default', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logServerError('Request failed', {
      token: 'secret-token',
    });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
