import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { POST, verifyInternalKey } from './route';

const ORIGINAL_INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

function makeRequest(url: string, init?: RequestInit): NextRequest {
  return new Request(url, init) as unknown as NextRequest;
}

afterEach(() => {
  if (ORIGINAL_INTERNAL_API_KEY === undefined) {
    delete process.env.INTERNAL_API_KEY;
    return;
  }
  process.env.INTERNAL_API_KEY = ORIGINAL_INTERNAL_API_KEY;
});

describe('tenant-policy enforce route auth', () => {
  it('fails closed when INTERNAL_API_KEY is not configured', () => {
    delete process.env.INTERNAL_API_KEY;

    const request = makeRequest('http://localhost/api/tenant-policy/enforce', {
      headers: { 'x-internal-key': 'anything' },
    });

    expect(verifyInternalKey(request)).toBe(false);
  });

  it('rejects request when x-internal-key header is missing', () => {
    process.env.INTERNAL_API_KEY = 'expected-key';

    const request = makeRequest('http://localhost/api/tenant-policy/enforce');
    expect(verifyInternalKey(request)).toBe(false);
  });

  it('POST returns 401 when internal key is missing', async () => {
    process.env.INTERNAL_API_KEY = 'expected-key';

    const request = makeRequest('http://localhost/api/tenant-policy/enforce', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenant_id: 'tenant-1',
        request_type: 'summer',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

});
