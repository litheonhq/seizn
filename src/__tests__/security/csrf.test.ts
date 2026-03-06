import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/csrf';

describe('verifyCsrf', () => {
  it('allows local playwright origin on 127.0.0.1:3100', () => {
    const request = new NextRequest('http://127.0.0.1:3100/api/organizations', {
      method: 'POST',
      headers: {
        origin: 'http://127.0.0.1:3100',
      },
    });

    expect(verifyCsrf(request)).toBeNull();
  });

  it('rejects unknown origins', async () => {
    const request = new NextRequest('https://www.seizn.com/api/organizations', {
      method: 'POST',
      headers: {
        origin: 'https://malicious.example.com',
      },
    });

    const response = verifyCsrf(request);
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      error: 'CSRF validation failed: origin not allowed',
    });
  });
});
