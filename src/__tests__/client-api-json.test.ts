import { describe, expect, it } from 'vitest';

import { ApiJsonResponseError, readApiJson } from '@/lib/client/api-json';

describe('readApiJson', () => {
  it('parses successful JSON responses', async () => {
    const response = new Response(JSON.stringify({ success: true, value: 1 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

    await expect(readApiJson<{ value: number }>(response, 'Request failed')).resolves.toMatchObject({
      value: 1,
    });
  });

  it('throws the API error message for JSON error responses', async () => {
    const response = new Response(
      JSON.stringify({ error: { message: 'CSRF validation failed: token mismatch' } }),
      {
        status: 403,
        headers: { 'content-type': 'application/json' },
      },
    );

    await expect(readApiJson(response, 'Request failed')).rejects.toThrow(
      'CSRF validation failed: token mismatch',
    );
  });

  it('does not leak JSON parser syntax errors for HTML responses', async () => {
    const response = new Response('<script type="text/javascript">self.__next_f.push([])</script>', {
      status: 500,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });

    await expect(readApiJson(response, 'Failed to create key')).rejects.toMatchObject({
      name: 'ApiJsonResponseError',
      message: 'Failed to create key. The server returned an HTML page instead of JSON. Refresh the page and try again.',
      status: 500,
    } satisfies Partial<ApiJsonResponseError>);
  });

  it('maps 401 HTML responses to a session-expired message', async () => {
    const response = new Response('<html><body>Login</body></html>', {
      status: 401,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });

    await expect(readApiJson(response, 'Request failed')).rejects.toMatchObject({
      name: 'ApiJsonResponseError',
      message: 'Your session expired. Refresh the page and sign in again.',
      status: 401,
    } satisfies Partial<ApiJsonResponseError>);
  });

  it('reports empty bodies without exposing parser internals', async () => {
    const response = new Response('', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

    await expect(readApiJson(response, 'Request failed')).rejects.toMatchObject({
      name: 'ApiJsonResponseError',
      message: 'Request failed. The server returned an empty response.',
      status: 200,
    } satisfies Partial<ApiJsonResponseError>);
  });
});
