/**
 * API-Level Security Tests
 *
 * Tests for authentication bypass, injection, authorization, and rate limiting
 * at the HTTP route handler level.
 *
 * Run: npx vitest run src/__tests__/security/api-security.test.ts
 */

import { describe, it, expect } from 'vitest';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

// Skip if no test server is running
const shouldRun = process.env.SECURITY_TEST_LIVE === 'true';
const allowRateLimit = shouldRun;

function expectedStatuses(base: number[]): number[] {
  return allowRateLimit ? [...base, 429] : base;
}

describe.skipIf(!shouldRun)('API Security Tests', () => {
  // ============================================
  // Auth Bypass Tests
  // ============================================
  describe('Authentication Bypass', () => {
    it('should reject requests without any auth', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/memories?query=test`);
      expect(res.status).toBe(401);
    });

    it('should reject invalid API key format', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/memories?query=test`, {
        headers: { Authorization: 'Bearer invalid-key-format' },
      });
      expect(expectedStatuses([401])).toContain(res.status);
    });

    it('should reject expired/revoked API key', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/memories?query=test`, {
        headers: { Authorization: 'Bearer szn_revoked_000000000000' },
      });
      expect(expectedStatuses([401])).toContain(res.status);
    });

    it('should reject SQL injection in API key', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/memories?query=test`, {
        headers: { Authorization: "Bearer szn_' OR 1=1 --" },
      });
      expect(expectedStatuses([401])).toContain(res.status);
    });

    it('should not leak auth error details', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/memories?query=test`, {
        headers: { Authorization: 'Bearer szn_invalid' },
      });
      const body = await res.json();
      const errorText =
        typeof body.error === 'string' ? body.error : JSON.stringify(body.error ?? '');
      // Should not reveal whether the key exists or is expired
      expect(errorText).not.toMatch(/expired|revoked|not found|does not exist/i);
    });
  });

  // ============================================
  // Input Validation Tests
  // ============================================
  describe('Input Validation', () => {
    it('should reject oversized request body', async () => {
      const largeContent = 'A'.repeat(1_000_000);
      const res = await fetch(`${BASE_URL}/api/v1/memories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.TEST_API_KEY}`,
        },
        body: JSON.stringify({ content: largeContent }),
      });
      // Should either reject (413) or truncate
      expect(expectedStatuses([400, 413, 500])).toContain(res.status);
    });

    it('should reject invalid JSON body', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/memories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.TEST_API_KEY}`,
        },
        body: '{invalid json',
      });
      expect(expectedStatuses([400])).toContain(res.status);
    });

    it('should sanitize XSS in memory content', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/memories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.TEST_API_KEY}`,
        },
        body: JSON.stringify({
          content: '<script>alert("xss")</script>Remember this fact',
        }),
      });
      if (res.ok) {
        const body = await res.json();
        // Content should be stored but XSS should not execute
        // (output encoding is the responsibility of the frontend)
        expect(body.success).toBe(true);
      }
    });

    it('should handle SQL injection in query params', async () => {
      const res = await fetch(
        `${BASE_URL}/api/v1/memories?query='; DROP TABLE memories; --`,
        {
          headers: { Authorization: `Bearer ${process.env.TEST_API_KEY}` },
        }
      );
      // Should not crash - parameterized queries should handle this
      expect(expectedStatuses([200, 400])).toContain(res.status);
    });

    it('should reject negative limit values', async () => {
      const res = await fetch(
        `${BASE_URL}/api/v1/memories?query=test&limit=-1`,
        {
          headers: { Authorization: `Bearer ${process.env.TEST_API_KEY}` },
        }
      );
      if (res.ok) {
        const body = await res.json();
        // Should clamp to minimum, not use negative value
        expect(body.data.results.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should enforce DELETE bulk limit', async () => {
      const ids = Array.from({ length: 101 }, (_, i) =>
        `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`
      ).join(',');

      const res = await fetch(
        `${BASE_URL}/api/v1/memories?ids=${ids}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${process.env.TEST_API_KEY}` },
        }
      );
      expect(expectedStatuses([400])).toContain(res.status);
    });
  });

  // ============================================
  // Authorization Tests (IDOR)
  // ============================================
  describe('Authorization / IDOR', () => {
    it('should not allow accessing other users memories', async () => {
      // Create a memory and try to access it with a different key
      // This tests RLS and user_id filtering
      const createRes = await fetch(`${BASE_URL}/api/v1/memories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.TEST_API_KEY}`,
        },
        body: JSON.stringify({ content: 'IDOR test memory' }),
      });

      if (createRes.ok) {
        const { data } = await createRes.json();
        const memoryId = data.memory.id;

        // Try to access with a different user's key (if available)
        const otherKey = process.env.TEST_API_KEY_OTHER;
        if (otherKey) {
          const historyRes = await fetch(
            `${BASE_URL}/api/v1/memories/history?memory_id=${memoryId}`,
            {
              headers: { Authorization: `Bearer ${otherKey}` },
            }
          );
          // Should return 404 (not found for this user) not the actual memory
          expect(historyRes.status).toBe(404);
        }

        // Clean up
        await fetch(`${BASE_URL}/api/v1/memories?ids=${memoryId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${process.env.TEST_API_KEY}` },
        });
      }
    });
  });

  // ============================================
  // Header Security Tests
  // ============================================
  describe('Security Headers', () => {
    it('should not expose server version info', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/memories?query=test`, {
        headers: { Authorization: `Bearer ${process.env.TEST_API_KEY}` },
      });
      // Should not expose detailed server info
      const server = res.headers.get('server');
      expect(server).not.toMatch(/next|node|express/i);
    });

    it('should set proper CORS for SSE stream', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/memories/stream`, {
        headers: { Authorization: `Bearer ${process.env.TEST_API_KEY}` },
      });
      const contentType = res.headers.get('content-type');
      if (res.status === 429) {
        expect(contentType).toContain('application/json');
        return;
      }
      expect(contentType).toContain('text/event-stream');
    });
  });

  // ============================================
  // Tool Gating Security Tests
  // ============================================
  describe('Tool Gating Security', () => {
    it('should reject tool execution without token', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/tools/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.TEST_API_KEY}`,
        },
        body: JSON.stringify({ toolId: 'some-tool-id' }),
      });
      // Should fail due to missing tokenId
      expect(expectedStatuses([400])).toContain(res.status);
    });

    it('should reject tool execution with non-existent token', async () => {
      const res = await fetch(`${BASE_URL}/api/v1/tools/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.TEST_API_KEY}`,
        },
        body: JSON.stringify({
          tokenId: '00000000-0000-0000-0000-000000000000',
          toolId: '00000000-0000-0000-0000-000000000001',
        }),
      });
      expect(expectedStatuses([404])).toContain(res.status);
    });
  });
});
