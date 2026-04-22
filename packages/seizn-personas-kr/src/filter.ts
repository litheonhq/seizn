import type { KoreanPersona, PersonaFilterCriteria } from './types';

function matchesText(value: string, expected: string | undefined): boolean {
  if (!expected) {
    return true;
  }
  return value === expected || value.includes(expected);
}

function matchesRegion(persona: KoreanPersona, region: string | undefined): boolean {
  if (!region) {
    return true;
  }
  return persona.province === region || persona.district === region || persona.district.includes(region);
}

/**
 * Filters Korean personas without mutating the input array.
 *
 * Determinism contract: matching rows are sorted by uuid ascending before any
 * optional limit is applied. Identical inputs and criteria therefore produce
 * identical output ordering for repeatable persona seeding.
 */
export function filterPersonas(
  personas: readonly KoreanPersona[],
  criteria: PersonaFilterCriteria = {},
): KoreanPersona[] {
  const filtered = personas.filter((persona) => {
    if (!matchesText(persona.province, criteria.province)) {
      return false;
    }
    if (!matchesText(persona.district, criteria.district)) {
      return false;
    }
    if (!matchesRegion(persona, criteria.region)) {
      return false;
    }
    if (!matchesText(persona.occupation, criteria.occupation)) {
      return false;
    }
    if (criteria.ageRange && (persona.age < criteria.ageRange[0] || persona.age > criteria.ageRange[1])) {
      return false;
    }
    if (criteria.sex && persona.sex !== criteria.sex) {
      return false;
    }
    if (!matchesText(persona.education_level, criteria.educationLevel)) {
      return false;
    }
    return true;
  });

  const sorted = filtered.sort((left, right) => left.uuid.localeCompare(right.uuid));
  return typeof criteria.limit === 'number' ? sorted.slice(0, Math.max(0, criteria.limit)) : sorted;
}
