// Distilled from PAI WriteStory — Packs/WriteStory/src/Critics.md
// MIT License, Copyright (c) 2025 Daniel Miessler.
// See LICENSE-attribution.md in this directory.

export type CriticPersonaId =
  | 'layer_auditor'
  | 'rhetoric_examiner'
  | 'freshness_inspector'
  | 'reader_surrogate'
  | 'subtext_analyst'
  | 'continuity_editor'
  | 'pacing_surgeon'
  | 'voice_enforcer';

export interface CriticPersona {
  id: CriticPersonaId;
  name: string;
  focus: string;
  personality: string;
  mandatory: boolean;
  passOrder: number;
}

export const CRITIC_PERSONAS: readonly CriticPersona[] = [
  {
    id: 'layer_auditor',
    name: 'Layer Auditor',
    focus: 'Seven-layer completeness and interaction.',
    personality: 'Methodical, structural thinker. Sees the architecture beneath the prose.',
    mandatory: true,
    passOrder: 1,
  },
  {
    id: 'rhetoric_examiner',
    name: 'Rhetoric Examiner',
    focus: 'Rhetorical figure deployment and prose musicality.',
    personality: 'The ear. Hears rhythm, notices patterns, feels cadence.',
    mandatory: true,
    passOrder: 2,
  },
  {
    id: 'freshness_inspector',
    name: 'Freshness Inspector',
    focus: 'Cliche detection, originality, concrete specificity.',
    personality: 'Allergic to the generic. Demands the unexpected.',
    mandatory: true,
    passOrder: 3,
  },
  {
    id: 'reader_surrogate',
    name: 'Reader Surrogate',
    focus: 'Engagement, clarity, emotional impact, information flow.',
    personality: 'The gut. Reads for pleasure and engagement, not craft.',
    mandatory: true,
    passOrder: 4,
  },
  {
    id: 'subtext_analyst',
    name: 'Subtext Analyst',
    focus: 'What is unsaid, implied, and layered beneath the surface.',
    personality: 'Reads between every line. Obsessed with gaps and silence.',
    mandatory: false,
    passOrder: 5,
  },
  {
    id: 'continuity_editor',
    name: 'Continuity Editor',
    focus: 'Internal consistency and Story Bible compliance.',
    personality: 'The memory. Remembers every detail from every chapter.',
    mandatory: false,
    passOrder: 6,
  },
  {
    id: 'pacing_surgeon',
    name: 'Pacing Surgeon',
    focus: 'Rhythm, timing, and proportionality.',
    personality: 'Feels the pulse of the prose. Knows when to speed up and when to let the reader breathe.',
    mandatory: false,
    passOrder: 7,
  },
  {
    id: 'voice_enforcer',
    name: 'Voice Enforcer',
    focus: 'Character voice distinctiveness and narrator consistency.',
    personality: 'The mimic. Can hear every character speak distinctly.',
    mandatory: false,
    passOrder: 8,
  },
];

export const CRITIC_OUTPUT_RULES: readonly string[] = [
  'Suggestions, not rewrites — the author decides whether to apply.',
  'Every suggestion references a specific paragraph, line, or passage.',
  'Two to five suggestions per pass. Prioritize the most impactful.',
  'Confidence rating 1 (failed) to 5 (exceptional).',
  'Do not duplicate prior critics. Build on them.',
  'Preserve the author\'s aesthetic profile.',
];

export function mandatoryCritics(): readonly CriticPersona[] {
  return CRITIC_PERSONAS.filter((critic) => critic.mandatory).sort(
    (a, b) => a.passOrder - b.passOrder,
  );
}

export function optionalCritics(): readonly CriticPersona[] {
  return CRITIC_PERSONAS.filter((critic) => !critic.mandatory).sort(
    (a, b) => a.passOrder - b.passOrder,
  );
}
