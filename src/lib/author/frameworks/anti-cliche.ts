// Distilled from PAI WriteStory — Packs/WriteStory/src/AntiCliche.md
// MIT License, Copyright (c) 2025 Daniel Miessler.
// See LICENSE-attribution.md in this directory.
//
// Implementation note: this module deliberately avoids `new RegExp(<variable>)`.
// All patterns are literal lowercase substrings; the scanner lower-cases input
// once and uses indexOf. Variants (pronouns, optional punctuation) are expanded
// into explicit entries to keep the surface deterministic and ReDoS-free.

export type AntiClicheCategory =
  | 'opening'
  | 'emotional'
  | 'description'
  | 'action'
  | 'dialogue'
  | 'ai_specific';

export interface BannedPhraseEntry {
  /** Lowercase literal phrase. The scanner matches against `text.toLowerCase()`. */
  phrase: string;
  category: AntiClicheCategory;
  reason: string;
  freshAlternative: string;
}

export const BANNED_PHRASES: readonly BannedPhraseEntry[] = [
  // Opening cliches
  {
    phrase: 'in a world where',
    category: 'opening',
    reason: 'Movie trailer voice-over.',
    freshAlternative: 'Start with a specific character action.',
  },
  {
    phrase: 'it was a dark and stormy night',
    category: 'opening',
    reason: 'The most famous bad opening in English fiction.',
    freshAlternative: 'Start with something the character notices.',
  },
  {
    phrase: 'little did they know',
    category: 'opening',
    reason: 'Tells instead of shows; breaks POV.',
    freshAlternative: 'Show what they don\'t know through dramatic irony.',
  },
  {
    phrase: 'once upon a time',
    category: 'opening',
    reason: 'Only works in fairy tales.',
    freshAlternative: 'Start in media res or with an unexpected detail.',
  },
  // Emotional cliches
  {
    phrase: 'a chill ran down',
    category: 'emotional',
    reason: 'Dead metaphor.',
    freshAlternative: 'Show the specific physical reaction (jaw tightened, hands stilled).',
  },
  {
    phrase: 'heart skipped a beat',
    category: 'emotional',
    reason: 'Overused physiological shorthand.',
    freshAlternative: 'Show what they actually did in response.',
  },
  {
    phrase: 'tears streamed down',
    category: 'emotional',
    reason: 'Default sadness indicator.',
    freshAlternative: 'Show the fight against crying, or an unexpected emotional response.',
  },
  {
    phrase: 'wave of emotion washed over',
    category: 'emotional',
    reason: 'Vague, passive.',
    freshAlternative: 'Name the specific emotion through action.',
  },
  {
    phrase: 'blood ran cold',
    category: 'emotional',
    reason: 'Dead metaphor.',
    freshAlternative: 'Show the specific fear response.',
  },
  // Pronoun variants for "butterflies in [pronoun] stomach"
  {
    phrase: 'butterflies in their stomach',
    category: 'emotional',
    reason: 'Overused.',
    freshAlternative: 'Show the specific nervous behavior.',
  },
  {
    phrase: 'butterflies in his stomach',
    category: 'emotional',
    reason: 'Overused.',
    freshAlternative: 'Show the specific nervous behavior.',
  },
  {
    phrase: 'butterflies in her stomach',
    category: 'emotional',
    reason: 'Overused.',
    freshAlternative: 'Show the specific nervous behavior.',
  },
  {
    phrase: 'butterflies in my stomach',
    category: 'emotional',
    reason: 'Overused.',
    freshAlternative: 'Show the specific nervous behavior.',
  },
  {
    phrase: 'time stood still',
    category: 'emotional',
    reason: 'Physics does not work that way.',
    freshAlternative: 'Show hyperfocus on a specific detail.',
  },
  {
    phrase: 'world came crashing down',
    category: 'emotional',
    reason: 'Melodramatic.',
    freshAlternative: 'Show the specific realization and its first consequence.',
  },
  // Description cliches
  {
    phrase: 'piercing blue eyes',
    category: 'description',
    reason: 'Every fantasy character ever.',
    freshAlternative: 'One specific detail about the eyes that reveals character.',
  },
  // Hyphen/space variants
  {
    phrase: 'raven-black hair',
    category: 'description',
    reason: 'Lazy beauty shorthand.',
    freshAlternative: 'What the hair does — falls, catches light, moves.',
  },
  {
    phrase: 'raven black hair',
    category: 'description',
    reason: 'Lazy beauty shorthand.',
    freshAlternative: 'What the hair does — falls, catches light, moves.',
  },
  {
    phrase: 'chiseled features',
    category: 'description',
    reason: 'Romance novel default.',
    freshAlternative: 'One specific asymmetry or distinguishing mark.',
  },
  {
    phrase: 'sun beat down mercilessly',
    category: 'description',
    reason: 'Weather cliche.',
    freshAlternative: 'What the heat does to the specific environment.',
  },
  {
    phrase: 'eerie silence',
    category: 'description',
    reason: 'Horror default.',
    freshAlternative: 'Which specific sounds are absent and what remains.',
  },
  {
    phrase: 'plunged into darkness',
    category: 'description',
    reason: 'Passive, generic.',
    freshAlternative: 'What the character can still sense — sound, smell, touch.',
  },
  // Action cliches
  {
    phrase: 'all hell broke loose',
    category: 'action',
    reason: 'Vague chaos indicator.',
    freshAlternative: 'Show the specific first thing that went wrong.',
  },
  // "Fought for [pronoun] life/lives" — pronoun + singular/plural variants
  {
    phrase: 'fought for their life',
    category: 'action',
    reason: 'Generic action.',
    freshAlternative: 'Show the specific technique, mistake, or desperation.',
  },
  {
    phrase: 'fought for their lives',
    category: 'action',
    reason: 'Generic action.',
    freshAlternative: 'Show the specific technique, mistake, or desperation.',
  },
  {
    phrase: 'fought for his life',
    category: 'action',
    reason: 'Generic action.',
    freshAlternative: 'Show the specific technique, mistake, or desperation.',
  },
  {
    phrase: 'fought for her life',
    category: 'action',
    reason: 'Generic action.',
    freshAlternative: 'Show the specific technique, mistake, or desperation.',
  },
  {
    phrase: 'fought for my life',
    category: 'action',
    reason: 'Generic action.',
    freshAlternative: 'Show the specific technique, mistake, or desperation.',
  },
  {
    phrase: 'with lightning speed',
    category: 'action',
    reason: 'Lazy shorthand.',
    freshAlternative: 'Show the action\'s beginning and end with nothing in between.',
  },
  {
    phrase: 'against all odds',
    category: 'action',
    reason: 'Tells the reader what to feel.',
    freshAlternative: 'Show the specific disadvantage.',
  },
  {
    phrase: 'in the nick of time',
    category: 'action',
    reason: 'Removes tension retroactively.',
    freshAlternative: 'Show the consequences of being almost too late.',
  },
  // Dialogue cliches
  {
    phrase: 'we need to talk',
    category: 'dialogue',
    reason: 'TV drama shorthand.',
    freshAlternative: 'Have the character say the first real thing.',
  },
  // Apostrophe variants
  {
    phrase: "you don't understand",
    category: 'dialogue',
    reason: 'Empty conflict.',
    freshAlternative: 'Show the specific misunderstanding.',
  },
  {
    phrase: 'you dont understand',
    category: 'dialogue',
    reason: 'Empty conflict.',
    freshAlternative: 'Show the specific misunderstanding.',
  },
  {
    phrase: "it's not what it looks like",
    category: 'dialogue',
    reason: 'Sitcom trope.',
    freshAlternative: 'Have the character explain what it actually is.',
  },
  {
    phrase: 'its not what it looks like',
    category: 'dialogue',
    reason: 'Sitcom trope.',
    freshAlternative: 'Have the character explain what it actually is.',
  },
  {
    phrase: 'i have a bad feeling about this',
    category: 'dialogue',
    reason: 'Movie homage is not dialogue.',
    freshAlternative: 'Show the specific observation causing worry.',
  },
  // AI-specific cliches (highest priority)
  {
    phrase: 'a tapestry of',
    category: 'ai_specific',
    reason: "AI's favorite metaphor.",
    freshAlternative: 'Name the specific pattern.',
  },
  {
    phrase: 'the weight of',
    category: 'ai_specific',
    reason: 'AI default for emotional burden.',
    freshAlternative: 'Show the specific physical manifestation.',
  },
  {
    phrase: 'navigate the complexities',
    category: 'ai_specific',
    reason: 'Corporate AI speak.',
    freshAlternative: 'Show the specific difficult choice.',
  },
  {
    phrase: 'harbinger of',
    category: 'ai_specific',
    reason: 'Archaic AI reach.',
    freshAlternative: 'Name the thing directly.',
  },
  {
    phrase: 'cacophony of',
    category: 'ai_specific',
    reason: 'AI overuses this word.',
    freshAlternative: 'Name the specific sounds.',
  },
  {
    phrase: 'a symphony of',
    category: 'ai_specific',
    reason: "AI's go-to for describing multiple things.",
    freshAlternative: 'List two or three specific things.',
  },
  {
    phrase: 'the dance of',
    category: 'ai_specific',
    reason: 'AI metaphor for any interaction.',
    freshAlternative: 'Describe the interaction directly.',
  },
  {
    phrase: 'whispered promises of',
    category: 'ai_specific',
    reason: 'AI poetic filler.',
    freshAlternative: 'What was actually said or implied.',
  },
  {
    phrase: 'echoes of',
    category: 'ai_specific',
    reason: 'Overused in AI prose.',
    freshAlternative: 'Name the specific memory or reference.',
  },
  {
    phrase: 'the fabric of reality',
    category: 'ai_specific',
    reason: 'Sci-fi AI cliche.',
    freshAlternative: "Show what's actually happening.",
  },
  {
    phrase: 'and so it was that',
    category: 'ai_specific',
    reason: 'Fairy tale AI voice.',
    freshAlternative: 'Start with action or observation.',
  },
];

