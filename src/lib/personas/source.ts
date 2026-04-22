import { createHash } from 'node:crypto';

import { filterPersonas, loadSamplePersonas } from '@seizn/personas-kr';
import type { KoreanPersona, PersonaFilterCriteria } from '@seizn/personas-kr';

export type PersonaSource = 'bundled' | 'live';
export type PersonaPlan = 'free' | 'indie' | 'studio' | 'pro' | 'enterprise' | 'starter' | 'plus' | string;

export type LoadPersonasOptions = {
  plan: PersonaPlan;
  criteria?: PersonaFilterCriteria;
  count: number;
};

const DATASET_ID = 'nvidia/Nemotron-Personas-Korea';
const HF_ROWS_URL = 'https://datasets-server.huggingface.co/rows';
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;

type CacheEntry = {
  expiresAt: number;
  personas: KoreanPersona[];
};

const personaCache = new Map<string, CacheEntry>();

export function getPersonaSource(plan: PersonaPlan): PersonaSource {
  if (plan === 'studio' || plan === 'plus' || plan === 'pro' || plan === 'enterprise') {
    return 'live';
  }
  return 'bundled';
}

/**
 * Loads personas from the bundled 1K sample or Hugging Face Dataset Viewer.
 *
 * Results are sorted by uuid before slicing so repeated calls with the same
 * criteria and count produce deterministic seeds. A process-local LRU cache
 * with a 1 hour TTL and 100-entry cap avoids repeated calls to the HF Dataset
 * Viewer, which is rate-limited per IP.
 */
export async function loadPersonas(opts: LoadPersonasOptions): Promise<KoreanPersona[]> {
  const requestedSource = getPersonaSource(opts.plan);
  const source = requestedSource === 'live' && !process.env.HUGGINGFACE_TOKEN ? 'bundled' : requestedSource;

  if (requestedSource === 'live' && source === 'bundled') {
    console.warn('HUGGINGFACE_TOKEN missing; falling back to bundled Nemotron-Personas-Korea 1K sample.');
  }

  const key = cacheKey({ source, criteria: opts.criteria ?? {}, count: opts.count });
  const cached = getCached(key);
  if (cached) {
    return clonePersonas(cached);
  }

  const sourceRows = source === 'live'
    ? await fetchLivePersonas(Math.max(opts.count, 100))
    : loadSamplePersonas();

  const personas = filterPersonas(sourceRows, opts.criteria ?? {})
    .sort((left, right) => left.uuid.localeCompare(right.uuid))
    .slice(0, Math.max(0, opts.count));

  setCached(key, personas);
  return clonePersonas(personas);
}

async function fetchLivePersonas(length: number): Promise<KoreanPersona[]> {
  const url = new URL(HF_ROWS_URL);
  url.searchParams.set('dataset', DATASET_ID);
  url.searchParams.set('config', 'default');
  url.searchParams.set('split', 'train');
  url.searchParams.set('offset', '0');
  url.searchParams.set('length', String(length));

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.HUGGINGFACE_TOKEN}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HuggingFace Dataset Viewer request failed: ${response.status}`);
  }

  const payload = await response.json() as { rows?: Array<{ row?: unknown }> };
  return (payload.rows ?? [])
    .map((entry) => entry.row)
    .map(normalizeKoreanPersona)
    .filter((persona): persona is KoreanPersona => persona !== null);
}

function normalizeKoreanPersona(value: unknown): KoreanPersona | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const row = value as Partial<Record<keyof KoreanPersona, unknown>>;
  if (
    typeof row.uuid !== 'string'
    || typeof row.persona !== 'string'
    || typeof row.professional_persona !== 'string'
    || typeof row.sports_persona !== 'string'
    || typeof row.arts_persona !== 'string'
    || typeof row.travel_persona !== 'string'
    || typeof row.culinary_persona !== 'string'
    || typeof row.family_persona !== 'string'
    || typeof row.cultural_background !== 'string'
    || typeof row.skills_and_expertise !== 'string'
    || typeof row.hobbies_and_interests !== 'string'
    || typeof row.career_goals_and_ambitions !== 'string'
    || typeof row.occupation !== 'string'
    || typeof row.province !== 'string'
    || typeof row.district !== 'string'
    || typeof row.country !== 'string'
    || typeof row.marital_status !== 'string'
    || typeof row.military_status !== 'string'
    || typeof row.family_type !== 'string'
    || typeof row.housing_type !== 'string'
    || typeof row.education_level !== 'string'
    || typeof row.bachelors_field !== 'string'
    || typeof row.age !== 'number'
    || (row.sex !== '남자' && row.sex !== '여자')
  ) {
    return null;
  }

  return {
    uuid: row.uuid,
    professional_persona: row.professional_persona,
    sports_persona: row.sports_persona,
    arts_persona: row.arts_persona,
    travel_persona: row.travel_persona,
    culinary_persona: row.culinary_persona,
    family_persona: row.family_persona,
    persona: row.persona,
    cultural_background: row.cultural_background,
    skills_and_expertise: row.skills_and_expertise,
    skills_and_expertise_list: parseList(row.skills_and_expertise_list),
    hobbies_and_interests: row.hobbies_and_interests,
    hobbies_and_interests_list: parseList(row.hobbies_and_interests_list),
    career_goals_and_ambitions: row.career_goals_and_ambitions,
    sex: row.sex,
    age: row.age,
    marital_status: row.marital_status,
    military_status: row.military_status,
    family_type: row.family_type,
    housing_type: row.housing_type,
    education_level: row.education_level,
    bachelors_field: row.bachelors_field,
    occupation: row.occupation,
    district: row.district,
    province: row.province,
    country: row.country,
  };
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value !== 'string') {
    return [];
  }
  const quotedItems = [...value.matchAll(/'([^']+)'/g)].map((match) => match[1].trim());
  if (quotedItems.length > 0) {
    return quotedItems;
  }
  return value
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function getCached(key: string): KoreanPersona[] | null {
  const cached = personaCache.get(key);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt <= Date.now()) {
    personaCache.delete(key);
    return null;
  }
  personaCache.delete(key);
  personaCache.set(key, cached);
  return cached.personas;
}

function setCached(key: string, personas: KoreanPersona[]): void {
  if (personaCache.has(key)) {
    personaCache.delete(key);
  }
  personaCache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    personas: clonePersonas(personas),
  });

  while (personaCache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = personaCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    personaCache.delete(oldestKey);
  }
}

function cacheKey(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function clonePersonas(personas: readonly KoreanPersona[]): KoreanPersona[] {
  return personas.map((persona) => ({
    ...persona,
    skills_and_expertise_list: [...persona.skills_and_expertise_list],
    hobbies_and_interests_list: [...persona.hobbies_and_interests_list],
  }));
}

export function clearPersonaCacheForTests(): void {
  personaCache.clear();
}
