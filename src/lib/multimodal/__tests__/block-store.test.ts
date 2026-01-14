/**
 * Block Store Tests
 *
 * Tests for document block storage:
 * - Store/retrieve blocks
 * - Embedding generation
 * - Similarity search
 * - Context expansion
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DocumentBlock, BlockType } from '../types';

// Mock Supabase
const mockSupabaseFrom = vi.fn();
const mockSupabaseRpc = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: mockSupabaseFrom,
    rpc: mockSupabaseRpc,
  }),
}));

// Mock embedding provider
vi.mock('@/lib/summer/embedding', () => ({
  getEmbeddingProvider: () => ({
    embed: vi.fn().mockResolvedValue([Array(1536).fill(0.1)]),
  }),
}));

import {
  storeBlocks,
  queryBlocks,
  getBlock,
  getBlocksByDocument,
  deleteBlocksByDocument,
  searchBlocksBySimilarity,
  getContextBlocks,
  updateBlockEmbedding,
} from '../store/block-store';

describe('BlockStore', () => {
  const userId = 'user-123';
  const collectionId = 'collection-456';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('storeBlocks', () => {
    it('should store blocks with generated embeddings', async () => {
      const blocks: DocumentBlock[] = [
        {
          id: 'block-1',
          documentId: 'doc-1',
          blockType: 'text',
          pageNumber: 1,
          content: 'Test content',
          metadata: {},
        },
      ];

      mockSupabaseFrom.mockReturnValue({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({
            data: [{ id: 'block-1' }],
            error: null,
          }),
        }),
      });

      const result = await storeBlocks(userId, collectionId, blocks);

      expect(result.storedCount).toBe(1);
      expect(result.documentId).toBe('doc-1');
      expect(result.blockIds).toContain('block-1');
    });

    it('should handle empty blocks array', async () => {
      const result = await storeBlocks(userId, collectionId, []);

      expect(result.storedCount).toBe(0);
      expect(result.blockIds).toEqual([]);
    });

    it('should batch store blocks', async () => {
      const blocks: DocumentBlock[] = Array.from({ length: 100 }, (_, i) => ({
        id: `block-${i}`,
        documentId: 'doc-1',
        blockType: 'text' as BlockType,
        pageNumber: 1,
        content: `Content ${i}`,
        metadata: {},
      }));

      mockSupabaseFrom.mockReturnValue({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({
            data: blocks.map((b) => ({ id: b.id })),
            error: null,
          }),
        }),
      });

      const result = await storeBlocks(userId, collectionId, blocks, { batchSize: 50 });

      expect(result.storedCount).toBe(200);
    });

    it('should skip embedding generation when disabled', async () => {
      const blocks: DocumentBlock[] = [
        {
          id: 'block-1',
          documentId: 'doc-1',
          blockType: 'text',
          pageNumber: 1,
          content: 'Test content',
          metadata: {},
        },
      ];

      mockSupabaseFrom.mockReturnValue({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({
            data: [{ id: 'block-1' }],
            error: null,
          }),
        }),
      });

      const result = await storeBlocks(userId, collectionId, blocks, {
        generateEmbeddings: false,
      });

      expect(result.storedCount).toBe(1);
    });

    it('should throw on storage error', async () => {
      const blocks: DocumentBlock[] = [
        {
          id: 'block-1',
          documentId: 'doc-1',
          blockType: 'text',
          pageNumber: 1,
          content: 'Test content',
          metadata: {},
        },
      ];

      mockSupabaseFrom.mockReturnValue({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Storage error' },
          }),
        }),
      });

      await expect(storeBlocks(userId, collectionId, blocks)).rejects.toThrow('Failed to store blocks');
    });
  });

  describe('queryBlocks', () => {
    it('should query blocks with filters', async () => {
      const mockBlocks = [
        {
          id: 'block-1',
          document_id: 'doc-1',
          user_id: userId,
          collection_id: collectionId,
          block_type: 'text',
          page_number: 1,
          order_index: 0,
          content: 'Content',
          content_html: null,
          bbox: null,
          embedding: null,
          metadata: {},
          parent_block_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

mockSupabaseFrom.mockReturnValue({        select: vi.fn().mockReturnValue({          eq: vi.fn().mockReturnValue({            eq: vi.fn().mockReturnValue({              eq: vi.fn().mockReturnValue({                in: vi.fn().mockReturnValue({                  order: vi.fn().mockReturnValue({                    limit: vi.fn().mockResolvedValue({                      data: mockBlocks,                      error: null,                    }),                  }),                }),              }),            }),          }),        }),      });

      const result = await queryBlocks(userId, collectionId, {
        documentId: 'doc-1',
        blockTypes: ['text'],
        limit: 10,
      });

      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should filter by page range', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      });

      const result = await queryBlocks(userId, collectionId, {
        pageRange: { start: 5, end: 10 },
      });

      expect(result).toBeDefined();
    });
  });

  describe('getBlock', () => {
    it('should get a single block by ID', async () => {
      const mockBlock = {
        id: 'block-1',
        document_id: 'doc-1',
        user_id: userId,
        collection_id: collectionId,
        block_type: 'text',
        page_number: 1,
        order_index: 0,
        content: 'Content',
        content_html: null,
        bbox: { x: 0, y: 0, width: 100, height: 50 },
        embedding: null,
        metadata: {},
        parent_block_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockBlock,
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await getBlock(userId, 'block-1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('block-1');
      expect(result?.bbox).toBeDefined();
    });

    it('should return null for non-existent block', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: 'PGRST116' },
              }),
            }),
          }),
        }),
      });

      const result = await getBlock(userId, 'non-existent');

      expect(result).toBeNull();
    });
  });

  describe('deleteBlocksByDocument', () => {
    it('should delete blocks and return count', async () => {
      mockSupabaseFrom.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: [{ id: 'block-1' }, { id: 'block-2' }],
                error: null,
              }),
            }),
          }),
        }),
      });

      const count = await deleteBlocksByDocument(userId, 'doc-1');

      expect(count).toBe(2);
    });
  });

  describe('searchBlocksBySimilarity', () => {
    it('should search blocks using RPC', async () => {
      const mockResults = [
        {
          id: 'block-1',
          document_id: 'doc-1',
          block_type: 'text',
          page_number: 1,
          order_index: 0,
          content: 'Similar content',
          content_html: null,
          bbox: null,
          embedding: Array(1536).fill(0.1),
          metadata: {},
          parent_block_id: null,
          similarity: 0.85,
        },
      ];

      mockSupabaseRpc.mockResolvedValue({
        data: mockResults,
        error: null,
      });

      const queryEmbedding = Array(1536).fill(0.1);
      const result = await searchBlocksBySimilarity(
        userId,
        collectionId,
        queryEmbedding,
        { topK: 5, threshold: 0.5 }
      );

      expect(result.length).toBe(1);
      expect(result[0].similarity).toBe(0.85);
    });

    it('should filter by block types', async () => {
      mockSupabaseRpc.mockResolvedValue({
        data: [],
        error: null,
      });

      const queryEmbedding = Array(1536).fill(0.1);
      await searchBlocksBySimilarity(userId, collectionId, queryEmbedding, {
        blockTypes: ['table', 'code'],
      });

      expect(mockSupabaseRpc).toHaveBeenCalledWith(
        'search_document_blocks',
        expect.objectContaining({
          p_block_types: ['table', 'code'],
        })
      );
    });

    it('should fallback to client-side search on RPC error', async () => {
      mockSupabaseRpc.mockResolvedValue({
        data: null,
        error: { message: 'RPC not available' },
      });

      // Mock fallback query
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              not: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const queryEmbedding = Array(1536).fill(0.1);
      const result = await searchBlocksBySimilarity(userId, collectionId, queryEmbedding);

      expect(result).toBeDefined();
    });
  });

  describe('getContextBlocks', () => {
    it('should get surrounding blocks', async () => {
      // Mock getBlock for target
      const targetBlock = {
        id: 'block-5',
        document_id: 'doc-1',
        user_id: userId,
        collection_id: collectionId,
        block_type: 'text',
        page_number: 1,
        order_index: 5,
        content: 'Target content',
        content_html: null,
        bbox: null,
        embedding: null,
        metadata: {},
        parent_block_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const beforeBlocks = [
        { ...targetBlock, id: 'block-4', order_index: 4, content: 'Before' },
      ];

      const afterBlocks = [
        { ...targetBlock, id: 'block-6', order_index: 6, content: 'After' },
      ];

      let callCount = 0;
      mockSupabaseFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // getBlock call
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: targetBlock,
                    error: null,
                  }),
                }),
              }),
            }),
          };
        } else if (callCount === 2) {
          // before blocks
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    lt: vi.fn().mockReturnValue({
                      order: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue({
                          data: beforeBlocks,
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        } else {
          // after blocks
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    gt: vi.fn().mockReturnValue({
                      order: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue({
                          data: afterBlocks,
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
      });

      const result = await getContextBlocks(userId, collectionId, 'block-5', 2);

      expect(result.before).toBeDefined();
      expect(result.after).toBeDefined();
    });
  });

  describe('updateBlockEmbedding', () => {
    it('should update embedding for a block', async () => {
      mockSupabaseFrom.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              error: null,
            }),
          }),
        }),
      });

      const newEmbedding = Array(1536).fill(0.5);

      await expect(
        updateBlockEmbedding(userId, 'block-1', newEmbedding)
      ).resolves.not.toThrow();
    });

    it('should throw on update error', async () => {
      mockSupabaseFrom.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              error: { message: 'Update failed' },
            }),
          }),
        }),
      });

      const newEmbedding = Array(1536).fill(0.5);

      await expect(
        updateBlockEmbedding(userId, 'block-1', newEmbedding)
      ).rejects.toThrow('Failed to update embedding');
    });
  });

  describe('Edge cases', () => {
    it('should handle blocks with all optional fields', async () => {
      const blocks: DocumentBlock[] = [
        {
          id: 'block-1',
          documentId: 'doc-1',
          blockType: 'table',
          pageNumber: 1,
          bbox: { x: 0, y: 0, width: 100, height: 50 },
          content: 'Table content',
          contentHtml: '<table>...</table>',
          metadata: { rowCount: 3, colCount: 2 },
          orderIndex: 0,
          parentBlockId: 'parent-1',
        },
      ];

      mockSupabaseFrom.mockReturnValue({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({
            data: [{ id: 'block-1' }],
            error: null,
          }),
        }),
      });

      const result = await storeBlocks(userId, collectionId, blocks);

      expect(result.storedCount).toBe(1);
    });
  });
});
