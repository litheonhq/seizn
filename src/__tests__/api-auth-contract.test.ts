/**
 * API Auth Contract Tests
 *
 * Ensures authentication behavior stays aligned with the Seizn Technical Spec:
 * - Authorization: Bearer szn_xxx  (canonical)
 * - x-api-key: szn_xxx             (legacy, deprecated by 2026-05-01)
 * - Error codes & response envelope (error_code, trace_id, hint, docs_url)
 *
 * If these tests fail, either code or docs have drifted — fix before merging.
 */

import { describe, it, expect } from 'vitest';
import {
  extractApiKey,
  getDeprecationHeaders,
} from '@/lib/api-auth';
import {
  ErrorCodes,
  createApiError,
  isApiError,
  type ApiErrorResponse,
} from '@/lib/api-error';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(headers: Record<string, string>): { headers: { get: (name: string) => string | null } } {
  const map = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    headers: {
      get: (name: string) => map.get(name.toLowerCase()) ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// §1 – Key Extraction
// ---------------------------------------------------------------------------

describe('extractApiKey', () => {
  it('extracts Bearer token from Authorization header', () => {
    const req = makeRequest({ Authorization: 'Bearer szn_test123' });
    const result = extractApiKey(req as never);

    expect(result.apiKey).toBe('szn_test123');
    expect(result.method).toBe('bearer');
    expect(result.isLegacy).toBe(false);
  });

  it('is case-insensitive for Bearer prefix', () => {
    const req = makeRequest({ Authorization: 'bearer szn_abc' });
    const result = extractApiKey(req as never);

    expect(result.apiKey).toBe('szn_abc');
    expect(result.method).toBe('bearer');
  });

  it('extracts from x-api-key as legacy fallback', () => {
    const req = makeRequest({ 'x-api-key': 'szn_legacy456' });
    const result = extractApiKey(req as never);

    expect(result.apiKey).toBe('szn_legacy456');
    expect(result.method).toBe('x-api-key');
    expect(result.isLegacy).toBe(true);
  });

  it('prefers Bearer over x-api-key when both present', () => {
    const req = makeRequest({
      Authorization: 'Bearer szn_bearer',
      'x-api-key': 'szn_xapi',
    });
    const result = extractApiKey(req as never);

    expect(result.apiKey).toBe('szn_bearer');
    expect(result.method).toBe('bearer');
  });

  it('returns null when no auth header present', () => {
    const req = makeRequest({});
    const result = extractApiKey(req as never);

    expect(result.apiKey).toBeNull();
    expect(result.method).toBeNull();
    expect(result.isLegacy).toBe(false);
  });

  it('returns null when Authorization header has wrong scheme', () => {
    const req = makeRequest({ Authorization: 'Basic abc123' });
    const result = extractApiKey(req as never);

    // Basic auth falls through; no x-api-key → null
    expect(result.apiKey).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §2 – Deprecation Headers (x-api-key)
// ---------------------------------------------------------------------------

describe('getDeprecationHeaders', () => {
  it('returns deprecation headers for x-api-key method', () => {
    const headers = getDeprecationHeaders('x-api-key');

    expect(headers).toHaveProperty('Deprecation', 'true');
    expect(headers).toHaveProperty('Sunset');
    expect(headers).toHaveProperty('Link');
    expect(headers).toHaveProperty('X-Deprecation-Notice');

    // Sunset must be a valid ISO date
    expect(() => new Date(headers['Sunset'])).not.toThrow();

    // Link must be RFC 8288 compliant (rel="deprecation")
    expect(headers['Link']).toMatch(/rel="deprecation"/);
  });

  it('returns empty object for Bearer method', () => {
    expect(getDeprecationHeaders('bearer')).toEqual({});
  });

  it('returns empty object for null method', () => {
    expect(getDeprecationHeaders(null)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// §3 – Error Code Enum Completeness
// ---------------------------------------------------------------------------

describe('ErrorCodes', () => {
  const requiredAuthCodes = [
    'AUTH_MISSING_KEY',
    'AUTH_INVALID_KEY',
    'AUTH_EXPIRED_KEY',
  ] as const;

  const requiredRateCodes = [
    'RATE_LIMIT_EXCEEDED',
    'QUOTA_EXCEEDED',
  ] as const;

  for (const code of requiredAuthCodes) {
    it(`defines ${code}`, () => {
      expect(ErrorCodes).toHaveProperty(code);
      expect(ErrorCodes[code]).toBe(code);
    });
  }

  for (const code of requiredRateCodes) {
    it(`defines ${code}`, () => {
      expect(ErrorCodes).toHaveProperty(code);
      expect(ErrorCodes[code]).toBe(code);
    });
  }
});

// ---------------------------------------------------------------------------
// §4 – Error Response Envelope
// ---------------------------------------------------------------------------

describe('createApiError envelope', () => {
  it('includes all required fields', async () => {
    const res = createApiError({
      code: ErrorCodes.AUTH_MISSING_KEY,
      message: 'test',
      status: 401,
    });

    const body = (await res.json()) as ApiErrorResponse;

    expect(body).toHaveProperty('error');
    expect(body.error).toHaveProperty('error_code', 'AUTH_MISSING_KEY');
    expect(body.error).toHaveProperty('message');
    expect(body.error).toHaveProperty('trace_id');
    expect(body.error).toHaveProperty('hint');
    expect(body.error).toHaveProperty('docs_url');

    // trace_id format: trc_ prefix + alphanumeric id
    expect(body.error.trace_id).toMatch(/^trc_[a-z0-9]+$/);

    // docs_url must point to seizn.com
    expect(body.error.docs_url).toContain('seizn.com/docs');
  });

  it('sets X-Trace-ID header', () => {
    const res = createApiError({
      code: ErrorCodes.AUTH_INVALID_KEY,
      message: 'bad key',
      status: 401,
    });

    expect(res.headers.get('X-Trace-ID')).toMatch(/^trc_/);
  });

  it('routes auth errors to #authentication docs', async () => {
    const res = createApiError({
      code: ErrorCodes.AUTH_MISSING_KEY,
      message: 'test',
      status: 401,
    });
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.docs_url).toContain('#authentication');
  });

  it('routes rate limit errors to #rate-limits docs', async () => {
    const res = createApiError({
      code: ErrorCodes.RATE_LIMIT_EXCEEDED,
      message: 'test',
      status: 429,
    });
    const body = (await res.json()) as ApiErrorResponse;
    expect(body.error.docs_url).toContain('#rate-limits');
  });
});

// ---------------------------------------------------------------------------
// §5 – isApiError guard
// ---------------------------------------------------------------------------

describe('isApiError', () => {
  it('detects valid API error objects', () => {
    const obj: ApiErrorResponse = {
      error: {
        error_code: 'AUTH_MISSING_KEY',
        message: 'key missing',
        trace_id: 'trc_abc',
        hint: 'add header',
      },
    };
    expect(isApiError(obj)).toBe(true);
  });

  it('rejects non-error objects', () => {
    expect(isApiError({})).toBe(false);
    expect(isApiError(null)).toBe(false);
    expect(isApiError({ error: {} })).toBe(false);
    expect(isApiError({ error: { message: 'no code' } })).toBe(false);
  });
});
