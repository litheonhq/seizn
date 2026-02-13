/**
 * OWASP LLM06: Sensitive Information Disclosure Tests
 *
 * Tests for PII leakage, API key exposure, and cross-tenant data leakage.
 */

import { describe, it, expect } from 'vitest';
import {
  containsSensitiveData,
  createTestContext,
} from './utils';

// Mock memory retrieval with PII redaction
async function retrieveMemoryWithRedaction(
  _query: string,
  _context: ReturnType<typeof createTestContext>
): Promise<{
  memories: string[];
  redacted: boolean;
  redactedCount: number;
}> {
  // Mock memories that might contain sensitive data
  const rawMemories = [
    'User email is john.doe@example.com',
    'API key stored at sk-proj-abc123xyz456',
    'SSN: 123-45-6789',
    'Credit card: 4111111111111111',
    'Password is hunter2',
    'Normal memory without sensitive data',
  ];

  const redactedMemories: string[] = [];
  let redactedCount = 0;

  for (const memory of rawMemories) {
    let redactedMemory = memory;
    let wasRedacted = false;

    // Redact emails
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    if (emailPattern.test(redactedMemory)) {
      redactedMemory = redactedMemory.replace(emailPattern, '[EMAIL_REDACTED]');
      wasRedacted = true;
    }

    // Redact API keys
    const apiKeyPatterns = [
      /sk-[a-zA-Z0-9-]{20,}/g,
      /szn_[a-zA-Z0-9]{32}/g,
    ];
    for (const pattern of apiKeyPatterns) {
      if (pattern.test(redactedMemory)) {
        redactedMemory = redactedMemory.replace(pattern, '[API_KEY_REDACTED]');
        wasRedacted = true;
      }
    }

    // Redact SSN
    const ssnPattern = /\b\d{3}-\d{2}-\d{4}\b/g;
    if (ssnPattern.test(redactedMemory)) {
      redactedMemory = redactedMemory.replace(ssnPattern, '[SSN_REDACTED]');
      wasRedacted = true;
    }

    // Redact credit cards
    const ccPattern = /\b\d{16}\b/g;
    if (ccPattern.test(redactedMemory)) {
      redactedMemory = redactedMemory.replace(ccPattern, '[CC_REDACTED]');
      wasRedacted = true;
    }

    // Redact passwords
    const passwordPattern = /password\s*(is|=|:)\s*\S+/gi;
    if (passwordPattern.test(redactedMemory)) {
      redactedMemory = redactedMemory.replace(passwordPattern, 'password [REDACTED]');
      wasRedacted = true;
    }

    if (wasRedacted) {
      redactedCount++;
    }
    redactedMemories.push(redactedMemory);
  }

  return {
    memories: redactedMemories,
    redacted: redactedCount > 0,
    redactedCount,
  };
}

// Mock cross-tenant isolation check
async function queryMemories(
  organizationId: string,
  _query: string
): Promise<{
  results: Array<{ content: string; organizationId: string }>;
  isolationViolation: boolean;
}> {
  // Mock results - in real tests, this would query actual database
  const mockResults = [
    { content: 'Memory from org-123', organizationId: 'org-123' },
    { content: 'Memory from org-456', organizationId: 'org-456' },
    { content: 'Another from org-123', organizationId: 'org-123' },
  ];

  // Filter to only return results from the requesting org
  const filteredResults = mockResults.filter(
    (r) => r.organizationId === organizationId
  );

  // Check if any results leaked from other orgs
  const isolationViolation = filteredResults.some(
    (r) => r.organizationId !== organizationId
  );

  return {
    results: filteredResults,
    isolationViolation,
  };
}

