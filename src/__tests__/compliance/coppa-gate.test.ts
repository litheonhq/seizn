import { describe, expect, it } from 'vitest';
import {
  ComplianceError,
  assertRetentionAllowed,
  hasValidConsentRecord,
  policyFor,
} from '@/lib/compliance/age-gate';

function consentSupabase(records: unknown[]) {
  const query = {
    select: () => query,
    eq: () => query,
    is: () => query,
    lte: () => query,
    order: () => query,
    limit: async () => ({ data: records, error: null }),
  };

  return {
    from: () => query,
  } as never;
}

describe('COPPA age gate', () => {
  it('requires consent for under-13 retention', async () => {
    const policy = policyFor('minor_under_13');
    expect(policy.requireConsentRecord).toBe(true);
    expect(policy.allowVoicePrint).toBe(false);
    expect(policy.allowProfiling).toBe(false);

    await expect(
      assertRetentionAllowed(consentSupabase([]), {
        organizationId: 'org-1',
        subjectId: 'subject-1',
        bracket: 'minor_under_13',
      })
    ).rejects.toMatchObject({
      name: 'ComplianceError',
      code: 'compliance/coppa_consent_missing',
    } satisfies Partial<ComplianceError>);
  });

  it('allows under-13 retention with an active consent record', async () => {
    const records = [
      {
        id: 'consent-1',
        subject_id: 'subject-1',
        bracket: 'minor_under_13',
        granted_at: '2026-04-01T00:00:00.000Z',
        expires_at: '2026-05-01T00:00:00.000Z',
        revoked_at: null,
      },
    ];

    expect(hasValidConsentRecord(records, {
      asOf: new Date('2026-04-20T00:00:00.000Z'),
      bracket: 'minor_under_13',
    })).toBe(true);

    await expect(
      assertRetentionAllowed(consentSupabase(records), {
        organizationId: 'org-1',
        subjectId: 'subject-1',
        bracket: 'minor_under_13',
        asOf: new Date('2026-04-20T00:00:00.000Z'),
      })
    ).resolves.toMatchObject({ bracket: 'minor_under_13' });
  });
});
