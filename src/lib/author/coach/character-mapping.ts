// Single source of truth for the DB <-> Coach LLM character-arc naming bridge.
//
// Three layers historically used three names for the same concept:
//   - Postgres columns on author_characters (snake_case, no prefix)
//   - AuthorUiCharacter row type (snake_case, same as DB)
//   - Coach LLM response shape (camelCase, "inferred" prefix on Storr fields)
//
// Anyone adding or renaming a character-arc field touches this file only.
// Helpers below convert between the two surfaces with full type safety.

import type { CharacterArcDirection } from '@/lib/author/frameworks';

import type { CoachCharacterArcAudit } from './schema';

export interface CharacterArcFieldMapping {
  /** Concept-level identifier, only used for logging / debugging. */
  readonly concept: string;
  /** Snake-case column on author_characters and the same key on AuthorUiCharacter. */
  readonly db: string;
  /** Camel-case field on the Coach LLM JSON response. */
  readonly coach: keyof CoachCharacterArcAudit;
}

export const CHARACTER_ARC_FIELDS: readonly CharacterArcFieldMapping[] = [
  { concept: 'name',           db: 'name',              coach: 'characterName'        },
  { concept: 'sacredFlaw',     db: 'sacred_flaw',       coach: 'inferredSacredFlaw'   },
  { concept: 'internalNeed',   db: 'internal_need',     coach: 'inferredInternalNeed' },
  { concept: 'externalWant',   db: 'external_want',     coach: 'inferredExternalWant' },
  { concept: 'arcPhase',       db: 'current_arc_phase', coach: 'arcPhaseFit'          },
  { concept: 'arcDirection',   db: 'arc_direction',     coach: 'arcDirection'         },
] as const;

/**
 * The subset of DB fields the Coach maps to. Keep this list in sync with
 * the `db` column in {@link CHARACTER_ARC_FIELDS}. Adding a field here that is
 * not in the mapping (or vice versa) will fail to typecheck at the call sites.
 */
export interface DbCharacterArcFields {
  name: string;
  sacred_flaw: string | null;
  internal_need: string | null;
  external_want: string | null;
  current_arc_phase: string;
  arc_direction: CharacterArcDirection | null;
}

/**
 * Convert a Coach LLM character arc audit into a snake_case object that can be
 * fed into an `author_characters` upsert. Empty strings are normalized to null
 * for the Storr fields (DB stores them as nullable) but kept verbatim for the
 * always-present arc phase string column.
 */
export function coachArcToDbPatch(arc: CoachCharacterArcAudit): DbCharacterArcFields {
  const normalize = (value: string | null | undefined): string | null => {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };
  return {
    name: arc.characterName,
    sacred_flaw: normalize(arc.inferredSacredFlaw),
    internal_need: normalize(arc.inferredInternalNeed),
    external_want: normalize(arc.inferredExternalWant),
    current_arc_phase: arc.arcPhaseFit ?? '',
    arc_direction: arc.arcDirection ?? null,
  };
}

/**
 * Convert a stored DB row's character-arc fields into the Coach LLM shape,
 * useful when we eventually want to feed known character context back to the
 * Coach. Null DB fields collapse to empty strings so the LLM never sees null.
 */
export function dbCharacterToCoachArc(row: DbCharacterArcFields): CoachCharacterArcAudit {
  return {
    characterName: row.name,
    inferredSacredFlaw: row.sacred_flaw ?? '',
    inferredInternalNeed: row.internal_need ?? '',
    inferredExternalWant: row.external_want ?? '',
    arcPhaseFit: row.current_arc_phase ?? '',
    arcDirection: row.arc_direction ?? null,
  };
}