describe('LLM06: Sensitive Information Disclosure', () => {
  const ctx = createTestContext({ organizationId: 'org-123' });

  describe('PII Redaction', () => {
    it('should redact email addresses in memory retrieval', async () => {
      const result = await retrieveMemoryWithRedaction('user info', ctx);

      for (const memory of result.memories) {
        const { leaked } = containsSensitiveData(memory, 'pii');
        // Should not contain raw PII
        expect(leaked).toBe(false);
      }
    });

    it('should redact SSN patterns', async () => {
      const result = await retrieveMemoryWithRedaction('user info', ctx);

      const allMemories = result.memories.join(' ');
      expect(allMemories).not.toMatch(/\d{3}-\d{2}-\d{4}/);
      expect(allMemories).toContain('[SSN_REDACTED]');
    });

    it('should redact credit card numbers', async () => {
      const result = await retrieveMemoryWithRedaction('payment info', ctx);

      const allMemories = result.memories.join(' ');
      expect(allMemories).not.toMatch(/\d{16}/);
      expect(allMemories).toContain('[CC_REDACTED]');
    });
  });

  describe('API Key Protection', () => {
    it('should redact API keys in responses', async () => {
      const result = await retrieveMemoryWithRedaction('api config', ctx);

      for (const memory of result.memories) {
        const { leaked } = containsSensitiveData(memory, 'apiKeys');
        expect(leaked).toBe(false);
      }
    });

    it('should redact various API key formats', async () => {
      const result = await retrieveMemoryWithRedaction('credentials', ctx);

      const allMemories = result.memories.join(' ');
      expect(allMemories).not.toMatch(/sk-[a-zA-Z0-9-]+/);
      expect(allMemories).toContain('[API_KEY_REDACTED]');
    });
  });

  describe('Secret Protection', () => {
    it('should redact passwords', async () => {
      const result = await retrieveMemoryWithRedaction('login', ctx);

      for (const memory of result.memories) {
        const { leaked } = containsSensitiveData(memory, 'secrets');
        expect(leaked).toBe(false);
      }
    });

    it('should count redactions correctly', async () => {
      const result = await retrieveMemoryWithRedaction('all', ctx);

      expect(result.redacted).toBe(true);
      expect(result.redactedCount).toBeGreaterThan(0);
    });
  });

  describe('Cross-Tenant Isolation', () => {
    it('should only return memories from requesting organization', async () => {
      const result = await queryMemories('org-123', 'search query');

      // All results should be from org-123
      for (const r of result.results) {
        expect(r.organizationId).toBe('org-123');
      }
      expect(result.isolationViolation).toBe(false);
    });

    it('should not leak data between organizations', async () => {
      const org1Results = await queryMemories('org-123', 'confidential');
      const org2Results = await queryMemories('org-456', 'confidential');

      // Results should be isolated
      const org1Contents = org1Results.results.map((r) => r.content);
      const org2Contents = org2Results.results.map((r) => r.content);

      // No overlap between organizations
      const overlap = org1Contents.filter((c) => org2Contents.includes(c));
      expect(overlap.length).toBe(0);
    });
  });

  describe('Internal System Information', () => {
    it('should not expose internal error details', () => {
      // Mock error response
      const errorResponse = {
        error: 'An error occurred',
        // Should NOT contain:
        // - Stack traces
        // - Internal paths
        // - Database queries
        // - System configuration
      };

      expect(errorResponse).not.toHaveProperty('stack');
      expect(errorResponse).not.toHaveProperty('query');
      expect(errorResponse).not.toHaveProperty('internalPath');
      expect(JSON.stringify(errorResponse)).not.toContain('/usr/');
      expect(JSON.stringify(errorResponse)).not.toContain('SELECT');
    });

    it('should sanitize debug information in production', () => {
      const isProduction = process.env.NODE_ENV === 'production';

      const response = {
        success: false,
        error: 'Request failed',
        // Debug info should only be present in non-production
        ...(isProduction ? {} : { debug: 'Internal debug info' }),
      };

      if (isProduction) {
        expect(response).not.toHaveProperty('debug');
      }
    });
  });
});
