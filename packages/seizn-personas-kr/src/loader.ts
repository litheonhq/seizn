import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { KoreanPersona, KoreanPersonaSex } from './types';

const REQUIRED_STRING_FIELDS = [
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
  'hobbies_and_interests',
  'career_goals_and_ambitions',
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
] as const;

const LIST_FIELDS = [
  'skills_and_expertise_list',
  'hobbies_and_interests_list',
] as const;

let sampleCache: KoreanPersona[] | undefined;

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value !== 'string') {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  const quotedItems = [...trimmed.matchAll(/'([^']+)'/g)].map((match) => match[1].trim());
  if (quotedItems.length > 0) {
    return quotedItems;
  }

  return trimmed
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function readString(record: Record<string, unknown>, field: (typeof REQUIRED_STRING_FIELDS)[number]): string {
  const value = record[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid Korean persona fixture row: missing string field ${field}`);
  }
  return value;
}

function readSex(value: unknown): KoreanPersonaSex {
  if (value !== '남자' && value !== '여자') {
    throw new Error('Invalid Korean persona fixture row: sex must be 남자 or 여자');
  }
  return value;
}

function normalizePersona(record: unknown): KoreanPersona {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('Invalid Korean persona fixture row: expected object');
  }

  const row = record as Record<string, unknown>;
  const age = row.age;
  if (typeof age !== 'number' || !Number.isFinite(age)) {
    throw new Error('Invalid Korean persona fixture row: age must be a number');
  }

  for (const field of LIST_FIELDS) {
    if (parseList(row[field]).length === 0) {
      throw new Error(`Invalid Korean persona fixture row: missing list field ${field}`);
    }
  }

  return {
    uuid: readString(row, 'uuid'),
    professional_persona: readString(row, 'professional_persona'),
    sports_persona: readString(row, 'sports_persona'),
    arts_persona: readString(row, 'arts_persona'),
    travel_persona: readString(row, 'travel_persona'),
    culinary_persona: readString(row, 'culinary_persona'),
    family_persona: readString(row, 'family_persona'),
    persona: readString(row, 'persona'),
    cultural_background: readString(row, 'cultural_background'),
    skills_and_expertise: readString(row, 'skills_and_expertise'),
    skills_and_expertise_list: parseList(row.skills_and_expertise_list),
    hobbies_and_interests: readString(row, 'hobbies_and_interests'),
    hobbies_and_interests_list: parseList(row.hobbies_and_interests_list),
    career_goals_and_ambitions: readString(row, 'career_goals_and_ambitions'),
    sex: readSex(row.sex),
    age,
    marital_status: readString(row, 'marital_status'),
    military_status: readString(row, 'military_status'),
    family_type: readString(row, 'family_type'),
    housing_type: readString(row, 'housing_type'),
    education_level: readString(row, 'education_level'),
    bachelors_field: readString(row, 'bachelors_field'),
    occupation: readString(row, 'occupation'),
    district: readString(row, 'district'),
    province: readString(row, 'province'),
    country: readString(row, 'country'),
  };
}

function clonePersona(persona: KoreanPersona): KoreanPersona {
  return {
    ...persona,
    skills_and_expertise_list: [...persona.skills_and_expertise_list],
    hobbies_and_interests_list: [...persona.hobbies_and_interests_list],
  };
}

function loadFixture(): KoreanPersona[] {
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const fixturePath = join(packageRoot, 'data', 'sample-1k.json');
  const raw = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error('Invalid Korean persona fixture: expected an array');
  }
  return raw.map(normalizePersona);
}

export function loadSamplePersonas(): KoreanPersona[] {
  sampleCache ??= loadFixture();
  return sampleCache.map(clonePersona);
}
