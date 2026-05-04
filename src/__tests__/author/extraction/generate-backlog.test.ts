import { describe, expect, it, vi } from 'vitest';
import characterRegistry from '../../../../docs/knot-input/character_registry.json';
import {
  generateBacklogForCharacter,
  type AuthorBacklogCategory,
  type AuthorBacklogCharacterInput,
} from '@/lib/author/extraction';

const KNOT_FIVE = [
  'knot.short1.char.sori',
  'knot.short1.char.reika',
  'knot.short1.char.nana',
  'knot.short1.char.lulu',
  'knot.short1.char.yui',
];
const CATEGORIES: AuthorBacklogCategory[] = ['좋아하는 것', '싫어하는 것', '작은 보상', '작은 짜증'];

describe('Author backlog generation Phase 4', () => {
  it('generates 5 behavior-cue candidates per category for the KNOT five-character dogfood set', async () => {
    const allContent = new Set<string>();

    for (const characterId of KNOT_FIVE) {
      const character = registryCharacter(characterId);
      const result = await generateBacklogForCharacter({
        userId: 'user-1',
        projectId: 'knot',
        character,
        categories: CATEGORIES,
        itemsPerCategory: 5,
      }, { mode: 'heuristic' });

      expect(result.metrics.mode).toBe('heuristic');
      expect(result.candidates).toHaveLength(20);
      expect(result.rejected).toHaveLength(0);
      expect(result.exportMarkdown).toContain(`${character.name} §X.6 backlog candidates`);

      for (const category of CATEGORIES) {
        expect(result.candidates.filter((candidate) => candidate.category === category)).toHaveLength(5);
      }
      for (const candidate of result.candidates) {
        expect(candidate.tier).toBe(1);
        expect(candidate.scope).toBe('short1');
        expect(candidate.content).toContain(character.name);
        expect(allContent.has(candidate.content)).toBe(false);
        allContent.add(candidate.content);
      }
    }
  });

  it('rejects duplicates, forbidden terms, tier 2, and invalid scope', async () => {
    const character = registryCharacter('knot.short1.char.sori');
    const result = await generateBacklogForCharacter({
      userId: 'user-1',
      projectId: 'knot',
      character,
      categories: CATEGORIES,
      existingEntries: ['소리는 조용한 확인을 좋아한다.'],
      existingCandidates: [{
        id: 'candidate.backlog.existing',
        content: '좋아하는 것 - 소리는 말없이 기다려 주는 시간을 기억한다.',
        type: 'fact',
      }],
    }, {
      mode: 'llm',
      generate: vi.fn().mockResolvedValue({
        provider: 'anthropic',
        model: 'claude-opus-4-7',
        text: '{"candidates":[]}',
        json: {
          candidates: [
            {
              category: '좋아하는 것',
              content: '소리는 조용한 확인을 좋아한다.',
              rationale: 'duplicate',
              tier: 1,
              scope: 'short1',
            },
            {
              category: '좋아하는 것',
              content: '소리는 고양이 귀 장식을 좋아한다.',
              rationale: 'forbidden visual trait',
              tier: 1,
              scope: 'short1',
            },
            {
              category: '싫어하는 것',
              content: '소리는 숨겨진 Tier 2 단서를 불편해한다.',
              rationale: 'author-only leak',
              tier: 2,
              scope: 'short1',
            },
            {
              category: '작은 보상',
              content: '소리는 말없이 기다려 주는 시간을 기억한다.',
              rationale: 'duplicate existing candidate with category prefix',
              tier: 1,
              scope: 'short1',
            },
            {
              category: '작은 보상',
              content: '소리는 짧은 확인 뒤 먼저 움직일 여지를 남긴다.',
              rationale: 'valid behavior cue',
              tier: 1,
              scope: 'short1',
            },
          ],
        },
        requestId: 'req-backlog-test',
        byok: true,
        usage: { tokensIn: 1, tokensOut: 1 },
        stopReason: 'end_turn',
      }),
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.rejected.flatMap((item) => item.reasons)).toEqual(expect.arrayContaining([
      'duplicate_existing_backlog',
      expect.stringContaining('forbidden_backlog_term'),
      'tier2_not_allowed',
    ]));
  });

  it('calls the LLM path once with a JSON-schema constrained backlog prompt', async () => {
    const generate = vi.fn().mockResolvedValue({
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      text: '{"candidates":[]}',
      json: {
        candidates: [{
          category: '좋아하는 것',
          content: '룰루는 장면이 무거워질 때 작게 농담할 틈을 찾는다.',
          rationale: 'behavior cue',
          tier: 1,
          scope: 'short1',
        }],
      },
      requestId: 'req-backlog-llm',
      byok: true,
      usage: { tokensIn: 10, tokensOut: 5 },
      stopReason: 'end_turn',
    });

    const result = await generateBacklogForCharacter({
      userId: 'user-1',
      projectId: 'knot',
      character: registryCharacter('knot.short1.char.lulu'),
      categories: ['좋아하는 것'],
      itemsPerCategory: 5,
    }, { mode: 'llm', generate });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      responseFormat: 'json',
      maxTokens: 2400,
      temperature: 0.2,
    }));
    expect(result.candidates).toHaveLength(1);
  });
});

function registryCharacter(id: string): AuthorBacklogCharacterInput {
  const raw = (characterRegistry.characters as Array<Record<string, unknown>>)
    .find((character) => character.id === id);
  if (!raw) throw new Error(`Missing registry character ${id}`);
  return {
    id,
    name: String(raw.name),
    summary: [raw.story_role, raw.current_status].filter(Boolean).join(' '),
    archetype: JSON.stringify(raw.archetype ?? ''),
    voice: raw.voice,
    persona: raw.personality_core,
    appearance: raw.appearance,
    background: raw.basic_info,
    currentArcPhase: String(raw.current_status ?? ''),
  };
}
