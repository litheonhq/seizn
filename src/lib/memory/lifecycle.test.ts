import { describe, expect, it } from 'vitest';
import { deduplicateSemanticFacts, evaluateSceneQuality } from './lifecycle';

describe('lifecycle consolidation quality gate', () => {
  it('deduplicates semantic facts by normalized text', () => {
    const deduped = deduplicateSemanticFacts([
      'User likes coffee.',
      'user likes coffee',
      'User likes coffee!',
      'User prefers tea',
    ]);

    expect(deduped).toHaveLength(2);
    expect(deduped[0]).toBe('User likes coffee.');
    expect(deduped[1]).toBe('User prefers tea');
  });

  it('passes high-quality consolidated scenes', () => {
    const quality = evaluateSceneQuality(
      {
        summary:
          'User prefers morning coffee and works best with concise task plans. They value quiet environments for focused work.',
        semanticFacts: [
          'User prefers coffee in the morning',
          'User works best with concise task plans',
          'User values quiet environments for focused work',
        ],
        profileUpdates: [
          { field: 'preference.drink', value: 'coffee', confidence: 0.91, source: 'explicit' },
          { field: 'workstyle.focus', value: 'quiet', confidence: 0.86, source: 'implicit' },
        ],
      },
      [
        {
          content: 'I usually start with coffee and then review a short plan for the day.',
          atomicFacts: ['User starts with coffee', 'User prefers short daily plans'],
        },
        {
          content: 'Noisy places make it hard for me to focus.',
          atomicFacts: ['User prefers quiet environments for focus'],
        },
      ],
      0.58
    );

    expect(quality.passed).toBe(true);
    expect(quality.score).toBeGreaterThanOrEqual(0.58);
    expect(quality.breakdown.contradictionSafety).toBeGreaterThan(0.7);
  });

  it('rejects low-quality scenes with duplicated and contradictory facts', () => {
    const quality = evaluateSceneQuality(
      {
        summary:
          'User likes coffee. User likes coffee. User likes coffee. User likes coffee. User likes coffee. User likes coffee. User likes coffee.',
        semanticFacts: [
          'User likes coffee',
          'User does not like coffee',
          'User likes coffee',
        ],
        profileUpdates: [],
      },
      [
        {
          content: 'I like coffee.',
          atomicFacts: ['User likes coffee'],
        },
        {
          content: 'Actually I do not like coffee anymore.',
          atomicFacts: ['User does not like coffee'],
        },
      ],
      0.58
    );

    expect(quality.passed).toBe(false);
    expect(quality.score).toBeLessThan(0.58);
    expect(quality.rejectionReason).toBeDefined();
  });
});

