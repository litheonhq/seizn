/* @vitest-environment node */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadSamplePersonas } from '@seizn/personas-kr';
import { clearPersonaCacheForTests, getPersonaSource, loadPersonas } from '@/lib/personas/source';
import { personaToGraphEntity, personaToSeedMemories } from '@/lib/personas/transformer';

describe('Batch C persona transformer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.HUGGINGFACE_TOKEN;
    clearPersonaCacheForTests();
  });

  it('converts a Korean persona into a synthetic graph person with full provenance', () => {
    expect.assertions(15);
    const persona = loadSamplePersonas()[0];

    const entity = personaToGraphEntity(persona, {
      userId: '00000000-0000-4000-8000-000000000001',
      organizationId: '00000000-0000-4000-8000-000000000002',
    });

    expect(entity.name.length).toBeGreaterThan(0);
    expect(entity.type).toBe('person');
    expect(entity.aliases).toEqual([]);
    expect(entity.user_id).toBe('00000000-0000-4000-8000-000000000001');
    expect(entity.is_synthetic).toBe(true);
    expect(entity.provenance.is_synthetic).toBe(true);
    expect(entity.provenance.source).toBe('nemotron-personas-kr');
    expect(entity.provenance.source_uuid).toBe(persona.uuid);
    expect(entity.provenance.source_license).toBe('CC-BY-4.0');
    expect(entity.provenance.source_license_url).toBe('https://creativecommons.org/licenses/by/4.0/');
    expect(entity.provenance.source_attribution).toBe('NVIDIA Nemotron-Personas-Korea');
    expect(entity.provenance.source_dataset_url).toBe('https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea');
    expect(Date.parse(entity.provenance.seeded_at)).not.toBeNaN();
    expect(entity.metadata.source).toBe('nemotron-personas-kr');
    expect(entity.metadata.organization_id).toBe('00000000-0000-4000-8000-000000000002');
  });

  it('creates non-empty seed memories linked to the graph entity', () => {
    const persona = loadSamplePersonas()[0];
    const memories = personaToSeedMemories(persona, '11111111-1111-4111-8111-111111111111');

    expect(memories.length).toBeGreaterThanOrEqual(3);
    expect(memories.every((memory) => memory.entity_id === '11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(memories.every((memory) => memory.content.trim().length > 0)).toBe(true);
    expect(memories.every((memory) => memory.metadata.source === 'nemotron-personas-kr')).toBe(true);
    expect(memories.every((memory) => memory.metadata.source_uuid === persona.uuid)).toBe(true);
  });

  it('selects persona source by plan tier', () => {
    expect(getPersonaSource('free')).toBe('bundled');
    expect(getPersonaSource('indie')).toBe('bundled');
    expect(getPersonaSource('starter')).toBe('bundled');
    expect(getPersonaSource('studio')).toBe('live');
    expect(getPersonaSource('plus')).toBe('live');
    expect(getPersonaSource('pro')).toBe('live');
    expect(getPersonaSource('enterprise')).toBe('live');
  });

  it('loads deterministic bundled personas for free plan', async () => {
    const first = await loadPersonas({ plan: 'free', criteria: { province: '서울' }, count: 10 });
    const second = await loadPersonas({ plan: 'free', criteria: { province: '서울' }, count: 10 });

    expect(first).toHaveLength(10);
    expect(second.map((persona) => persona.uuid)).toEqual(first.map((persona) => persona.uuid));
    expect(first.map((persona) => persona.uuid)).toEqual(
      [...first].map((persona) => persona.uuid).sort((left, right) => left.localeCompare(right)),
    );
    expect(first.every((persona) => persona.province === '서울')).toBe(true);
  });

  it('uses mocked live HuggingFace rows when a token is present', async () => {
    const liveRows = loadSamplePersonas().slice(0, 5).reverse();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        rows: liveRows.map((row) => ({ row })),
      }),
    }));
    process.env.HUGGINGFACE_TOKEN = 'mock-token-for-tests';
    vi.stubGlobal('fetch', fetchMock);

    const personas = await loadPersonas({ plan: 'pro', count: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('datasets-server.huggingface.co/rows');
    expect(personas).toHaveLength(5);
    expect(personas.map((persona) => persona.uuid)).toEqual(
      [...liveRows].map((persona) => persona.uuid).sort((left, right) => left.localeCompare(right)),
    );
  });
});
