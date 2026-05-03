import { describe, expect, it } from 'vitest';
import { sanitizeTelemetryAttributes } from './browser-telemetry';

describe('sanitizeTelemetryAttributes', () => {
  it('redacts sensitive keys and strips URL query strings', () => {
    const sanitized = sanitizeTelemetryAttributes({
      url: 'https://www.seizn.com/pricing?token=secret&plan=pro#checkout',
      path: '/dashboard?review_token=abc123',
      authorization: 'Bearer szn_secret',
      nested: {
        apiKey: 'szn_secret',
        stack: 'Error at https://www.seizn.com/app.js?session=abc:1:2',
      },
    });

    expect(sanitized).toEqual({
      url: 'https://www.seizn.com/pricing',
      path: '/dashboard',
      authorization: '[redacted]',
      nested: {
        apiKey: '[redacted]',
        stack: 'Error at https://www.seizn.com/app.js',
      },
    });
  });

  it('caps nested arrays and objects to bounded telemetry payloads', () => {
    const sanitized = sanitizeTelemetryAttributes({
      items: Array.from({ length: 20 }, (_, index) => ({ index })),
      object: Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`key${index}`, index])),
    });

    expect((sanitized.items as unknown[]).length).toBe(10);
    expect(Object.keys(sanitized.object as Record<string, unknown>).length).toBe(24);
  });
});
