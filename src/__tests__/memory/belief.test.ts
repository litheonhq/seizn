import { describe, expect, it } from 'vitest';
import {
  evaluateBeliefVisibility,
  type BeliefShard,
  type MemoryForBelief,
} from '@/lib/memory/belief';

function belief(input: Partial<BeliefShard> & { aboutFactId: string; holderEntityId: string }): BeliefShard {
  return {
    id: `b_${input.aboutFactId}_${input.holderEntityId}`,
    organizationId: 'org_1',
    observedAt: '2026-04-20T10:00:00.000Z',
    witnessEventId: null,
    confidence: 1,
    revokedAt: null,
    sourceType: 'direct',
    ...input,
  };
}

const memories: MemoryForBelief[] = [
  { id: 'twist', content: 'The queen is the masked captain.' },
  { id: 'weather', content: 'It is raining in the harbor.' },
];

describe('belief shards', () => {
  it('includes facts observed by the perspective holder and excludes unobserved facts', () => {
    const result = evaluateBeliefVisibility(memories, [
      belief({ holderEntityId: 'npc_a', aboutFactId: 'twist' }),
    ], {
      perspectiveEntityId: 'npc_a',
      asOf: '2026-04-20T12:00:00.000Z',
    });

    expect(result.memories.map((memory) => memory.id)).toEqual(['twist']);
    expect(result.excluded).toEqual([{ id: 'weather', reason: 'no_belief' }]);
  });

  it('excludes facts after belief revocation', () => {
    const result = evaluateBeliefVisibility([memories[0]], [
      belief({
        holderEntityId: 'npc_a',
        aboutFactId: 'twist',
        revokedAt: '2026-04-20T11:00:00.000Z',
      }),
    ], {
      perspectiveEntityId: 'npc_a',
      asOf: '2026-04-20T12:00:00.000Z',
    });

    expect(result.memories).toEqual([]);
    expect(result.excluded).toEqual([{ id: 'twist', reason: 'revoked' }]);
  });

  it('filters low-confidence rumor beliefs', () => {
    const result = evaluateBeliefVisibility([memories[0]], [
      belief({
        holderEntityId: 'npc_a',
        aboutFactId: 'twist',
        sourceType: 'rumor',
        confidence: 0.2,
      }),
    ], {
      perspectiveEntityId: 'npc_a',
      asOf: '2026-04-20T12:00:00.000Z',
      minConfidence: 0.3,
    });

    expect(result.memories).toEqual([]);
    expect(result.excluded).toEqual([{ id: 'twist', reason: 'low_confidence' }]);
  });
});
