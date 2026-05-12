// Distilled from PAI WriteStory — Packs/WriteStory/src/StorrFramework.md
// MIT License, Copyright (c) 2025 Daniel Miessler.
// Underlying framework: Will Storr, "The Science of Storytelling".
// See LICENSE-attribution.md in this directory.

export type SacredFlawEngineLevel = 'external_want' | 'internal_need' | 'philosophical_purpose';

export interface SacredFlawEngineEntry {
  level: SacredFlawEngineLevel;
  domain: 'plot' | 'character' | 'theme';
  what: string;
  example: string;
}

export const SACRED_FLAW_ENGINE: readonly SacredFlawEngineEntry[] = [
  {
    level: 'external_want',
    domain: 'plot',
    what: 'What the character consciously pursues.',
    example: 'Walter White: provide for his family.',
  },
  {
    level: 'internal_need',
    domain: 'character',
    what: 'What the character actually needs but cannot see.',
    example: 'Walter White: self-worth not tied to other people\'s perception.',
  },
  {
    level: 'philosophical_purpose',
    domain: 'theme',
    what: 'The universal truth the character\'s journey illuminates.',
    example: 'Walter White: pride and the illusion of control.',
  },
];

export type CharacterArcDirection = 'positive' | 'negative' | 'flat';

export interface CharacterArcMap {
  sacredFlaw: string;
  originWound?: string;
  externalWant: string;
  internalNeed: string;
  philosophicalPurpose?: string;
  crisisPoint?: string;
  transformationMoment?: string;
  arcDirection: CharacterArcDirection;
}

export const CHARACTER_ARC_DIRECTIONS: Readonly<Record<CharacterArcDirection, string>> = {
  positive: 'Character recognizes the flaw and transforms.',
  negative: 'Character refuses to transform — the flaw wins. Tragedy.',
  flat: 'Character already knows the truth and changes the world instead.',
};

export const WANT_NEED_INVERSION_EXAMPLES: ReadonlyArray<{ flaw: string; need: string }> = [
  { flaw: 'I am unlovable.', need: 'Authentic connection.' },
  { flaw: 'Control equals safety.', need: 'Surrender and trust.' },
  { flaw: 'Vulnerability is weakness.', need: 'Openness.' },
  { flaw: 'I must prove my worth.', need: 'Intrinsic self-acceptance.' },
];

export const STORR_CHARACTER_PROTOCOL: readonly string[] = [
  'Define the sacred flaw — the fundamental misbelief.',
  'Establish the origin wound that created the flaw.',
  'Set the external want — what they consciously pursue.',
  'Set the internal need — usually the inverse of the flaw.',
  'Define the philosophical purpose — the universal truth at stake.',
  'Map the crisis point — maximum pressure on the flaw.',
  'Choose the arc direction — positive, negative, or flat.',
  'Design status dynamics — where they sit, how it shifts.',
  'Plant mystery hooks — what readers will want to know about them.',
  'Connect to theme — how the flaw embodies the thematic question.',
];

export function summarizeArc(arc: CharacterArcMap): string {
  return [
    `Sacred flaw: ${arc.sacredFlaw}`,
    `Want: ${arc.externalWant}`,
    `Need: ${arc.internalNeed}`,
    `Arc: ${arc.arcDirection} (${CHARACTER_ARC_DIRECTIONS[arc.arcDirection]})`,
  ].join('\n');
}
