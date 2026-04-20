import { describe, expect, it } from 'vitest';
import { applyDecayRerank, currentStrength, type MemoryWithDecay } from '@/lib/memory/decay';

describe('memory decay policies', () => {
  it('decays to 0.5 after one half-life', () => {
    const strength = currentStrength(
      {
        id: 'm1',
        base_strength: 1,
        half_life_hours: 24,
        last_reinforced_at: '2026-04-20T00:00:00.000Z',
      },
      new Date('2026-04-21T00:00:00.000Z')
    );

    expect(strength).toBeCloseTo(0.5, 4);
  });

  it('never decays when half-life is null', () => {
    const strength = currentStrength(
      {
        id: 'plot',
        base_strength: 0.9,
        half_life_hours: null,
        last_reinforced_at: '2026-04-01T00:00:00.000Z',
      },
      new Date('2026-04-21T00:00:00.000Z'),
      { halfLifeHours: null }
    );

    expect(strength).toBe(0.9);
  });

  it('reranks by current strength as a soft factor', () => {
    const memories: MemoryWithDecay[] = [
      {
        id: 'stale-high-sim',
        similarity: 0.9,
        base_strength: 1,
        half_life_hours: 24,
        last_reinforced_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'fresh-medium-sim',
        similarity: 0.8,
        base_strength: 1,
        half_life_hours: 24,
        last_reinforced_at: '2026-04-20T23:00:00.000Z',
      },
    ];

    const ranked = applyDecayRerank(memories, {
      asOf: new Date('2026-04-21T00:00:00.000Z'),
      weight: 0.5,
    });

    expect(ranked[0].id).toBe('fresh-medium-sim');
    expect(ranked[0].decay_strength).toBeGreaterThan(ranked[1].decay_strength);
  });
});
