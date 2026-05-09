import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, verifyCsrf, verifyCsrfToken } from '@/lib/csrf';

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

  it('requires a double-submit token for same-origin cookie mutations in strict mode', async () => {
    const request = new NextRequest('http://localhost:3000/api/budget/settings', {
      method: 'PUT',
      headers: {
        origin: 'http://localhost:3000',
      },
    });

    const response = verifyCsrfToken(request);
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      error: 'CSRF validation failed: token mismatch',
    });
  });

  it('allows same-origin cookie mutations with a matching double-submit token', () => {
    const token = 'test-csrf-token';
    const request = new NextRequest('http://localhost:3000/api/budget/settings', {
      method: 'PUT',
      headers: {
        origin: 'http://localhost:3000',
        cookie: `${CSRF_COOKIE_NAME}=${token}`,
        [CSRF_HEADER_NAME]: token,
      },
    });

    expect(verifyCsrfToken(request)).toBeNull();
  });
});
