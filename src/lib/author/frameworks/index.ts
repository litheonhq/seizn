// Author writing frameworks distilled from PAI WriteStory (MIT, Daniel Miessler).
// See LICENSE-attribution.md.

export {
  STORY_LAYERS,
  STORY_LAYER_IDS,
  STORY_LAYER_INTERACTION_RULES,
  getStoryLayer,
  type StoryLayer,
  type StoryLayerId,
} from './story-layers';

export {
  SACRED_FLAW_ENGINE,
  CHARACTER_ARC_DIRECTIONS,
  WANT_NEED_INVERSION_EXAMPLES,
  STORR_CHARACTER_PROTOCOL,
  summarizeArc,
  type CharacterArcDirection,
  type CharacterArcMap,
  type SacredFlawEngineEntry,
  type SacredFlawEngineLevel,
} from './storr-arc';

export {
  PRESSFIELD_ANCHORS,
  getPressfieldAnchor,
  type PressfieldAnchor,
  type PressfieldAnchorId,
} from './pressfield-anchors';

export {
  BANNED_PHRASES,
  FRESHNESS_RULES,
  auditText,
  type AntiClicheCategory,
  type AntiClicheFinding,
  type BannedPhraseEntry,
} from './anti-cliche';

export {
  CRITIC_PERSONAS,
  CRITIC_OUTPUT_RULES,
  mandatoryCritics,
  optionalCritics,
  type CriticPersona,
  type CriticPersonaId,
} from './critics';
