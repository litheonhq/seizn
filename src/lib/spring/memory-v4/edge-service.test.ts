/**
 * Edge Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EdgeService } from './edge-service';

describe('EdgeService', () => {
  let service: EdgeService;
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  type EdgeSupabase = ConstructorParameters<typeof EdgeService>[0];

  function createMockSupabase() {
    const mockQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    return {
      from: vi.fn(() => mockQueryBuilder),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      _queryBuilder: mockQueryBuilder,
    };
  }

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    service = new EdgeService(mockSupabase as unknown as EdgeSupabase);
  });

  describe('createEdge', () => {
    it('should verify memory ownership before creating edge', async () => {
      // Mock source memory check
      mockSupabase._queryBuilder.single
        .mockResolvedValueOnce({
          data: { id: 'src-123', user_id: 'user-123' },
          error: null,
        })
        // Mock destination memory check
        .mockResolvedValueOnce({
          data: { id: 'dst-456', user_id: 'user-123' },
          error: null,
        })
        // Mock edge creation
        .mockResolvedValueOnce({
          data: {
            id: 'edge-789',
            src_memory_id: 'src-123',
            dst_memory_id: 'dst-456',
            edge_type: 'relates_to',
            weight: 0.8,
            confidence: 0.9,
            created_by: 'user-123',
            created_by_system: false,
            created_at: new Date().toISOString(),
          },
          error: null,
        });

      const result = await service.createEdge('user-123', {
        srcMemoryId: 'src-123',
        dstMemoryId: 'dst-456',
        edgeType: 'relates_to',
        weight: 0.8,
        confidence: 0.9,
      });

      expect(result.id).toBe('edge-789');
      expect(result.srcMemoryId).toBe('src-123');
      expect(result.dstMemoryId).toBe('dst-456');
      expect(result.edgeType).toBe('relates_to');
    });

    it('should throw error if source memory not found', async () => {
      mockSupabase._queryBuilder.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });

      await expect(
        service.createEdge('user-123', {
          srcMemoryId: 'invalid',
          dstMemoryId: 'dst-456',
          edgeType: 'relates_to',
        })
      ).rejects.toThrow('Source memory not found');
    });

    it('should throw error if source memory belongs to different user', async () => {
      mockSupabase._queryBuilder.single.mockResolvedValueOnce({
        data: { id: 'src-123', user_id: 'other-user' },
        error: null,
      });

      await expect(
        service.createEdge('user-123', {
          srcMemoryId: 'src-123',
          dstMemoryId: 'dst-456',
          edgeType: 'relates_to',
        })
      ).rejects.toThrow('Source memory does not belong to user');
    });

    it('should throw error if destination memory not found', async () => {
      mockSupabase._queryBuilder.single
        .mockResolvedValueOnce({
          data: { id: 'src-123', user_id: 'user-123' },
          error: null,
        })
        .mockResolvedValueOnce({
          data: null,
          error: { code: 'PGRST116' },
        });

      await expect(
        service.createEdge('user-123', {
          srcMemoryId: 'src-123',
          dstMemoryId: 'invalid',
          edgeType: 'relates_to',
        })
      ).rejects.toThrow('Destination memory not found');
    });

    it('should handle duplicate edge error', async () => {
      mockSupabase._queryBuilder.single
        .mockResolvedValueOnce({
          data: { id: 'src-123', user_id: 'user-123' },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { id: 'dst-456', user_id: 'user-123' },
          error: null,
        })
        .mockResolvedValueOnce({
          data: null,
          error: { code: '23505', message: 'duplicate key' },
        });

      await expect(
        service.createEdge('user-123', {
          srcMemoryId: 'src-123',
          dstMemoryId: 'dst-456',
          edgeType: 'relates_to',
        })
      ).rejects.toThrow('Edge already exists');
    });
  });

  describe('createEdges (batch)', () => {
    it('should verify all memories belong to user before batch insert', async () => {
      // Mock the ownership verification query
      mockSupabase._queryBuilder.in.mockResolvedValueOnce({
        data: [{ id: 'src-1' }, { id: 'dst-1' }, { id: 'src-2' }, { id: 'dst-2' }],
        error: null,
      });

      // Mock upsert result
      mockSupabase._queryBuilder.upsert.mockReturnValueOnce({
        select: vi.fn().mockResolvedValueOnce({
          data: [
            {
              id: 'edge-1',
              src_memory_id: 'src-1',
              dst_memory_id: 'dst-1',
              edge_type: 'relates_to',
              weight: 1.0,
              confidence: 0.8,
              created_by: 'user-123',
              created_by_system: false,
              created_at: new Date().toISOString(),
            },
            {
              id: 'edge-2',
              src_memory_id: 'src-2',
              dst_memory_id: 'dst-2',
              edge_type: 'supports',
              weight: 0.9,
              confidence: 0.8,
              created_by: 'user-123',
              created_by_system: false,
              created_at: new Date().toISOString(),
            },
          ],
          error: null,
        }),
      });

      const result = await service.createEdges('user-123', [
        { srcMemoryId: 'src-1', dstMemoryId: 'dst-1', edgeType: 'relates_to' },
        { srcMemoryId: 'src-2', dstMemoryId: 'dst-2', edgeType: 'supports', weight: 0.9 },
      ]);

      // Verify ownership check was called
      expect(mockSupabase._queryBuilder.eq).toHaveBeenCalledWith('user_id', 'user-123');
      expect(mockSupabase._queryBuilder.in).toHaveBeenCalled();

      expect(result).toHaveLength(2);
    });

    it('should throw error if any memory does not belong to user', async () => {
      // Only return 3 out of 4 memories (one doesn't belong to user)
      mockSupabase._queryBuilder.in.mockResolvedValueOnce({
        data: [{ id: 'src-1' }, { id: 'dst-1' }, { id: 'src-2' }],
        error: null,
      });

      await expect(
        service.createEdges('user-123', [
          { srcMemoryId: 'src-1', dstMemoryId: 'dst-1', edgeType: 'relates_to' },
          { srcMemoryId: 'src-2', dstMemoryId: 'dst-2', edgeType: 'supports' },
        ])
      ).rejects.toThrow(/does not belong to user/);
    });

    it('should properly bind this in map function', async () => {
      mockSupabase._queryBuilder.in.mockResolvedValueOnce({
        data: [{ id: 'src-1' }, { id: 'dst-1' }],
        error: null,
      });

      const mockEdges = [
        {
          id: 'edge-1',
          src_memory_id: 'src-1',
          dst_memory_id: 'dst-1',
          edge_type: 'relates_to',
          weight: 1.0,
          confidence: 0.8,
          created_by: 'user-123',
          created_by_system: false,
          created_at: new Date().toISOString(),
        },
      ];

      mockSupabase._queryBuilder.upsert.mockReturnValueOnce({
        select: vi.fn().mockResolvedValueOnce({
          data: mockEdges,
          error: null,
        }),
      });

      // This should not throw even if 'this' binding was incorrect
      const result = await service.createEdges('user-123', [
        { srcMemoryId: 'src-1', dstMemoryId: 'dst-1', edgeType: 'relates_to' },
      ]);

      expect(result[0].id).toBe('edge-1');
      expect(result[0].srcMemoryId).toBe('src-1');
    });
  });

  describe('getEdgesForMemory', () => {
    it('should use v3 column names in fallback query', async () => {
      // Mock RPC failure to trigger fallback
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'RPC not available' },
      });

      // Mock outgoing edges query
      mockSupabase._queryBuilder.gte.mockResolvedValueOnce({
        data: [
          {
            id: 'edge-1',
            src_memory_id: 'memory-123',
            dst_memory_id: 'dst-456',
            edge_type: 'relates_to',
            weight: 0.8,
            confidence: 0.9,
            created_by: 'user-123',
            created_by_system: false,
            created_at: new Date().toISOString(),
            dst: {
              id: 'dst-456',
              content: 'Related content',  // v3 column name
              note_type: 'fact',           // v3 column name
            },
          },
        ],
        error: null,
      });

      // Mock incoming edges query
      mockSupabase._queryBuilder.gte.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await service.getEdgesForMemory('memory-123', {
        direction: 'both',
      });

      // Check that select was called with v3 column names
      const selectCalls = mockSupabase._queryBuilder.select.mock.calls;
      const selectArg = selectCalls[0]?.[0];

      if (selectArg) {
        expect(selectArg).toContain('content');
        expect(selectArg).toContain('note_type');
        expect(selectArg).not.toContain('note,');
        expect(selectArg).not.toContain('type,');
      }

      expect(result).toHaveLength(1);
      expect(result[0].otherMemory.content).toBe('Related content');
      expect(result[0].otherMemory.type).toBe('fact');
    });
  });

  describe('getEdge', () => {
    it('should return edge by ID', async () => {
      mockSupabase._queryBuilder.single.mockResolvedValueOnce({
        data: {
          id: 'edge-123',
          src_memory_id: 'src-1',
          dst_memory_id: 'dst-1',
          edge_type: 'contradicts',
          weight: 0.7,
          reason: 'Conflicting information',
          confidence: 0.85,
          created_by: 'user-123',
          created_by_agent: null,
          created_by_system: true,
          created_at: '2024-01-01T00:00:00Z',
        },
        error: null,
      });

      const result = await service.getEdge('edge-123');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('edge-123');
      expect(result!.edgeType).toBe('contradicts');
      expect(result!.reason).toBe('Conflicting information');
      expect(result!.createdBySystem).toBe(true);
    });

    it('should return null if edge not found', async () => {
      mockSupabase._queryBuilder.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });

      const result = await service.getEdge('invalid-id');

      expect(result).toBeNull();
    });
  });

  describe('updateEdgeWeight', () => {
    it('should update edge weight', async () => {
      mockSupabase._queryBuilder.single.mockResolvedValueOnce({
        data: {
          id: 'edge-123',
          src_memory_id: 'src-1',
          dst_memory_id: 'dst-1',
          edge_type: 'relates_to',
          weight: 0.5, // Updated weight
          confidence: 0.8,
          created_by: 'user-123',
          created_by_system: false,
          created_at: new Date().toISOString(),
        },
        error: null,
      });

      const result = await service.updateEdgeWeight('edge-123', 0.5);

      expect(mockSupabase._queryBuilder.update).toHaveBeenCalledWith({ weight: 0.5 });
      expect(result.weight).toBe(0.5);
    });
  });

  describe('deleteEdge', () => {
    it('should delete edge by ID', async () => {
      mockSupabase._queryBuilder.eq.mockResolvedValueOnce({
        error: null,
      });

      await service.deleteEdge('edge-123');

      expect(mockSupabase.from).toHaveBeenCalledWith('spring_memory_edges');
      expect(mockSupabase._queryBuilder.delete).toHaveBeenCalled();
      expect(mockSupabase._queryBuilder.eq).toHaveBeenCalledWith('id', 'edge-123');
    });

    it('should throw error on delete failure', async () => {
      mockSupabase._queryBuilder.eq.mockResolvedValueOnce({
        error: { message: 'Delete failed' },
      });

      await expect(service.deleteEdge('edge-123')).rejects.toThrow(
        'Failed to delete edge: Delete failed'
      );
    });
  });

  describe('deleteAllEdges', () => {
    it('should delete all edges for a memory', async () => {
      mockSupabase._queryBuilder.or.mockResolvedValueOnce({
        error: null,
        count: 5,
      });

      const result = await service.deleteAllEdges('memory-123');

      expect(mockSupabase._queryBuilder.or).toHaveBeenCalledWith(
        'src_memory_id.eq.memory-123,dst_memory_id.eq.memory-123'
      );
      expect(result).toBe(5);
    });
  });

  describe('getCanonicalMemory', () => {
    it('should call RPC function', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: 'canonical-123',
        error: null,
      });

      const result = await service.getCanonicalMemory('memory-123');

      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_canonical_memory', {
        p_memory_id: 'memory-123',
      });
      expect(result).toBe('canonical-123');
    });

    it('should return same ID on RPC failure (fallback)', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'RPC failed' },
      });

      const result = await service.getCanonicalMemory('memory-123');

      expect(result).toBe('memory-123');
    });
  });

  describe('findContradictions', () => {
    it('should filter by contradicts edge type', async () => {
      // Mock RPC call
      mockSupabase.rpc.mockResolvedValueOnce({
        data: [
          {
            edge_id: 'edge-1',
            other_memory_id: 'contradiction-1',
            edge_type: 'contradicts',
            weight: 0.9,
            confidence: 0.85,
            direction: 'outgoing',
            created_at: new Date().toISOString(),
          },
        ],
        error: null,
      });

      // Mock memory fetch
      mockSupabase._queryBuilder.in.mockResolvedValueOnce({
        data: [
          {
            id: 'contradiction-1',
            content: 'Contradicting statement',
            note_type: 'fact',
          },
        ],
        error: null,
      });

      const result = await service.findContradictions('memory-123');

      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_memory_edges', {
        p_memory_id: 'memory-123',
        p_edge_types: ['contradicts'],
        p_direction: 'both',
      });

      expect(result).toHaveLength(1);
      expect(result[0].edgeType).toBe('contradicts');
    });
  });
});
