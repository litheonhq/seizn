import { describe, expect, it } from 'vitest';
import { applySceneBoost, createSceneContext, type SceneRecord } from '@/lib/memory/scenes';

const scene: SceneRecord = {
  id: 'scene-1',
  user_id: 'user-1',
  organization_id: null,
  namespace: 'default',
  entity_ids: ['npc-1', 'faction-2'],
  started_at: '2026-04-20T00:00:00.000Z',
  ended_at: null,
  summary: null,
  outcomes: {},
  metadata: {},
  created_at: '2026-04-20T00:00:00.000Z',
  updated_at: '2026-04-20T00:00:00.000Z',
};

describe('scene memory boost', () => {
  it('boosts and reorders memories connected to the active scene', () => {
    const boosted = applySceneBoost(
      [
        { id: 'm1', content: 'outside', similarity: 0.9, agent_id: 'npc-9' },
        { id: 'm2', content: 'inside', similarity: 0.8, agent_id: 'npc-1' },
      ],
      createSceneContext(scene),
      { boost: 1.5 }
    );

    expect(boosted[0].id).toBe('m2');
    expect(boosted[0].scene_boost).toBe(true);
    expect(boosted[0].scene_id).toBe('scene-1');
  });

  it('recognizes entity tags as scene membership', () => {
    const boosted = applySceneBoost(
      [{ id: 'm1', content: 'rumor', similarity: 0.5, tags: ['entity:faction-2'] }],
      createSceneContext(scene)
    );

    expect(boosted[0].scene_boost).toBe(true);
  });

  it('leaves recall order unchanged when no active scene exists', () => {
    const rows = [
      { id: 'm1', content: 'first', similarity: 0.7 },
      { id: 'm2', content: 'second', similarity: 0.6 },
    ];

    expect(applySceneBoost(rows, null)).toEqual(rows);
  });
});
