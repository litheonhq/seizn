// Distilled from PAI WriteStory — Packs/WriteStory/src/PressfieldFramework.md
// MIT License, Copyright (c) 2025 Daniel Miessler.
// Underlying framework: Steven Pressfield, "Nobody Wants to Read Your Sh*t".
// See LICENSE-attribution.md in this directory.

export type PressfieldAnchorId =
  | 'concept'
  | 'hook'
  | 'theme_question'
  | 'clothesline'
  | 'villain'
  | 'all_is_lost'
  | 'gift';

export interface PressfieldAnchor {
  id: PressfieldAnchorId;
  name: string;
  definition: string;
  diagnostic: string;
}

export const PRESSFIELD_ANCHORS: readonly PressfieldAnchor[] = [
  {
    id: 'concept',
    name: 'Concept',
    definition:
      'The unifying idea behind the plot. Answers "what is this story really about?" in one sentence.',
    diagnostic:
      'If you can swap the protagonist into a different plot and the story still works, the concept is strong.',
  },
  {
    id: 'hook',
    name: 'Hook',
    definition:
      'The opening gambit that forces the audience to pay attention. Promises something the audience wants and connects to the concept.',
    diagnostic:
      'Read the opening alone — does it create an information gap the audience must close?',
  },
  {
    id: 'theme_question',
    name: 'Theme as Question',
    definition:
      'The inquiry the narrative investigates, expressible as a yes/no or either/or question. The plot is the author\'s argument; the climax is the answer.',
    diagnostic:
      'State the theme as a question. If you cannot phrase it that way, the theme has not yet crystallized.',
  },
  {
    id: 'clothesline',
    name: 'Clothesline',
    definition:
      'The concept stretched between the opening and the ending. Every scene hangs on it.',
    diagnostic:
      'For each scene, ask "if I remove this, does the clothesline sag?" If no, the scene is decorative, not structural.',
  },
  {
    id: 'villain',
    name: 'Villain',
    definition:
      'The opposition that embodies the counter-argument to the theme. The mirror of the hero — what the hero could become or already is.',
    diagnostic:
      'Is the villain as competent as the hero, self-justified, and a direct challenge to the sacred flaw?',
  },
  {
    id: 'all_is_lost',
    name: 'All Is Lost',
    definition:
      'The nadir where every flaw-based strategy has failed and the old model of the world is shattered. Structurally necessary for transformation.',
    diagnostic:
      'List the hero\'s flaw-driven strategies. Have they all failed by this point?',
  },
  {
    id: 'gift',
    name: 'Gift',
    definition:
      'The wisdom earned through transformation — embodied understanding, not information. The visible proof that change occurred.',
    diagnostic:
      'At the end, what does the hero know now that they didn\'t at the beginning? If the answer is a way of being, the gift is real.',
  },
];

export function getPressfieldAnchor(id: PressfieldAnchorId): PressfieldAnchor {
  const anchor = PRESSFIELD_ANCHORS.find((entry) => entry.id === id);
  if (!anchor) {
    throw new Error(`Unknown Pressfield anchor: ${id}`);
  }
  return anchor;
}
