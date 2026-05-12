import { describe, expect, it } from 'vitest';

import {
  STORY_LAYERS,
  STORY_LAYER_INTERACTION_RULES,
  getStoryLayer,
  type StoryLayerId,
} from '../story-layers';

describe('story-layers', () => {
  it('exports exactly seven layers', () => {
    expect(STORY_LAYERS).toHaveLength(7);
  });

  it('every layer has the required fields populated', () => {
    for (const layer of STORY_LAYERS) {
      expect(layer.id).toMatch(/^[a-z_]+$/);
      expect(layer.name.length).toBeGreaterThan(0);
      expect(layer.description.length).toBeGreaterThan(20);
      expect(layer.milestones.length).toBeGreaterThan(0);
    }
  });

  it('layer ids are unique', () => {
    const ids = STORY_LAYERS.map((layer) => layer.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('layer ids cover the canonical seven', () => {
    const ids = STORY_LAYERS.map((layer) => layer.id).sort();
    expect(ids).toEqual(
      (
        [
          'character_change',
          'meaning',
          'mystery',
          'plot',
          'prose',
          'relationships',
          'world',
        ] as StoryLayerId[]
      ).sort(),
    );
  });

  it('getStoryLayer resolves and throws on unknown', () => {
    expect(getStoryLayer('meaning').name).toBe('Meaning');
    expect(() => getStoryLayer('not_a_layer' as StoryLayerId)).toThrow();
  });

  it('exports interaction rules', () => {
    expect(STORY_LAYER_INTERACTION_RULES.length).toBeGreaterThanOrEqual(7);
  });
});
