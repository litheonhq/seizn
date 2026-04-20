import { describe, expect, it } from 'vitest';
import {
  buildDsrArchive,
  canonicalizeForCompliance,
  signCompliancePayload,
} from '@/lib/compliance/dsr';

describe('DSR export archive', () => {
  it('includes all subject memories and audit lines in a signed archive payload', () => {
    const memories = Array.from({ length: 5 }, (_, index) => ({
      id: `memory-${index + 1}`,
      subject_id: 'player-1',
      content: `memory ${index + 1}`,
      created_at: `2026-04-0${index + 1}T00:00:00.000Z`,
    }));

    const archive = buildDsrArchive({
      organizationId: 'org-1',
      subjectId: 'player-1',
      generatedAt: '2026-04-20T00:00:00.000Z',
      memories,
      auditLogs: [
        {
          id: 'audit-1',
          action: 'memory.create',
          details: { subject_id: 'player-1' },
          created_at: '2026-04-01T00:00:00.000Z',
        },
      ],
      interactions: [],
    });

    expect(archive.counts.memories).toBe(5);
    expect(archive.memories.map((memory) => memory.id)).toEqual([
      'memory-1',
      'memory-2',
      'memory-3',
      'memory-4',
      'memory-5',
    ]);
    expect(archive.counts.audit_logs).toBe(1);
    expect(signCompliancePayload(archive, 'test-secret')).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalizeForCompliance({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});
