import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mirrorLegacyMemoryToSpringV4,
  searchViaSpringV4Bridge,
  softDeleteSpringMirrorsByLegacyIds,
} from '@/lib/memory/v1-spring-bridge';

const { createSearchServiceV3Mock } = vi.hoisted(() => ({
  createSearchServiceV3Mock: vi.fn(),
}));

vi.mock('@/lib/spring/memory-v4/search-service', () => ({
  createSearchServiceV3: createSearchServiceV3Mock,
}));

describe('v1 spring bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips mirror when embedding is missing', async () => {
    const result = await mirrorLegacyMemoryToSpringV4({} as never, {
      userId: 'user-1',
      memoryId: 'memory-1',
      content: 'content',
      embedding: null,
      memoryType: 'fact',
      tags: [],
      namespace: 'default',
      scope: 'user',
      sessionId: null,
      agentId: null,
      source: 'api',
      importance: 5,
    });

    expect(result).toEqual({
      mirrored: false,
      springNoteId: null,
      skippedReason: 'missing_embedding',
    });
  });

  it('mirrors memory to spring notes with legacy mapping payload', async () => {
    const singleMock = vi.fn(async () => ({ data: { id: 'spring-1' }, error: null }));
    const selectMock = vi.fn(() => ({ single: singleMock }));
    const insertMock = vi.fn(() => ({ select: selectMock }));
    const fromMock = vi.fn(() => ({ insert: insertMock }));
    const supabase = { from: fromMock };

    const result = await mirrorLegacyMemoryToSpringV4(supabase as never, {
      userId: 'user-1',
      memoryId: 'memory-1',
      content: 'hello world',
      embedding: [0.1, 0.2, 0.3],
      memoryType: 'experience',
      tags: ['tag-a'],
      namespace: 'project-a',
      scope: 'user',
      sessionId: null,
      agentId: 'agent-1',
      source: 'api',
      importance: 7,
      confidence: 0.9,
    });

    expect(fromMock).toHaveBeenCalledWith('spring_memory_notes');
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      user_id: 'user-1',
      note_type: 'episode',
      namespace: 'project-a',
      tags: ['tag-a'],
      payload_json: expect.objectContaining({
        legacy_memory_id: 'memory-1',
        legacy_namespace: 'project-a',
      }),
    });
    expect(result).toEqual({
      mirrored: true,
      springNoteId: 'spring-1',
      skippedReason: null,
    });
  });

  it('maps and filters spring search results into v1 search rows', async () => {
    const searchMock = vi.fn(async () => ({
      results: [
        {
          id: 'spring-a',
          content: 'preferred editor is vim',
          type: 'preference',
          tags: ['editor', 'productivity'],
          metadata: {
            legacy_memory_id: 'legacy-a',
            legacy_namespace: 'default',
            legacy_scope: 'user',
            legacy_agent_id: 'agent-1',
            legacy_importance: 8,
          },
          combinedScore: 0.88,
          createdAt: new Date('2026-03-05T00:00:00.000Z'),
          searchMode: 'direct',
        },
        {
          id: 'spring-b',
          content: 'other namespace memory',
          type: 'fact',
          tags: ['misc'],
          metadata: {
            legacy_memory_id: 'legacy-b',
            legacy_namespace: 'other',
            legacy_scope: 'user',
          },
          combinedScore: 0.99,
          createdAt: new Date('2026-03-05T00:00:00.000Z'),
          searchMode: 'direct',
        },
      ],
    }));
    createSearchServiceV3Mock.mockReturnValue({ search: searchMock });

    const rows = await searchViaSpringV4Bridge({} as never, {
      userId: 'user-1',
      query: 'editor preference',
      limit: 10,
      mode: 'hybrid',
      namespace: 'default',
      memoryType: 'preference',
      tags: ['editor'],
      scope: 'user',
      agentId: 'agent-1',
      after: null,
      before: null,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'legacy-a',
      memory_type: 'preference',
      similarity: 0.88,
      scope: 'user',
      agent_id: 'agent-1',
    });
  });

  it('soft deletes mirrored spring memories and tracks failed IDs', async () => {
    const selectMock = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: 'spring-a' }], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'db error' } });
    const containsMock = vi.fn(() => ({ select: selectMock }));
    const eqMock = vi.fn(() => ({ contains: containsMock }));
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    const fromMock = vi.fn(() => ({ update: updateMock }));
    const supabase = { from: fromMock };

    const result = await softDeleteSpringMirrorsByLegacyIds(
      supabase as never,
      'user-1',
      ['memory-1', 'memory-2']
    );

    expect(result).toEqual({
      deletedCount: 1,
      failedIds: ['memory-2'],
    });
    expect(fromMock).toHaveBeenCalledWith('spring_memory_notes');
  });
});
