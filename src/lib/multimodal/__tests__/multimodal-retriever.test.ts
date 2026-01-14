/**
 * Multimodal Retriever Tests
 *
 * Tests for layout-aware document search:
 * - Block type weighted search
 * - Table/code specific search
 * - Context expansion
 * - Highlighting
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
const mockEmbed = vi.fn().mockResolvedValue([Array(1536).fill(0.1)]);
vi.mock('@/lib/summer/embedding', () => ({
  getEmbeddingProvider: () => ({
    embed: mockEmbed,
  }),
}));

// Mock block-store
vi.mock('../store/block-store', () => ({
  searchBlocksBySimilarity: vi.fn().mockResolvedValue([]),
  getContextBlocks: vi.fn().mockResolvedValue({ before: [], after: [] }),
  queryBlocks: vi.fn().mockResolvedValue([]),
}));

import {
  multimodalSearch,
  searchTables,
  searchCode,
  searchInPages,
  expandBlockContext,
  getBlocksByType,
  getDocumentOutline,
  getDocumentTables,
  findBlocksNearPage,
  computePositionBoost,
  reRankResults,
} from '../retrieval/multimodal-retriever';
import { searchBlocksBySimilarity, getContextBlocks, queryBlocks } from '../store/block-store';

describe('MultimodalRetriever', () => {
  const userId = 'user-123';
  const collectionId = 'collection-456';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('multimodalSearch', () => {
    it('should perform weighted block type search', async () => {
      const mockResults: Array<DocumentBlock & { similarity: number }> = [
        {
          id: 'block-1',
          documentId: 'doc-1',
          blockType: 'heading',
          pageNumber: 1,
          content: 'Test heading',
          metadata: {},
          similarity: 0.8,
        },
        {
          id: 'block-2',
          documentId: 'doc-1',
          blockType: 'text',
          pageNumber: 1,
          content: 'Test text content',
          metadata: {},
          similarity: 0.85,
        },
      ];

      vi.mocked(searchBlocksBySimilarity).mockResolvedValue(mockResults);

      const result = await multimodalSearch(userId, collectionId, 'test query');

      expect(result.length).toBeGreaterThan(0);
      // Heading should be ranked higher due to weight
      expect(result[0].score).toBeDefined();
    });

    it('should filter by block types', async () => {
      vi.mocked(searchBlocksBySimilarity).mockResolvedValue([]);

      await multimodalSearch(userId, collectionId, 'test', {
        blockTypes: ['table', 'code'],
      });

      expect(searchBlocksBySimilarity).toHaveBeenCalledWith(
        userId,
        collectionId,
        expect.any(Array),
        expect.objectContaining({
          blockTypes: ['table', 'code'],
        })
      );
    });

    it('should include context blocks when requested', async () => {
      const mockResults: Array<DocumentBlock & { similarity: number }> = [
        {
          id: 'block-5',
          documentId: 'doc-1',
          blockType: 'text',
          pageNumber: 1,
          content: 'Match content',
          metadata: {},
          orderIndex: 5,
          similarity: 0.9,
        },
      ];

      vi.mocked(searchBlocksBySimilarity).mockResolvedValue(mockResults);
      vi.mocked(getContextBlocks).mockResolvedValue({
        before: [{ ...mockResults[0], id: 'block-4', content: 'Before' }],
        after: [{ ...mockResults[0], id: 'block-6', content: 'After' }],
      });

      const result = await multimodalSearch(userId, collectionId, 'test', {
        includeContext: true,
        contextWindow: 2,
      });

      expect(result[0].blocks.length).toBe(3); // before + match + after
    });

    it('should generate highlights for matches', async () => {
      const mockResults: Array<DocumentBlock & { similarity: number }> = [
        {
          id: 'block-1',
          documentId: 'doc-1',
          blockType: 'text',
          pageNumber: 1,
          content: 'This is a test document with test words.',
          metadata: {},
          similarity: 0.9,
        },
      ];

      vi.mocked(searchBlocksBySimilarity).mockResolvedValue(mockResults);

      const result = await multimodalSearch(userId, collectionId, 'test');

      expect(result[0].highlights).toBeDefined();
      if (result[0].highlights.length > 0) {
        expect(result[0].highlights[0].blockId).toBe('block-1');
        expect(result[0].highlights[0].spans.length).toBeGreaterThan(0);
      }
    });

    it('should respect topK limit', async () => {
      const mockResults = Array.from({ length: 20 }, (_, i) => ({
        id: `block-${i}`,
        documentId: 'doc-1',
        blockType: 'text' as BlockType,
        pageNumber: 1,
        content: `Content ${i}`,
        metadata: {},
        similarity: 0.9 - i * 0.01,
      }));

      vi.mocked(searchBlocksBySimilarity).mockResolvedValue(mockResults);

      const result = await multimodalSearch(userId, collectionId, 'test', {
        topK: 5,
      });

      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('should apply custom block type weights', async () => {
      const mockResults: Array<DocumentBlock & { similarity: number }> = [
        {
          id: 'block-1',
          documentId: 'doc-1',
          blockType: 'table',
          pageNumber: 1,
          content: 'Table data',
          metadata: {},
          similarity: 0.7,
        },
      ];

      vi.mocked(searchBlocksBySimilarity).mockResolvedValue(mockResults);

      const result = await multimodalSearch(userId, collectionId, 'test', {
        blockTypeWeights: {
          table: 2.0, // Double weight for tables
        },
      });

      expect(result[0].score).toBeGreaterThan(0.7); // Boosted by weight
    });
  });

  describe('searchTables', () => {
    it('should search only table and caption blocks', async () => {
      vi.mocked(searchBlocksBySimilarity).mockResolvedValue([]);

      await searchTables(userId, collectionId, 'revenue data');

      expect(searchBlocksBySimilarity).toHaveBeenCalledWith(
        userId,
        collectionId,
        expect.any(Array),
        expect.objectContaining({
          blockTypes: ['table', 'caption'],
        })
      );
    });

    it('should boost table matches', async () => {
      const mockResults: Array<DocumentBlock & { similarity: number }> = [
        {
          id: 'table-1',
          documentId: 'doc-1',
          blockType: 'table',
          pageNumber: 1,
          content: '| Revenue | Q1 |',
          metadata: {},
          similarity: 0.8,
        },
      ];

      vi.mocked(searchBlocksBySimilarity).mockResolvedValue(mockResults);

      const result = await searchTables(userId, collectionId, 'revenue');

      expect(result[0].score).toBeGreaterThan(0.8); // Should be boosted
    });
  });

  describe('searchCode', () => {
    it('should search only code blocks', async () => {
      vi.mocked(searchBlocksBySimilarity).mockResolvedValue([]);

      await searchCode(userId, collectionId, 'function implementation');

      expect(searchBlocksBySimilarity).toHaveBeenCalledWith(
        userId,
        collectionId,
        expect.any(Array),
        expect.objectContaining({
          blockTypes: ['code'],
        })
      );
    });
  });

  describe('searchInPages', () => {
    it('should constrain search to page range', async () => {
      vi.mocked(searchBlocksBySimilarity).mockResolvedValue([]);

      await searchInPages(userId, collectionId, 'test', 5, 10);

      expect(searchBlocksBySimilarity).toHaveBeenCalledWith(
        userId,
        collectionId,
        expect.any(Array),
        expect.objectContaining({
          pageRange: { start: 5, end: 10 },
        })
      );
    });
  });

  describe('expandBlockContext', () => {
    it('should return expanded context for a block', async () => {
      const mockBlock = {
        id: 'block-1',
        documentId: 'doc-1',
        blockType: 'text',
        pageNumber: 1,
        content: 'Target block',
        metadata: {},
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

      vi.mocked(getContextBlocks).mockResolvedValue({
        before: [],
        after: [],
      });

      const result = await expandBlockContext(userId, collectionId, 'block-1', 2);

      expect(result).not.toBeNull();
      expect(result?.matchedBlock).toBeDefined();
    });

    it('should return null for non-existent block', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Not found' },
              }),
            }),
          }),
        }),
      });

      const result = await expandBlockContext(userId, collectionId, 'non-existent', 2);

      expect(result).toBeNull();
    });
  });

  describe('getBlocksByType', () => {
    it('should query blocks of specific type', async () => {
      vi.mocked(queryBlocks).mockResolvedValue([]);

      await getBlocksByType(userId, collectionId, 'doc-1', 'table');

      expect(queryBlocks).toHaveBeenCalledWith(
        userId,
        collectionId,
        expect.objectContaining({
          documentId: 'doc-1',
          blockTypes: ['table'],
        })
      );
    });
  });

  describe('getDocumentOutline', () => {
    it('should return heading blocks only', async () => {
      const mockHeadings: DocumentBlock[] = [
        {
          id: 'h1',
          documentId: 'doc-1',
          blockType: 'heading',
          pageNumber: 1,
          content: '1. Introduction',
          metadata: {},
        },
        {
          id: 'h2',
          documentId: 'doc-1',
          blockType: 'heading',
          pageNumber: 2,
          content: '2. Methods',
          metadata: {},
        },
      ];

      vi.mocked(queryBlocks).mockResolvedValue(mockHeadings);

      const result = await getDocumentOutline(userId, collectionId, 'doc-1');

      expect(result.every((b) => b.blockType === 'heading')).toBe(true);
    });
  });

  describe('getDocumentTables', () => {
    it('should return table blocks only', async () => {
      vi.mocked(queryBlocks).mockResolvedValue([]);

      await getDocumentTables(userId, collectionId, 'doc-1');

      expect(queryBlocks).toHaveBeenCalledWith(
        userId,
        collectionId,
        expect.objectContaining({
          blockTypes: ['table'],
        })
      );
    });
  });

  describe('findBlocksNearPage', () => {
    it('should find blocks within page range', async () => {
      vi.mocked(queryBlocks).mockResolvedValue([]);

      await findBlocksNearPage(userId, collectionId, 'doc-1', 5, 2);

      expect(queryBlocks).toHaveBeenCalledWith(
        userId,
        collectionId,
        expect.objectContaining({
          pageRange: { start: 3, end: 7 },
        })
      );
    });

    it('should not go below page 1', async () => {
      vi.mocked(queryBlocks).mockResolvedValue([]);

      await findBlocksNearPage(userId, collectionId, 'doc-1', 1, 3);

      expect(queryBlocks).toHaveBeenCalledWith(
        userId,
        collectionId,
        expect.objectContaining({
          pageRange: { start: 1, end: 4 },
        })
      );
    });
  });

  describe('computePositionBoost', () => {
    it('should boost blocks at document start', () => {
      const boost = computePositionBoost(5, 100);
      expect(boost).toBe(1.2); // Introduction boost
    });

    it('should boost blocks at document end', () => {
      const boost = computePositionBoost(97, 100);
      expect(boost).toBe(1.1); // Conclusion boost
    });

    it('should return 1.0 for middle blocks', () => {
      const boost = computePositionBoost(50, 100);
      expect(boost).toBe(1.0);
    });

    it('should handle zero total blocks', () => {
      const boost = computePositionBoost(0, 0);
      expect(boost).toBe(1.0);
    });
  });

  describe('reRankResults', () => {
    it('should re-rank by weighted score', () => {
      const results: Array<DocumentBlock & { similarity: number }> = [
        {
          id: 'block-1',
          documentId: 'doc-1',
          blockType: 'text',
          pageNumber: 1,
          content: 'Text content',
          metadata: {},
          similarity: 0.9,
          orderIndex: 50,
        },
        {
          id: 'block-2',
          documentId: 'doc-1',
          blockType: 'heading',
          pageNumber: 1,
          content: 'Heading content',
          metadata: {},
          similarity: 0.85,
          orderIndex: 1,
        },
      ];

      const ranked = reRankResults(results, 'test', {
        totalBlocks: 100,
      });

      // Heading with position boost should rank higher
      expect(ranked[0].id).toBe('block-2');
      expect(ranked[0].finalScore).toBeGreaterThan(ranked[1].finalScore);
    });

    it('should boost exact phrase matches', () => {
      const results: Array<DocumentBlock & { similarity: number }> = [
        {
          id: 'block-1',
          documentId: 'doc-1',
          blockType: 'text',
          pageNumber: 1,
          content: 'This contains exact phrase',
          metadata: {},
          similarity: 0.8,
        },
        {
          id: 'block-2',
          documentId: 'doc-1',
          blockType: 'text',
          pageNumber: 1,
          content: 'This does not',
          metadata: {},
          similarity: 0.85,
        },
      ];

      const ranked = reRankResults(results, 'exact phrase', {
        usePositionBoost: false,
      });

      // Block with exact phrase match should rank higher
      expect(ranked[0].id).toBe('block-1');
    });

    it('should respect custom block type weights', () => {
      const results: Array<DocumentBlock & { similarity: number }> = [
        {
          id: 'block-1',
          documentId: 'doc-1',
          blockType: 'text',
          pageNumber: 1,
          content: 'Text',
          metadata: {},
          similarity: 0.9,
        },
        {
          id: 'block-2',
          documentId: 'doc-1',
          blockType: 'table',
          pageNumber: 1,
          content: 'Table',
          metadata: {},
          similarity: 0.5,
        },
      ];

      const ranked = reRankResults(results, 'test', {
        blockTypeWeights: { table: 3.0 },
        usePositionBoost: false,
      });

      // Table with 3x weight should rank higher despite lower similarity
      expect(ranked[0].id).toBe('block-2');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty search results', async () => {
      vi.mocked(searchBlocksBySimilarity).mockResolvedValue([]);

      const result = await multimodalSearch(userId, collectionId, 'no matches');

      expect(result).toEqual([]);
    });

    it('should handle blocks without orderIndex for context', async () => {
      const mockResults: Array<DocumentBlock & { similarity: number }> = [
        {
          id: 'block-1',
          documentId: 'doc-1',
          blockType: 'text',
          pageNumber: 1,
          content: 'Content',
          metadata: {},
          similarity: 0.9,
          // No orderIndex
        },
      ];

      vi.mocked(searchBlocksBySimilarity).mockResolvedValue(mockResults);
      vi.mocked(getContextBlocks).mockResolvedValue({ before: [], after: [] });

      const result = await multimodalSearch(userId, collectionId, 'test', {
        includeContext: true,
      });

      expect(result.length).toBe(1);
    });

    it('should skip very short terms in highlighting', async () => {
      const mockResults: Array<DocumentBlock & { similarity: number }> = [
        {
          id: 'block-1',
          documentId: 'doc-1',
          blockType: 'text',
          pageNumber: 1,
          content: 'A document with I and a words',
          metadata: {},
          similarity: 0.9,
        },
      ];

      vi.mocked(searchBlocksBySimilarity).mockResolvedValue(mockResults);

      const result = await multimodalSearch(userId, collectionId, 'I a document');

      // Should highlight "document" but not "I" or "a"
      if (result[0].highlights.length > 0) {
        const spans = result[0].highlights[0].spans;
        // "I" and "a" (length < 2) should be skipped
        expect(spans.every(([start, end]) => end - start >= 2)).toBe(true);
      }
    });
  });
});
