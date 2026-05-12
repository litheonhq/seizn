// JSON Schema + TypeScript types for the Author Coach analyze endpoint.
// One batched LLM call returns all four framework sections in this shape.

import type { AuthorJsonSchema } from '@/lib/author/llm/types';
import {
  CRITIC_PERSONA_IDS,
  STORY_LAYER_IDS,
  type AntiClicheFinding,
  type CharacterArcDirection,
  type CriticPersonaId,
  type StoryLayerId,
} from '@/lib/author/frameworks';

export interface CoachStoryLayerPresence {
  layer: StoryLayerId;
  present: boolean;
  evidence: string;
}

export interface CoachCharacterArcAudit {
  characterName: string;
  inferredSacredFlaw: string;
  inferredInternalNeed: string;
  inferredExternalWant: string;
  arcPhaseFit: string;
  arcDirection: CharacterArcDirection | null;
}

export interface CoachCriticNote {
  critic: CriticPersonaId;
  rating: 1 | 2 | 3 | 4 | 5;
  suggestions: string[];
}

export interface CoachAnalysis {
  hash: string;
  storyLayers: CoachStoryLayerPresence[];
  characterArcs: CoachCharacterArcAudit[];
  criticNotes: CoachCriticNote[];
  antiCliche: AntiClicheFinding[];
  latencyMs: number;
  cached: boolean;
}

// JSON schema for the LLM response (anti-cliche is computed locally so it's
// excluded from the LLM contract).
export const COACH_LLM_SCHEMA: AuthorJsonSchema = {
  type: 'object',
  required: ['storyLayers', 'characterArcs', 'criticNotes'],
  properties: {
    storyLayers: {
      type: 'array',
      items: {
        type: 'object',
        required: ['layer', 'present', 'evidence'],
        properties: {
          layer: { type: 'string', enum: [...STORY_LAYER_IDS] },
          present: { type: 'boolean' },
          evidence: { type: 'string' },
        },
      },
    },
    characterArcs: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'characterName',
          'inferredSacredFlaw',
          'inferredInternalNeed',
          'inferredExternalWant',
          'arcPhaseFit',
        ],
        properties: {
          characterName: { type: 'string' },
          inferredSacredFlaw: { type: 'string' },
          inferredInternalNeed: { type: 'string' },
          inferredExternalWant: { type: 'string' },
          arcPhaseFit: { type: 'string' },
          arcDirection: {
            type: 'string',
            enum: ['positive', 'negative', 'flat'],
          },
        },
      },
    },
    criticNotes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['critic', 'rating', 'suggestions'],
        properties: {
          critic: {
            type: 'string',
            // Derived from CRITIC_PERSONAS in frameworks/critics.ts so adding
            // a critic in one place propagates here automatically.
            enum: [...CRITIC_PERSONA_IDS],
          },
          rating: { type: 'integer' },
          suggestions: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  },
};

export interface CoachLlmResponse {
  storyLayers: CoachStoryLayerPresence[];
  characterArcs: CoachCharacterArcAudit[];
  criticNotes: CoachCriticNote[];
}