export interface AntiClicheFinding {
  match: string;
  category: AntiClicheCategory;
  reason: string;
  freshAlternative: string;
  index: number;
}

/**
 * Scan text for known cliches. Pure function — no side effects, no IO,
 * no dynamic regex. Lower-cases the input once and uses literal substring
 * search per banned phrase. Returns one finding per match, sorted by position.
 */
export function auditText(text: string): AntiClicheFinding[] {
  if (!text) return [];
  const haystack = text.toLowerCase();
  const findings: AntiClicheFinding[] = [];
  for (const entry of BANNED_PHRASES) {
    let from = 0;
    while (from <= haystack.length) {
      const idx = haystack.indexOf(entry.phrase, from);
      if (idx === -1) break;
      findings.push({
        match: text.slice(idx, idx + entry.phrase.length),
        category: entry.category,
        reason: entry.reason,
        freshAlternative: entry.freshAlternative,
        index: idx,
      });
      from = idx + entry.phrase.length;
    }
  }
  return findings.sort((a, b) => a.index - b.index);
}

export const FRESHNESS_RULES: readonly string[] = [
  'Specificity: replace anything that could describe any character with something only this character would notice.',
  'Sensory replacement: replace emotional abstractions with physical specifics.',
  'Action over telling: emotions are revealed through what characters do.',
  'Comparison kill: replace similes used more than 100 times in published fiction.',
  'Verb test: strong verbs beat adjective + weak verb.',
  'Dialogue voice: every character\'s dialogue should be identifiable without attribution.',
];
