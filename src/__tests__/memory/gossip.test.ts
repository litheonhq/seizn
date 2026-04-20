import { describe, expect, it } from 'vitest';
import { distortFact } from '@/lib/memory/gossip';

describe('gossip distortion model', () => {
  it('keeps facts unchanged when distortion is disabled', () => {
    expect(distortFact({
      fact: 'Mira stole the treasure',
      fromEntityId: 'mira',
      toEntityId: 'oran',
      model: 'none',
    })).toBe('Mira stole the treasure');
  });

  it('mutates words with deterministic replacements', () => {
    const result = distortFact({
      fact: 'Mira stole the secret treasure',
      fromEntityId: 'mira',
      toEntityId: 'oran',
      model: 'word_swap',
      config: { seed: 'always', wordSwapProbability: 1 },
    });

    expect(result).toBe('Mira borrowed the rumor supplies');
  });

  it('supports entity aliases for rumor drift', () => {
    const result = distortFact({
      fact: 'Mira met Oran near the gate',
      fromEntityId: 'Mira',
      toEntityId: 'Oran',
      model: 'entity_swap',
      config: {
        seed: 'entity',
        entitySwapProbability: 1,
        entityAliases: { Mira: 'the scout', Oran: 'the captain' },
      },
    });

    expect(result).toBe('the scout met the captain near the gate');
  });

  it('accepts custom distortion extensions', () => {
    const result = distortFact({
      fact: 'The bridge is safe',
      fromEntityId: 'scout',
      toEntityId: 'guard',
      model: 'custom',
      customDistorter: (fact) => fact.replace('safe', 'haunted'),
    });

    expect(result).toBe('The bridge is haunted');
  });
});
