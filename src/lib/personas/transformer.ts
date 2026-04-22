import type { KoreanPersona } from '@seizn/personas-kr';

export const PERSONA_SOURCE = 'nemotron-personas-kr' as const;
export const PERSONA_ATTRIBUTION = 'NVIDIA Nemotron-Personas-Korea' as const;
export const PERSONA_DATASET_URL = 'https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea' as const;
export const PERSONA_LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/' as const;

export type PersonaProvenance = {
  is_synthetic: true;
  source: typeof PERSONA_SOURCE;
  source_uuid: string;
  source_license: 'CC-BY-4.0';
  source_license_url: typeof PERSONA_LICENSE_URL;
  source_attribution: typeof PERSONA_ATTRIBUTION;
  source_dataset_url: typeof PERSONA_DATASET_URL;
  seeded_at: string;
};

export type GraphEntityDraft = {
  user_id: string;
  name: string;
  aliases: string[];
  type: 'person';
  description: string;
  confidence: number;
  source_chunks: string[];
  extraction_model: typeof PERSONA_SOURCE;
  metadata: Record<string, unknown>;
  is_synthetic: true;
  provenance: PersonaProvenance;
};

export type MemoryDraft = {
  entity_id: string;
  content: string;
  memory_type: 'fact' | 'experience' | 'relationship';
  tags: string[];
  source: typeof PERSONA_SOURCE;
  confidence: number;
  importance: number;
  metadata: {
    source: typeof PERSONA_SOURCE;
    source_uuid: string;
  };
};

export function createPersonaProvenance(persona: Pick<KoreanPersona, 'uuid'>, seededAt = new Date()): PersonaProvenance {
  return {
    is_synthetic: true,
    source: PERSONA_SOURCE,
    source_uuid: persona.uuid,
    source_license: 'CC-BY-4.0',
    source_license_url: PERSONA_LICENSE_URL,
    source_attribution: PERSONA_ATTRIBUTION,
    source_dataset_url: PERSONA_DATASET_URL,
    seeded_at: seededAt.toISOString(),
  };
}

export function extractPersonaName(persona: Pick<KoreanPersona, 'persona' | 'uuid'>): string {
  const match = persona.persona.match(/^([가-힣A-Za-z0-9._-]+(?:\s씨)?)/u);
  const candidate = match?.[1]?.trim().replace(/\s씨$/u, '');
  return candidate || `persona-${persona.uuid.slice(0, 8)}`;
}

export function personaToGraphEntity(
  persona: KoreanPersona,
  options: { userId: string; organizationId: string },
): GraphEntityDraft {
  const provenance = createPersonaProvenance(persona);

  return {
    user_id: options.userId,
    name: extractPersonaName(persona),
    aliases: [],
    type: 'person',
    description: persona.persona,
    confidence: 0.92,
    source_chunks: [],
    extraction_model: PERSONA_SOURCE,
    metadata: {
      organization_id: options.organizationId,
      persona_uuid: persona.uuid,
      province: persona.province,
      district: persona.district,
      occupation: persona.occupation,
      age: persona.age,
      sex: persona.sex,
      education_level: persona.education_level,
      marital_status: persona.marital_status,
      military_status: persona.military_status,
      family_type: persona.family_type,
      housing_type: persona.housing_type,
      skills_and_expertise_list: persona.skills_and_expertise_list,
      hobbies_and_interests_list: persona.hobbies_and_interests_list,
      source: PERSONA_SOURCE,
      source_attribution: PERSONA_ATTRIBUTION,
    },
    is_synthetic: true,
    provenance,
  };
}

export function personaToSeedMemories(persona: KoreanPersona, entityId: string): MemoryDraft[] {
  const metadata = {
    source: PERSONA_SOURCE,
    source_uuid: persona.uuid,
  } as const;

  return [
    {
      entity_id: entityId,
      content: persona.cultural_background,
      memory_type: 'experience',
      tags: ['persona_seed', 'background', persona.province],
      source: PERSONA_SOURCE,
      confidence: 0.9,
      importance: 7,
      metadata: { ...metadata },
    },
    {
      entity_id: entityId,
      content: `${persona.occupation}: ${persona.skills_and_expertise}`,
      memory_type: 'fact',
      tags: ['persona_seed', 'occupation'],
      source: PERSONA_SOURCE,
      confidence: 0.9,
      importance: 8,
      metadata: { ...metadata },
    },
    {
      entity_id: entityId,
      content: `${persona.family_type}. ${persona.family_persona}`,
      memory_type: 'relationship',
      tags: ['persona_seed', 'family'],
      source: PERSONA_SOURCE,
      confidence: 0.86,
      importance: 6,
      metadata: { ...metadata },
    },
    {
      entity_id: entityId,
      content: `${persona.district}, ${persona.province}. ${persona.hobbies_and_interests}`,
      memory_type: 'experience',
      tags: ['persona_seed', 'regional_context'],
      source: PERSONA_SOURCE,
      confidence: 0.86,
      importance: 6,
      metadata: { ...metadata },
    },
  ];
}
