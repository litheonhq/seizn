/**
 * Graph Retriever Tests
 *
 * Tests for hybrid vector + graph retrieval:
 * - Hybrid search with weighted scoring
 * - Multi-hop query processing
 * - Context building
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GraphStoreConfig, Entity, Relation } from '../types';

// Mock Supabase
const mockSupabaseFrom = vi.fn();
const mockSupabaseRpc = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: mockSupabaseFrom,
    rpc: mockSupabaseRpc,
  }),
}));

// Mock AI
vi.mock('@/lib/ai', () => ({
  createQueryEmbedding: vi.fn().mockResolvedValue(Array(1536).fill(0.1)),
}));

// Mock graph-store
vi.mock('../store/graph-store', () => ({
  findSimilarEntities: vi.fn().mockResolvedValue([]),
  traverseGraph: vi.fn().mockResolvedValue([]),
  getEntityRelations: vi.fn().mockResolvedValue([]),
}));

import {
  retrieve,
  multiHopRetrieve,
  focusedRetrieve,
  buildContext,
} from '../retrieval/graph-retriever';
import { findSimilarEntities, traverseGraph, getEntityRelations } from '../store/graph-store';
import type { GraphRetrievalResult } from '../types';

describe('GraphRetriever', () => {
  const config: GraphStoreConfig = {
    userId: 'user-123',
    collectionId: 'collection-456',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Hybrid Retrieval', () => {
    it('should perform hybrid vector + graph search', async () => {
      const mockVectorResults = [
        { id: 'chunk-1', content: 'Test content 1', similarity: 0.9, metadata: {} },
        { id: 'chunk-2', content: 'Test content 2', similarity: 0.8, metadata: {} },
      ];

      mockSupabaseRpc.mockResolvedValue({ data: mockVectorResults, error: null });
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              contains: vi.fn().mockResolvedValue({ data: [], error: null }),
              overlaps: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      });

      const result = await retrieve(config, 'test query');

      expect(result.chunks).toBeDefined();
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should apply vector and graph weights', async () => {
      const mockVectorResults = [
        { id: 'chunk-1', content: 'Content 1', similarity: 0.8, metadata: {} },
      ];

      mockSupabaseRpc.mockResolvedValue({ data: mockVectorResults, error: null });
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              contains: vi.fn().mockResolvedValue({ data: [], error: null }),
              overlaps: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      });

      const result = await retrieve(config, 'test query', {
        vectorWeight: 0.7,
        graphWeight: 0.3,
      });

      expect(result.chunks).toBeDefined();
    });

    it('should respect topK limit', async () => {
      const mockVectorResults = Array.from({ length: 20 }, (_, i) => ({
        id: `chunk-${i}`,
        content: `Content ${i}`,
        similarity: 0.9 - i * 0.01,
        metadata: {},
      }));

      mockSupabaseRpc.mockResolvedValue({ data: mockVectorResults, error: null });
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              contains: vi.fn().mockResolvedValue({ data: [], error: null }),
              overlaps: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      });

      const result = await retrieve(config, 'test query', { topK: 5 });

      expect(result.chunks.length).toBeLessThanOrEqual(5);
    });

    it('should include entity context when enabled', async () => {
      const mockVectorResults = [
        { id: 'chunk-1', content: 'Content', similarity: 0.9, metadata: {} },
      ];

      const mockEntities = [
        { id: 'ent-1', name: 'Entity 1', type: 'concept', confidence: 0.9, source_chunks: ['chunk-1'], aliases: [], metadata: {} },
      ];

      mockSupabaseRpc.mockResolvedValue({ data: mockVectorResults, error: null });
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              contains: vi.fn().mockResolvedValue({ data: [], error: null }),
              overlaps: vi.fn().mockResolvedValue({ data: mockEntities, error: null }),
            }),
          }),
        }),
      });

      const result = await retrieve(config, 'test query', {
        includeEntityContext: true,
      });

      expect(result.entities).toBeDefined();
    });

    it('should handle empty vector results', async () => {
      mockSupabaseRpc.mockResolvedValue({ data: [], error: null });

      const result = await retrieve(config, 'test query');

      expect(result.chunks).toEqual([]);
    });
  });

  describe('Multi-hop Retrieval', () => {
    it('should perform multi-hop retrieval with increased depth', async () => {
      mockSupabaseRpc.mockResolvedValue({ data: [], error: null });
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              contains: vi.fn().mockResolvedValue({ data: [], error: null }),
              overlaps: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      });

      const result = await multiHopRetrieve(config, 'Who founded OpenAI?', 3);

      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should use higher graph weight for multi-hop queries', async () => {
      mockSupabaseRpc.mockResolvedValue({ data: [], error: null });
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              contains: vi.fn().mockResolvedValue({ data: [], error: null }),
              overlaps: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      });

      const result = await multiHopRetrieve(config, 'multi-hop query');

      // Multi-hop should complete without error
      expect(result.chunks).toBeDefined();
    });
  });

  describe('Focused Retrieval', () => {
    it('should boost chunks related to focus entities', async () => {
      const mockVectorResults = [
        { id: 'chunk-1', content: 'Focused content', similarity: 0.7, metadata: {} },
      ];

      const mockFocusEntity = {
        id: 'focus-ent',
        name: 'Focus Entity',
        type: 'concept',
        confidence: 0.9,
        source_chunks: ['chunk-1'],
        aliases: [],
        metadata: {},
      };

      mockSupabaseRpc.mockResolvedValue({ data: mockVectorResults, error: null });
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [mockFocusEntity], error: null }),
              contains: vi.fn().mockResolvedValue({ data: [], error: null }),
              overlaps: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      });

      vi.mocked(getEntityRelations).mockResolvedValue([]);

      const result = await focusedRetrieve(
        config,
        'query',
        { focusEntityIds: ['focus-ent'] }
      );

      expect(result.chunks).toBeDefined();
    });

    it('should include focus entities in results', async () => {
      const mockFocusEntity = {
        id: 'focus-ent',
        name: 'Focus Entity',
        type: 'concept',
        confidence: 0.9,
        source_chunks: [],
        aliases: [],
        metadata: {},
      };

      mockSupabaseRpc.mockResolvedValue({ data: [], error: null });
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [mockFocusEntity], error: null }),
              contains: vi.fn().mockResolvedValue({ data: [], error: null }),
              overlaps: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      });

      vi.mocked(getEntityRelations).mockResolvedValue([]);

      const result = await focusedRetrieve(
        config,
        'query',
        { focusEntityIds: ['focus-ent'] }
      );

      expect(result.entities.some((e) => e.id === 'focus-ent')).toBe(true);
    });

    it('should filter by relation types when specified', async () => {
      mockSupabaseRpc.mockResolvedValue({ data: [], error: null });
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
              contains: vi.fn().mockResolvedValue({ data: [], error: null }),
              overlaps: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      });

      vi.mocked(getEntityRelations).mockResolvedValue([]);

      const result = await focusedRetrieve(
        config,
        'query',
        {
          focusEntityIds: ['ent-1'],
          focusRelationTypes: ['depends_on', 'part_of'],
        }
      );

      expect(result).toBeDefined();
    });
  });

  describe('buildContext', () => {
    it('should build context string from retrieval results', () => {
      const result: GraphRetrievalResult = {
        chunks: [
          { id: 'c1', content: 'Chunk content', score: 0.9, vectorScore: 0.85, graphScore: 0.1, metadata: {} },
        ],
        entities: [
          { id: 'e1', name: 'Entity 1', type: 'concept', aliases: [], confidence: 0.9, sourceChunks: [], metadata: {}, description: 'A concept' },
        ],
        relations: [
          { id: 'r1', sourceEntityId: 'e1', targetEntityId: 'e2', type: 'depends_on', evidenceChunkId: 'c1', confidence: 0.8, metadata: {} },
        ],
        paths: [],
        latencyMs: 100,
      };

      const context = buildContext(result);

      expect(context).toContain('## Entities');
      expect(context).toContain('Entity 1');
      expect(context).toContain('## Relationships');
      expect(context).toContain('depends_on');
      expect(context).toContain('## Retrieved Content');
      expect(context).toContain('Chunk content');
    });

    it('should handle empty results', () => {
      const emptyResult: GraphRetrievalResult = {
        chunks: [],
        entities: [],
        relations: [],
        paths: [],
        latencyMs: 50,
      };

      const context = buildContext(emptyResult);

      expect(context).toBe('');
    });

    it('should limit entities and relations in context', () => {
      const manyEntities: Entity[] = Array.from({ length: 20 }, (_, i) => ({
        id: `e${i}`,
        name: `Entity ${i}`,
        type: 'concept' as const,
        aliases: [],
        confidence: 0.9,
        sourceChunks: [],
        metadata: {},
      }));

      const result: GraphRetrievalResult = {
        chunks: [],
        entities: manyEntities,
        relations: [],
        paths: [],
        latencyMs: 100,
      };

      const context = buildContext(result);

      // Should limit to 10 entities
      const entityMatches = context.match(/Entity \d+/g) || [];
      expect(entityMatches.length).toBeLessThanOrEqual(10);
    });

    it('should include entity descriptions when available', () => {
      const result: GraphRetrievalResult = {
        chunks: [],
        entities: [
          {
            id: 'e1',
            name: 'OpenAI',
            type: 'organization',
            description: 'AI research company',
            aliases: [],
            confidence: 0.9,
            sourceChunks: [],
            metadata: {},
          },
        ],
        relations: [],
        paths: [],
        latencyMs: 100,
      };

      const context = buildContext(result);

      expect(context).toContain('AI research company');
    });

    it('should format relations with entity names', () => {
      const result: GraphRetrievalResult = {
        chunks: [],
        entities: [
          { id: 'e1', name: 'React', type: 'technology', aliases: [], confidence: 0.9, sourceChunks: [], metadata: {} },
          { id: 'e2', name: 'Node.js', type: 'technology', aliases: [], confidence: 0.9, sourceChunks: [], metadata: {} },
        ],
        relations: [
          { id: 'r1', sourceEntityId: 'e1', targetEntityId: 'e2', type: 'depends_on', evidenceChunkId: 'c1', confidence: 0.8, metadata: {} },
        ],
        paths: [],
        latencyMs: 100,
      };

      const context = buildContext(result);

      expect(context).toContain('React');
      expect(context).toContain('Node.js');
      expect(context).toContain('depends_on');
    });
  });

  describe('Edge cases', () => {
    it('should handle API errors gracefully', async () => {
      mockSupabaseRpc.mockResolvedValue({ data: null, error: { message: 'API Error' } });

      await expect(retrieve(config, 'test query')).rejects.toThrow();
    });

    it('should handle empty query', async () => {
      mockSupabaseRpc.mockResolvedValue({ data: [], error: null });
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              contains: vi.fn().mockResolvedValue({ data: [], error: null }),
              overlaps: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      });

      const result = await retrieve(config, '');

      expect(result.chunks).toBeDefined();
    });

    it('should handle very long queries', async () => {
      const longQuery = 'test '.repeat(1000);

      mockSupabaseRpc.mockResolvedValue({ data: [], error: null });
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              contains: vi.fn().mockResolvedValue({ data: [], error: null }),
              overlaps: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      });

      const result = await retrieve(config, longQuery);

      expect(result.chunks).toBeDefined();
    });
  });
});
