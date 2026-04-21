import { afterEach, describe, expect, it } from 'vitest';
import { generateChaosPrompts } from './generator';

const ORIGINAL_DISABLED = process.env.SEIZN_CHAOS_LLM_DISABLED;

afterEach(() => {
  process.env.SEIZN_CHAOS_LLM_DISABLED = ORIGINAL_DISABLED;
});

describe('generateChaosPrompts', () => {
  it('uses deterministic coverage when LLM generation is disabled', async () => {
    process.env.SEIZN_CHAOS_LLM_DISABLED = 'true';

    const prompts = await generateChaosPrompts({
      npcId: 'kaelan',
      count: 8,
      suite: 'basic',
      canonLocks: [
        {
          id: 'lock-1',
          studioId: 'studio-1',
          npcId: 'kaelan',
          scope: 'never_say',
          statement: 'Kaelan never mentions Gretel by name.',
          regexFastpath: 'Gretel',
          severity: 'hard',
          active: true,
          createdBy: null,
          createdAt: '2026-04-21T00:00:00.000Z',
          updatedAt: '2026-04-21T00:00:00.000Z',
        },
      ],
    });

    expect(prompts).toHaveLength(8);
    expect(new Set(prompts.map((prompt) => prompt.category))).toEqual(
      new Set([
        'jailbreak',
        'logic_trap',
        'canon_probe',
        'emotional_attack',
        'contradiction_loop',
        'dead_end',
      ])
    );
    expect(prompts[2]?.prompt).toContain('Kaelan never mentions Gretel');
  });
});
