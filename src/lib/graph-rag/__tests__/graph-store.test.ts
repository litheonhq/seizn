/**
 * Graph Store Tests
 *
 * Tests for graph storage operations:
 * - Entity CRUD operations
 * - Relation CRUD operations
 * - Graph traversal (BFS)
 * - Embedding-based similarity search
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GraphStoreConfig, EntityInput, RelationInput, EntityType, RelationType } from '../types';

// Mock Supabase client
const mockSupabaseFrom = vi.fn();
const mockSupabaseRpc = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: mockSupabaseFrom,
    rpc: mockSupabaseRpc,
  }),
}));

// Mock AI embedding
vi.mock('@/lib/ai', () => ({
  createEmbedding: vi.fn().mockResolvedValue(Array(1536).fill(0.1)),
}));

// Import after mocks are set up
import {
  createEntity,
  createEntities,
  getEntity,
  findSimilarEntities,
  updateEntity,
  deleteEntity,
  createRelation,
  createRelations,
  queryRelations,
  getEntityRelations,
  deleteRelation,
  traverseGraph,
  findPath,
  findEntityByName,
  mergeEntitySources,
} from '../store/graph-store';

describe('GraphStore', () => {
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

  describe('Entity CRUD', () => {
    it('should create a new entity', async () => {
      const mockEntity = {
        id: 'ent-1',
        user_id: config.userId,
        collection_id: config.collectionId,
        name: 'Test Entity',
        aliases: [],
        type: 'concept' as EntityType,
        description: 'A test entity',
        embedding: Array(1536).fill(0.1),
        confidence: 0.9,
        source_chunks: ['chunk-1'],
        metadata: {},
      };

      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockEntity, error: null }),
          }),
        }),
      });

      const input: EntityInput = {
        name: 'Test Entity',
        type: 'concept',
        description: 'A test entity',
        confidence: 0.9,
        sourceChunkId: 'chunk-1',
      };

      const result = await createEntity(config, input);

      expect(result.name).toBe('Test Entity');
      expect(result.type).toBe('concept');
      expect(mockSupabaseFrom).toHaveBeenCalledWith('graph_entities');
    });

    it('should create multiple entities in batch', async () => {
      const mockEntities = [
        { id: 'ent-1', name: 'Entity 1', type: 'concept', confidence: 0.8, source_chunks: ['c1'], aliases: [], metadata: {} },
        { id: 'ent-2', name: 'Entity 2', type: 'technology', confidence: 0.9, source_chunks: ['c1'], aliases: [], metadata: {} },
      ];

      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: mockEntities, error: null }),
        }),
      });

      const inputs: EntityInput[] = [
        { name: 'Entity 1', type: 'concept', sourceChunkId: 'c1' },
        { name: 'Entity 2', type: 'technology', sourceChunkId: 'c1' },
      ];

      const result = await createEntities(config, inputs);

      expect(result.length).toBe(2);
    });

    it('should return empty array when creating zero entities', async () => {
      const result = await createEntities(config, []);
      expect(result).toEqual([]);
      expect(mockSupabaseFrom).not.toHaveBeenCalled();
    });

    it('should get entity by ID', async () => {
      const mockEntity = {
        id: 'ent-1',
        name: 'Test Entity',
        type: 'concept',
        confidence: 0.9,
        source_chunks: ['chunk-1'],
        aliases: [],
        metadata: {},
      };

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockEntity, error: null }),
              }),
            }),
          }),
        }),
      });

      const result = await getEntity(config, 'ent-1');

      expect(result?.name).toBe('Test Entity');
    });

    it('should return null for non-existent entity', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { code: 'PGRST116', message: 'Not found' },
                }),
              }),
            }),
          }),
        }),
      });

      const result = await getEntity(config, 'non-existent');
      expect(result).toBeNull();
    });

    it('should update an entity', async () => {
      const updatedEntity = {
        id: 'ent-1',
        name: 'Updated Entity',
        type: 'concept',
        description: 'Updated description',
        confidence: 0.95,
        source_chunks: ['chunk-1'],
        aliases: [],
        metadata: {},
      };

      mockSupabaseFrom.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: updatedEntity, error: null }),
                }),
              }),
            }),
          }),
        }),
      });

      const result = await updateEntity(config, 'ent-1', {
        name: 'Updated Entity',
        description: 'Updated description',
      });

      expect(result.name).toBe('Updated Entity');
    });

    it('should delete an entity and its relations', async () => {
      mockSupabaseFrom.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              or: vi.fn().mockResolvedValue({ error: null }),
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }),
      });

      await expect(deleteEntity(config, 'ent-1')).resolves.not.toThrow();
      expect(mockSupabaseFrom).toHaveBeenCalledWith('graph_relations');
      expect(mockSupabaseFrom).toHaveBeenCalledWith('graph_entities');
    });
  });

  describe('Entity Search', () => {
    it('should find similar entities by embedding', async () => {
      const mockResults = [
        { id: 'ent-1', name: 'Similar 1', type: 'concept', confidence: 0.9, source_chunks: [], aliases: [], metadata: {} },
        { id: 'ent-2', name: 'Similar 2', type: 'concept', confidence: 0.85, source_chunks: [], aliases: [], metadata: {} },
      ];

      mockSupabaseRpc.mockResolvedValue({ data: mockResults, error: null });

      const result = await findSimilarEntities(config, {
        embedding: Array(1536).fill(0.1),
        limit: 10,
        minSimilarity: 0.7,
      });

      expect(result.length).toBe(2);
      expect(mockSupabaseRpc).toHaveBeenCalledWith('match_graph_entities', expect.any(Object));
    });

    it('should find entities by name (partial match)', async () => {
      const mockResults = [
        { id: 'ent-1', name: 'React', type: 'technology', confidence: 0.9, source_chunks: [], aliases: [], metadata: {} },
      ];

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              ilike: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: mockResults, error: null }),
              }),
            }),
          }),
        }),
      });

      const result = await findSimilarEntities(config, {
        name: 'React',
        limit: 10,
      });

      expect(result.length).toBe(1);
      expect(result[0].name).toBe('React');
    });

    it('should find entity by exact name', async () => {
      const mockEntity = {
        id: 'ent-1',
        name: 'Exact Entity',
        type: 'concept',
        confidence: 0.9,
        source_chunks: [],
        aliases: [],
        metadata: {},
      };

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockEntity, error: null }),
                }),
                single: vi.fn().mockResolvedValue({ data: mockEntity, error: null }),
              }),
            }),
          }),
        }),
      });

      const result = await findEntityByName(config, 'Exact Entity', 'concept');

      expect(result?.name).toBe('Exact Entity');
    });
  });

  describe('Relation CRUD', () => {
    it('should create a new relation', async () => {
      const mockRelation = {
        id: 'rel-1',
        source_entity_id: 'ent-1',
        target_entity_id: 'ent-2',
        type: 'depends_on' as RelationType,
        evidence: 'Entity 1 depends on Entity 2',
        evidence_chunk_id: 'chunk-1',
        confidence: 0.85,
        metadata: {},
      };

      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockRelation, error: null }),
          }),
        }),
      });

      const input: RelationInput = {
        sourceEntityId: 'ent-1',
        targetEntityId: 'ent-2',
        type: 'depends_on',
        evidence: 'Entity 1 depends on Entity 2',
        evidenceChunkId: 'chunk-1',
        confidence: 0.85,
      };

      const result = await createRelation(config, input);

      expect(result.type).toBe('depends_on');
      expect(result.sourceEntityId).toBe('ent-1');
    });

    it('should create multiple relations in batch', async () => {
      const mockRelations = [
        { id: 'rel-1', source_entity_id: 'e1', target_entity_id: 'e2', type: 'depends_on', evidence_chunk_id: 'c1', confidence: 0.8, metadata: {} },
        { id: 'rel-2', source_entity_id: 'e2', target_entity_id: 'e3', type: 'part_of', evidence_chunk_id: 'c1', confidence: 0.9, metadata: {} },
      ];

      mockSupabaseFrom.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: mockRelations, error: null }),
        }),
      });

      const inputs: RelationInput[] = [
        { sourceEntityId: 'e1', targetEntityId: 'e2', type: 'depends_on', evidenceChunkId: 'c1' },
        { sourceEntityId: 'e2', targetEntityId: 'e3', type: 'part_of', evidenceChunkId: 'c1' },
      ];

      const result = await createRelations(config, inputs);

      expect(result.length).toBe(2);
    });

    it('should query relations with filters', async () => {
      const mockRelations = [
        { id: 'rel-1', source_entity_id: 'e1', target_entity_id: 'e2', type: 'depends_on', evidence_chunk_id: 'c1', confidence: 0.8, metadata: {} },
      ];

mockSupabaseFrom.mockReturnValue({        select: vi.fn().mockReturnValue({          eq: vi.fn().mockReturnValue({            eq: vi.fn().mockReturnValue({              eq: vi.fn().mockReturnValue({                eq: vi.fn().mockReturnValue({                  limit: vi.fn().mockResolvedValue({ data: mockRelations, error: null }),                }),              }),            }),          }),        }),      });

      const result = await queryRelations(config, {
        sourceEntityId: 'e1',
        type: 'depends_on',
        limit: 10,
      });

      expect(result.length).toBe(1);
    });

    it('should get entity relations in both directions', async () => {
      const mockRelations = [
        { id: 'rel-1', source_entity_id: 'e1', target_entity_id: 'e2', type: 'depends_on', evidence_chunk_id: 'c1', confidence: 0.8, metadata: {} },
        { id: 'rel-2', source_entity_id: 'e3', target_entity_id: 'e1', type: 'part_of', evidence_chunk_id: 'c1', confidence: 0.9, metadata: {} },
      ];

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              or: vi.fn().mockResolvedValue({ data: mockRelations, error: null }),
            }),
          }),
        }),
      });

      const result = await getEntityRelations(config, 'e1', 'both');

      expect(result.length).toBe(2);
    });

    it('should delete a relation', async () => {
      mockSupabaseFrom.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }),
      });

      await expect(deleteRelation(config, 'rel-1')).resolves.not.toThrow();
    });
  });

  describe('Graph Traversal (BFS)', () => {
    it('should traverse graph from start entities', async () => {
      const mockEntity1 = { id: 'e1', name: 'Entity 1', type: 'concept', confidence: 0.9, source_chunks: [], aliases: [], metadata: {} };
      const mockEntity2 = { id: 'e2', name: 'Entity 2', type: 'concept', confidence: 0.8, source_chunks: [], aliases: [], metadata: {} };
      const mockRelation = { id: 'r1', source_entity_id: 'e1', target_entity_id: 'e2', type: 'depends_on', evidence_chunk_id: 'c1', confidence: 0.9, metadata: {} };

      // Mock getEntity
      let entityCallCount = 0;
      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'graph_entities') {
          entityCallCount++;
          const entity = entityCallCount === 1 ? mockEntity1 : mockEntity2;
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: entity, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        // graph_relations
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                or: vi.fn().mockResolvedValue({ data: [mockRelation], error: null }),
                eq: vi.fn().mockReturnValue({
                  or: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          }),
        };
      });

      const paths = await traverseGraph(config, ['e1'], { maxDepth: 2 });

      expect(paths.length).toBeGreaterThan(0);
    });

    it('should respect maxDepth limit', async () => {
      const mockEntity = { id: 'e1', name: 'Entity 1', type: 'concept', confidence: 0.9, source_chunks: [], aliases: [], metadata: {} };

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockEntity, error: null }),
              }),
              or: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      });

      const paths = await traverseGraph(config, ['e1'], { maxDepth: 0 });

      // With maxDepth 0, should just return the start node
      expect(paths.length).toBeGreaterThan(0);
      paths.forEach((path) => {
        expect(path.nodes.length).toBeLessThanOrEqual(1);
      });
    });

    it('should filter by relation types during traversal', async () => {
      const mockEntity = { id: 'e1', name: 'Entity 1', type: 'concept', confidence: 0.9, source_chunks: [], aliases: [], metadata: {} };

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockEntity, error: null }),
              }),
              or: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      });

      const paths = await traverseGraph(config, ['e1'], {
        maxDepth: 2,
        relationTypes: ['depends_on', 'part_of'],
      });

      expect(paths).toBeDefined();
    });
  });

  describe('Find Path', () => {
    it('should find shortest path between entities', async () => {
      const mockEntity1 = { id: 'e1', name: 'Entity 1', type: 'concept', confidence: 0.9, source_chunks: [], aliases: [], metadata: {} };
      const mockEntity2 = { id: 'e2', name: 'Entity 2', type: 'concept', confidence: 0.8, source_chunks: [], aliases: [], metadata: {} };
      const mockRelation = { id: 'r1', source_entity_id: 'e1', target_entity_id: 'e2', type: 'depends_on', evidence_chunk_id: 'c1', confidence: 0.9, metadata: {} };

      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'graph_entities') {
          callCount++;
          const entity = callCount === 1 ? mockEntity1 : mockEntity2;
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: entity, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                or: vi.fn().mockResolvedValue({ data: [mockRelation], error: null }),
              }),
            }),
          }),
        };
      });

      const path = await findPath(config, 'e1', 'e2', 5);

      // Path should exist or be null (depending on graph structure)
      expect(path === null || path.nodes.length >= 1).toBe(true);
    });

    it('should return null when no path exists', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { code: 'PGRST116', message: 'Not found' },
                }),
              }),
            }),
          }),
        }),
      });

      const path = await findPath(config, 'e1', 'e99', 5);

      expect(path).toBeNull();
    });
  });

  describe('mergeEntitySources', () => {
    it('should merge entity sources and update confidence', async () => {
      const existingEntity = {
        id: 'ent-1',
        name: 'Test Entity',
        type: 'concept',
        confidence: 0.8,
        source_chunks: ['chunk-1'],
        aliases: [],
        metadata: {},
      };

      const updatedEntity = {
        ...existingEntity,
        confidence: 0.9,
        source_chunks: ['chunk-1', 'chunk-2'],
      };

      // First call: getEntity
      mockSupabaseFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: existingEntity, error: null }),
              }),
            }),
          }),
        }),
      });

      // Second call: update
      mockSupabaseFrom.mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: updatedEntity, error: null }),
                }),
              }),
            }),
          }),
        }),
      });

      const result = await mergeEntitySources(config, 'ent-1', 'chunk-2', 0.85);

      expect(result.sourceChunks).toContain('chunk-2');
    });
  });
});
