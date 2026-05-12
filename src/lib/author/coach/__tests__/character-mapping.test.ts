import { describe, expect, it } from 'vitest';

import {
  CHARACTER_ARC_FIELDS,
  coachArcToDbPatch,
  dbCharacterToCoachArc,
} from '../character-mapping';
import type { CoachCharacterArcAudit } from '../schema';

describe('Coach character-arc mapping', () => {
  it('mapping table covers all six concepts exactly once', () => {
    const concepts = CHARACTER_ARC_FIELDS.map((entry) => entry.concept);
    expect(new Set(concepts).size).toBe(concepts.length);
    expect(concepts).toEqual([
      'name',
      'sacredFlaw',
      'internalNeed',
      'externalWant',
      'arcPhase',
      'arcDirection',
    ]);
  });

  it('coachArcToDbPatch normalizes empty Storr fields to null but keeps name', () => {
    const arc: CoachCharacterArcAudit = {
      characterName: 'Rinka',
      inferredSacredFlaw: '   ',
      inferredInternalNeed: 'belonging',
      inferredExternalWant: '',
      arcPhaseFit: 'midpoint',
      arcDirection: 'positive',
    };
    expect(coachArcToDbPatch(arc)).toEqual({
      name: 'Rinka',
      sacred_flaw: null,
      internal_need: 'belonging',
      external_want: null,
      current_arc_phase: 'midpoint',
      arc_direction: 'positive',
    });
  });

  it('coachArcToDbPatch tolerates null arcDirection', () => {
    const arc: CoachCharacterArcAudit = {
      characterName: 'Rinka',
      inferredSacredFlaw: 'I must always be useful',
      inferredInternalNeed: 'rest',
      inferredExternalWant: 'a promotion',
      arcPhaseFit: 'first turn',
      arcDirection: null,
    };
    expect(coachArcToDbPatch(arc).arc_direction).toBeNull();
  });

  it('dbCharacterToCoachArc round-trips name + arc fields with nulls collapsing to empty strings', () => {
    const row = {
      name: 'Yara',
      sacred_flaw: null,
      internal_need: 'belonging',
      external_want: null,
      current_arc_phase: 'climax',
      arc_direction: 'negative' as const,
    };
    expect(dbCharacterToCoachArc(row)).toEqual({
      characterName: 'Yara',
      inferredSacredFlaw: '',
      inferredInternalNeed: 'belonging',
      inferredExternalWant: '',
      arcPhaseFit: 'climax',
      arcDirection: 'negative',
    });
  });

  it('round-tripping a fully-populated DB row preserves data', () => {
    const row = {
      name: 'Jules',
      sacred_flaw: 'pride',
      internal_need: 'humility',
      external_want: 'victory',
      current_arc_phase: 'crisis',
      arc_direction: 'positive' as const,
    };
    const back = coachArcToDbPatch(dbCharacterToCoachArc(row));
    expect(back).toEqual(row);
  });
});
