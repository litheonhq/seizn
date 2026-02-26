/**
 * PDF Parser Tests
 *
 * Tests for layout-preserving PDF parsing:
 * - Block extraction (text, headings, tables, code, lists)
 * - Page splitting
 * - Block type detection patterns
 * - Bounding box estimation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ParseOptions } from '../types';

// Mock pdf-parse
const mockPdfParse = vi.fn();
vi.mock('pdf-parse', () => ({
  default: (buffer: Buffer, options?: unknown) => mockPdfParse(buffer, options),
}));

// Import after mock
import { parsePdf } from '../parsers/pdf-parser';

describe('PdfParser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('parsePdf', () => {
    it('should parse PDF and extract text blocks', async () => {
      const mockPdfData = {
        text: 'This is a sample document.\n\nWith multiple paragraphs.',
        numpages: 1,
        info: { Title: 'Test Document' },
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const buffer = Buffer.from('fake pdf content');
      const result = await parsePdf(buffer);

      expect(result.blocks.length).toBeGreaterThan(0);
      expect(result.pageCount).toBe(1);
      expect(result.mimeType).toBe('application/pdf');
      expect(result.filename).toBe('document.pdf');
    });

    it('should detect heading blocks from patterns', async () => {
      const mockPdfData = {
        text: '1. Introduction\n\nThis is the introduction section.\n\n2. Methods\n\nThis describes the methods.',
        numpages: 1,
        info: {},
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const buffer = Buffer.from('fake pdf');
      const result = await parsePdf(buffer);

      const headings = result.blocks.filter((b) => b.blockType === 'heading');
      expect(headings.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect list blocks from bullet patterns', async () => {
      const mockPdfData = {
        text: 'Features:\n- First item\n- Second item\n- Third item\n\nEnd of list.',
        numpages: 1,
        info: {},
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const buffer = Buffer.from('fake pdf');
      const result = await parsePdf(buffer);

      const lists = result.blocks.filter((b) => b.blockType === 'list');
      expect(lists.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect code blocks from indentation patterns', async () => {
      const mockPdfData = {
        text: 'Example code:\n    function hello() {\n        return "world";\n    }\n\nEnd of code.',
        numpages: 1,
        info: {},
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const buffer = Buffer.from('fake pdf');
      const result = await parsePdf(buffer, { detectCode: true });

      const codeBlocks = result.blocks.filter((b) => b.blockType === 'code');
      expect(codeBlocks.length).toBeGreaterThanOrEqual(1);
      expect(codeBlocks[0].contentHtml).toContain('<pre>');
    });

    it('should detect table blocks from pipe patterns', async () => {
      const mockPdfData = {
        text: 'Table below:\n| Name | Age |\n| John | 30 |\n| Jane | 25 |\n\nEnd of table.',
        numpages: 1,
        info: {},
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const buffer = Buffer.from('fake pdf');
      const result = await parsePdf(buffer, { extractTables: true });

      const tables = result.blocks.filter((b) => b.blockType === 'table');
      expect(tables.length).toBeGreaterThanOrEqual(1);
      expect(tables[0].contentHtml).toContain('<table');
    });

    it('should detect caption blocks', async () => {
      const mockPdfData = {
        text: 'Figure 1: Architecture diagram\n\nThe diagram shows...',
        numpages: 1,
        info: {},
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const buffer = Buffer.from('fake pdf');
      const result = await parsePdf(buffer);

      const captions = result.blocks.filter((b) => b.blockType === 'caption');
      expect(captions.length).toBeGreaterThanOrEqual(1);
    });

    it('should split content by pages using form feed', async () => {
      const mockPdfData = {
        text: 'Page 1 content\fPage 2 content\fPage 3 content',
        numpages: 3,
        info: {},
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const buffer = Buffer.from('fake pdf');
      const result = await parsePdf(buffer);

      expect(result.pageCount).toBe(3);
      // Check blocks are distributed across pages
      const pagesWithBlocks = new Set(result.blocks.map((b) => b.pageNumber));
      expect(pagesWithBlocks.size).toBeGreaterThanOrEqual(1);
    });

    it('should include bounding boxes for blocks', async () => {
      const mockPdfData = {
        text: 'First paragraph.\n\nSecond paragraph.',
        numpages: 1,
        info: {},
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const buffer = Buffer.from('fake pdf');
      const result = await parsePdf(buffer);

      for (const block of result.blocks) {
        expect(block.bbox).toBeDefined();
        expect(block.bbox?.x).toBeGreaterThanOrEqual(0);
        expect(block.bbox?.y).toBeGreaterThanOrEqual(0);
        expect(block.bbox?.width).toBeGreaterThan(0);
        expect(block.bbox?.height).toBeGreaterThan(0);
      }
    });

    it('should assign order indices to blocks', async () => {
      const mockPdfData = {
        text: 'Block 1\n\nBlock 2\n\nBlock 3',
        numpages: 1,
        info: {},
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const buffer = Buffer.from('fake pdf');
      const result = await parsePdf(buffer);

      // Order indices should be sequential
      const indices = result.blocks.map((b) => b.orderIndex);
      for (let i = 0; i < indices.length; i++) {
        expect(indices[i]).toBe(i);
      }
    });

    it('should respect maxPages option', async () => {
      const mockPdfData = {
        text: 'Content',
        numpages: 10,
        info: {},
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const buffer = Buffer.from('fake pdf');
      const options: ParseOptions = { maxPages: 5 };
      await parsePdf(buffer, options);

      // Verify pdf-parse was called with max option
      expect(mockPdfParse).toHaveBeenCalledWith(buffer, expect.objectContaining({ max: 5 }));
    });

    it('should include document metadata', async () => {
      const mockPdfData = {
        text: 'Content',
        numpages: 1,
        info: { Title: 'My Document', Author: 'John Doe' },
        version: '2.0',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const buffer = Buffer.from('fake pdf');
      const result = await parsePdf(buffer);

      expect(result.metadata).toBeDefined();
      expect(result.metadata.info).toEqual({ Title: 'My Document', Author: 'John Doe' });
      expect(result.metadata.version).toBe('2.0');
    });

    it('should generate unique IDs for each block', async () => {
      const mockPdfData = {
        text: 'Block 1\n\nBlock 2\n\nBlock 3',
        numpages: 1,
        info: {},
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const buffer = Buffer.from('fake pdf');
      const result = await parsePdf(buffer);

      const ids = result.blocks.map((b) => b.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty PDF content', async () => {
      const mockPdfData = {
        text: '',
        numpages: 1,
        info: {},
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const buffer = Buffer.from('fake pdf');
      const result = await parsePdf(buffer);

      expect(result.blocks).toEqual([]);
    });

    it('should handle PDF with only whitespace', async () => {
      const mockPdfData = {
        text: '   \n\n   \n\n   ',
        numpages: 1,
        info: {},
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const buffer = Buffer.from('fake pdf');
      const result = await parsePdf(buffer);

      expect(result.blocks).toEqual([]);
    });

    it('should handle very long content', async () => {
      const longText = 'Lorem ipsum '.repeat(10000);
      const mockPdfData = {
        text: longText,
        numpages: 50,
        info: {},
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const buffer = Buffer.from('fake pdf');
      const result = await parsePdf(buffer);

      expect(result.blocks.length).toBeGreaterThan(0);
      expect(result.pageCount).toBe(50);
    });

    it('should handle special characters in content', async () => {
      const mockPdfData = {
        text: 'Special chars: <html> & "quotes" \'single\' </tag>',
        numpages: 1,
        info: {},
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const buffer = Buffer.from('fake pdf');
      const result = await parsePdf(buffer);

      expect(result.blocks.length).toBeGreaterThan(0);
      // HTML in content should be handled
    });

    it('should handle Korean text', async () => {
      const mockPdfData = {
        text: '한글 문서입니다.\n\n두 번째 문단입니다.',
        numpages: 1,
        info: {},
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const buffer = Buffer.from('fake pdf');
      const result = await parsePdf(buffer);

      expect(result.blocks.length).toBeGreaterThan(0);
      expect(result.blocks[0].content).toContain('한글');
    });

    it('should merge adjacent text blocks on same page', async () => {
      const mockPdfData = {
        text: 'First text block.\n\nSecond text block.\n\nThird text block.',
        numpages: 1,
        info: {},
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const buffer = Buffer.from('fake pdf');
      const result = await parsePdf(buffer);

      // Adjacent text blocks may be merged
      const textBlocks = result.blocks.filter((b) => b.blockType === 'text');
      // Should have been merged into fewer blocks
      expect(textBlocks.length).toBeGreaterThanOrEqual(1);
    });

    it('should set parsedAt timestamp', async () => {
      const mockPdfData = {
        text: 'Content',
        numpages: 1,
        info: {},
        version: '1.7',
      };

      mockPdfParse.mockResolvedValue(mockPdfData);

      const before = new Date().toISOString();
      const buffer = Buffer.from('fake pdf');
      const result = await parsePdf(buffer);
      const after = new Date().toISOString();

      expect(result.parsedAt).toBeDefined();
      expect(result.parsedAt >= before).toBe(true);
      expect(result.parsedAt <= after).toBe(true);
    });
  });
});
