import type { KoreanPersona, PersonaFilterCriteria } from '@seizn/personas-kr';
import { loadPersonas, getPersonaSource, type PersonaSource } from '@/lib/personas/source';
import {
  extractPersonaName,
  personaToGraphEntity,
  PERSONA_DATASET_URL,
  PERSONA_SOURCE,
} from '@/lib/personas/transformer';

export type PersonaSeedMode = 'auto' | 'manual' | 'hybrid';

export type PersonaSeedSelection = {
  personaId: string;
  accept: boolean;
};

export type PersonaSeedCriteria = {
  region?: string;
  occupation?: string;
  lifeStage?: string;
  ageRange?: readonly [number, number];
};

export type PersonaPreview = {
  id: string;
  name: string;
  age: number;
  occupation: string;
  province: string;
  district: string;
  lifeStage: string;
  summary: string;
  source: typeof PERSONA_SOURCE;
  datasetUrl: typeof PERSONA_DATASET_URL;
};

export type PersonaGraphInsert = ReturnType<typeof personaToGraphEntity>;

const LIFE_STAGE_AGE_RANGES: Record<string, readonly [number, number]> = {
  young_adult: [19, 29],
  adult: [30, 44],
  middle: [45, 64],
  senior: [65, 94],
};

export function normalizeSeedMode(value: unknown): PersonaSeedMode | null {
  return value === 'auto' || value === 'manual' || value === 'hybrid' ? value : null;
}

export function criteriaToPersonaFilter(criteria: PersonaSeedCriteria = {}): PersonaFilterCriteria {
  const filter: PersonaFilterCriteria = {};
  const region = criteria.region?.trim();
  const occupation = criteria.occupation?.trim();

  if (region) filter.region = region;
  if (occupation) filter.occupation = occupation;
  if (criteria.ageRange) {
    filter.ageRange = criteria.ageRange;
  } else if (criteria.lifeStage && LIFE_STAGE_AGE_RANGES[criteria.lifeStage]) {
    filter.ageRange = LIFE_STAGE_AGE_RANGES[criteria.lifeStage];
  }

  return filter;
}

export function lifeStageForAge(age: number): string {
  if (age < 30) return 'young_adult';
  if (age < 45) return 'adult';
  if (age < 65) return 'middle';
  return 'senior';
}

export function resolvePersonaDataSource(plan: string): PersonaSource {
  const requested = getPersonaSource(plan);
  return requested === 'live' && !process.env.HUGGINGFACE_TOKEN ? 'bundled' : requested;
}

export function toPersonaPreview(persona: KoreanPersona): PersonaPreview {
  return {
    id: persona.uuid,
    name: extractPersonaName(persona),
    age: persona.age,
    occupation: persona.occupation,
    province: persona.province,
    district: persona.district,
    lifeStage: lifeStageForAge(persona.age),
    summary: persona.persona,
    source: PERSONA_SOURCE,
    datasetUrl: PERSONA_DATASET_URL,
  };
}

export async function loadPersonaPreviewRows(params: {
  plan: string;
  count: number;
  criteria?: PersonaSeedCriteria;
}): Promise<KoreanPersona[]> {
  return loadPersonas({
    plan: params.plan,
    count: params.count,
    criteria: criteriaToPersonaFilter(params.criteria),
  });
}

export function personasToGraphEntityRows(
  personas: readonly KoreanPersona[],
  params: { userId: string; organizationId: string },
): PersonaGraphInsert[] {
  return personas.map((persona) =>
    personaToGraphEntity(persona, {
      userId: params.userId,
      organizationId: params.organizationId,
    }),
  );
}
