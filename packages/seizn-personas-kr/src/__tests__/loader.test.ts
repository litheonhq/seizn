/* @vitest-environment node */

import { describe, expect, it } from 'vitest';

import { filterPersonas, loadSamplePersonas } from '../index';
import type { KoreanPersona } from '../types';

const REQUIRED_FIELDS: Array<keyof KoreanPersona> = [
  'uuid',
  'professional_persona',
  'sports_persona',
  'arts_persona',
  'travel_persona',
  'culinary_persona',
  'family_persona',
  'persona',
  'cultural_background',
  'skills_and_expertise',
  'skills_and_expertise_list',
  'hobbies_and_interests',
  'hobbies_and_interests_list',
  'career_goals_and_ambitions',
  'sex',
  'age',
  'marital_status',
  'military_status',
  'family_type',
  'housing_type',
  'education_level',
  'bachelors_field',
  'occupation',
  'district',
  'province',
  'country',
];

describe('@seizn/personas-kr sample loader', () => {
  it('loads exactly 1000 normalized personas with the required 26 fields', () => {
    const personas = loadSamplePersonas();

    expect(personas).toHaveLength(1000);
    expect.assertions(1 + REQUIRED_FIELDS.length + 3);

    for (const field of REQUIRED_FIELDS) {
      expect(personas[0]).toHaveProperty(field);
    }
    expect(Array.isArray(personas[0].skills_and_expertise_list)).toBe(true);
    expect(Array.isArray(personas[0].hobbies_and_interests_list)).toBe(true);
    expect(personas[0].uuid).toMatch(/^[a-f0-9]{32}$/);
  });

  it('filters by province, occupation, impossible criteria, and stable uuid ordering', () => {
    const personas = loadSamplePersonas();

    const seoul = filterPersonas(personas, { province: '서울' });
    const nurses = filterPersonas(personas, { occupation: '간호' });
    const impossible = filterPersonas(personas, { province: '달 기지', occupation: '시간 여행자' });
    const limited = filterPersonas(personas, { province: '서울', limit: 3 });

    expect(seoul.length).toBeGreaterThan(0);
    expect(seoul.every((persona) => persona.province === '서울')).toBe(true);
    expect(nurses.length).toBeGreaterThan(0);
    expect(nurses.every((persona) => persona.occupation.includes('간호'))).toBe(true);
    expect(impossible).toEqual([]);
    expect(limited).toHaveLength(3);
    expect(limited.map((persona) => persona.uuid)).toEqual(
      [...limited].map((persona) => persona.uuid).sort((left, right) => left.localeCompare(right)),
    );
  });

  it('does not mutate the input array while filtering', () => {
    const personas = loadSamplePersonas();
    const originalOrder = personas.map((persona) => persona.uuid);

    filterPersonas(personas, { region: '서울', limit: 10 });

    expect(personas.map((persona) => persona.uuid)).toEqual(originalOrder);
  });
});
