import { describe, expect, it } from 'vitest';
import {
  evaluateModeration,
  isModerationEnabled,
  type ModerationPolicy,
} from '@/lib/moderation/guard';

const base = {
  organizationId: 'org_1',
  policyName: 'test',
  memoryClass: null,
} satisfies Pick<ModerationPolicy, 'organizationId' | 'policyName' | 'memoryClass'>;

describe('memory moderation guard', () => {
  it('keeps moderation disabled unless the feature flag is explicitly enabled', () => {
    const previous = process.env.SEIZN_FEATURE_MODERATION;
    delete process.env.SEIZN_FEATURE_MODERATION;
    expect(isModerationEnabled()).toBe(false);

    process.env.SEIZN_FEATURE_MODERATION = 'true';
    expect(isModerationEnabled()).toBe(true);

    if (previous == null) {
      delete process.env.SEIZN_FEATURE_MODERATION;
    } else {
      process.env.SEIZN_FEATURE_MODERATION = previous;
    }
  });

  it('blocks explicit content when sexual score crosses the policy threshold', () => {
    const result = evaluateModeration('explicit scene', [
      { ...base, category: 'sexual', action: 'block', threshold: 0.8 },
    ]);

    expect(result.status).toBe('blocked');
    expect(result.scores.sexual).toBeGreaterThanOrEqual(0.8);
  });

  it('redacts PII and keeps the memory', () => {
    const result = evaluateModeration('Reach me at player@example.com', [
      { ...base, category: 'pii', action: 'redact', threshold: 0.5 },
    ]);

    expect(result.status).toBe('redacted');
    expect(result.redactedContent).toContain('[redacted-email]');
  });

  it('passes clean content without redaction', () => {
    const result = evaluateModeration('The blacksmith likes rain.', [
      { ...base, category: 'pii', action: 'redact', threshold: 0.5 },
    ]);

    expect(result.status).toBe('clean');
    expect(result.redactedContent).toBeUndefined();
  });
});
