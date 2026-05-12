// Distilled from PAI WriteStory — Packs/WriteStory/src/StoryLayers.md
// MIT License, Copyright (c) 2025 Daniel Miessler.
// See LICENSE-attribution.md in this directory.

export type StoryLayerId =
  | 'meaning'
  | 'character_change'
  | 'plot'
  | 'mystery'
  | 'world'
  | 'relationships'
  | 'prose';

export interface StoryLayer {
  id: StoryLayerId;
  name: string;
  description: string;
  milestones: string[];
  storrLink?: string;
}

export const STORY_LAYERS: readonly StoryLayer[] = [
  {
    id: 'meaning',
    name: 'Meaning',
    description:
      'The philosophical argument the story makes about human nature, society, morality, or existence. Emerges from the collision between character flaw and plot pressure rather than being stated explicitly.',
    milestones: [
      'Thematic question introduced implicitly through character behavior',
      'Counter-arguments embodied by antagonist and secondary characters',
      'Moments where the theme crystallizes through action',
      'Final statement delivered by resolution, not exposition',
    ],
    storrLink: 'The sacred flaw is the theme inverted.',
  },
  {
    id: 'character_change',
    name: 'Character Change',
    description:
      'The core engine of narrative. Characters begin with a sacred flaw — a fundamental misbelief about themselves or the world — and are forced by events to confront and potentially transform it.',
    milestones: [
      'Sacred flaw established through behavior',
      'Origin wound revealed (often gradually)',
      'Want/Need misalignment moments accumulate',
      'Pressure escalates until the flaw is untenable',
      'Crisis point: transform or break',
      'Transformation moment or tragic refusal',
      'New equilibrium in a changed world',
    ],
    storrLink: 'Storr Sacred Flaw Engine: External Want × Internal Need × Philosophical Purpose.',
  },
  {
    id: 'plot',
    name: 'Plot',
    description:
      'The causal chain of events. Not a sequence of things that happen, but a chain where each event causes the next.',
    milestones: [
      'Inciting incident',
      'Progressive complications',
      'Crisis decision',
      'Climactic action',
      'Resolution that reframes the opening state',
    ],
  },
  {
    id: 'mystery',
    name: 'Mystery',
    description:
      'Systematic control of what the reader knows, suspects, and wonders about. The engine of reader engagement across all genres — not only mystery novels.',
    milestones: [
      'Primary mystery introduced',
      'Secondary mysteries seeded between major beats',
      'Clue plants and red herrings',
      'Partial reveals that redirect hypotheses',
      'Full reveal handed off into the next mystery',
    ],
    storrLink: 'Theory of mind: the brain cannot resist filling information gaps.',
  },
  {
    id: 'world',
    name: 'World',
    description:
      'The physical, social, and systemic environment. Not decoration — the world should create pressure on characters and reflect or challenge themes.',
    milestones: [
      'Establishment that orients without infodumping',
      'Progressive world revelation as the story needs it',
      'World-as-pressure on character choices',
      'World-change moments where character action alters the setting',
    ],
  },
  {
    id: 'relationships',
    name: 'Relationships',
    description:
      'How key bonds evolve, create pressure, and illuminate character. Each major relationship is a miniature story with its own arc.',
    milestones: [
      'Initial dynamic established',
      'Tension points expose competing worldviews',
      'Deepening moments through shared vulnerability',
      'Relationship crisis — will it survive?',
      'New equilibrium: closer, broken, or transformed',
    ],
    storrLink: 'The influence character challenges the protagonist\'s sacred flaw.',
  },
  {
    id: 'prose',
    name: 'Prose',
    description:
      'How the story is told at the sentence level. Voice, rhetorical figures, aesthetic profile, and anti-cliche discipline.',
    milestones: [
      'Voice consistency per character and narrator',
      'Strategic deployment of rhetorical figures at impact moments',
      'Sentence rhythm varies deliberately for pacing',
      'Anti-cliche pass before any prose is shipped',
    ],
  },
];

export const STORY_LAYER_INTERACTION_RULES: readonly string[] = [
  'Every scene advances at least two layers.',
  'Character change is primary — the other layers exist to pressure the sacred flaw.',
  'Mystery sustains engagement when plot slows.',
  'Theme emerges through action, never exposition.',
  'World serves story — every detail should eventually matter for character or plot.',
  'Relationships create the emotional stakes that make plot events matter.',
  'Prose matches the moment — simple for action, rich for emotional peaks.',
];

export function getStoryLayer(id: StoryLayerId): StoryLayer {
  const layer = STORY_LAYERS.find((entry) => entry.id === id);
  if (!layer) {
    throw new Error(`Unknown story layer: ${id}`);
  }
  return layer;
}
