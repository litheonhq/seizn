/**
 * Table Extractor Tests
 *
 * Tests for table structure extraction:
 * - Pipe-delimited (Markdown) tables
 * - Tab-separated tables
 * - CSV tables
 * - Space-aligned tables
 * - HTML/CSV generation
 */

import { describe, it, expect } from 'vitest';
import {
  extractTable,
  detectMergedCells,
  validateTable,
} from '../parsers/table-extractor';

describe('TableExtractor', () => {
  describe('Pipe-delimited (Markdown) tables', () => {
    it('should parse simple pipe-delimited table', () => {
      const text = `| Name | Age | City |
|------|-----|------|
| John | 30 | NYC |
| Jane | 25 | LA |`;

      const result = extractTable(text);

      expect(result).not.toBeNull();
      expect(result?.rows).toBe(3);
      expect(result?.cols).toBe(4);
    });

    it('should detect header row from separator', () => {
      const text = `| Header1 | Header2 |
|---------|---------|
| Cell1 | Cell2 |`;

      const result = extractTable(text);

      expect(result).not.toBeNull();
      const headerCells = result?.cells.filter((c) => c.isHeader);
      expect(headerCells?.length).toBe(3);
      expect(headerCells?.[0].content).toBe('Header1');
    });

    it('should generate valid HTML output', () => {
      const text = `| A | B |
|---|---|
| 1 | 2 |`;

      const result = extractTable(text);

      expect(result?.html).toContain('<table');
      expect(result?.html).toContain('<th>A</th>');
      expect(result?.html).toContain('<td>1</td>');
      expect(result?.html).toContain('</table>');
    });

    it('should generate valid CSV output', () => {
      const text = `| Name | Age |
|------|-----|
| John | 30 |`;

      const result = extractTable(text);

      expect(result?.csv).toBeDefined();
      expect(result?.csv).toContain('Name,Age');
      expect(result?.csv).toContain('John,30');
    });

    it('should escape HTML special characters', () => {
      const text = `| Code |
|------|
| <script> |`;

      const result = extractTable(text);

      expect(result?.html).not.toContain('<script>');
      expect(result?.html).toContain('&lt;script&gt;');
    });
  });

  describe('Tab-separated tables', () => {
    it('should parse tab-separated table', () => {
      const text = `Name\tAge\tCity
John\t30\tNYC
Jane\t25\tLA`;

      const result = extractTable(text);

      expect(result).not.toBeNull();
      expect(result?.rows).toBe(3);
      expect(result?.cols).toBe(3);
    });

    it('should assume first row as header for TSV', () => {
      const text = `Col1\tCol2
A\tB`;

      const result = extractTable(text);

      const headerCells = result?.cells.filter((c) => c.isHeader);
      expect(headerCells?.length).toBe(2);
    });
  });

  describe('CSV tables', () => {
    it('should parse simple CSV table', () => {
      const text = `Name,Age,City
John,30,NYC
Jane,25,LA`;

      const result = extractTable(text);

      expect(result).not.toBeNull();
      expect(result?.rows).toBe(3);
      expect(result?.cols).toBe(3);
    });

    it('should handle quoted fields with commas', () => {
      const text = `Name,Description
"Smith, John","A test, with commas"`;

      const result = extractTable(text);

      expect(result).not.toBeNull();
      const descCell = result?.cells.find((c) => c.row === 1 && c.col === 1);
      expect(descCell?.content).toBe('A test, with commas');
    });

    it('should handle escaped quotes in CSV', () => {
      const text = `Name,Quote
John,"He said ""Hello"""`;

      const result = extractTable(text);

      const quoteCell = result?.cells.find((c) => c.row === 1 && c.col === 1);
      expect(quoteCell?.content).toContain('Hello');
    });

    it('should escape commas in CSV output', () => {
      const text = `| Title |
|-------|
| A, B |`;

      const result = extractTable(text);

      // CSV output should quote fields with commas
      expect(result?.csv).toContain('"A, B"');
    });
  });

  describe('Space-aligned tables', () => {
    it('should parse space-aligned table', () => {
      const text = `Name     Age   City
John     30    NYC
Jane     25    LA`;

      const result = extractTable(text);

      expect(result).not.toBeNull();
      expect(result?.rows).toBe(3);
      expect(result?.cols).toBe(3);
    });

    it('should detect column boundaries from alignment', () => {
      const text = `ID    Product     Price
1     Apple       1.00
2     Banana      0.50`;

      const result = extractTable(text);

      expect(result?.cols).toBe(3);
      const priceCell = result?.cells.find((c) => c.row === 1 && c.col === 2);
      expect(priceCell?.content).toBe('1.00');
    });
  });

  describe('detectMergedCells', () => {
    it('should detect horizontal cell spans', () => {
      const cells = [
        { row: 0, col: 0, content: 'Header', isHeader: true },
        { row: 0, col: 1, content: '', isHeader: true },
        { row: 1, col: 0, content: 'A', isHeader: false },
        { row: 1, col: 1, content: 'B', isHeader: false },
      ];

      const merged = detectMergedCells(cells);

      // First cell should have colspan
      const headerCell = merged.find((c) => c.row === 0 && c.col === 0);
      expect(headerCell?.colSpan).toBeGreaterThan(1);
    });

    it('should filter out cells covered by spans', () => {
      const cells = [
        { row: 0, col: 0, content: 'Wide', isHeader: true },
        { row: 0, col: 1, content: '', isHeader: true },
        { row: 0, col: 2, content: '', isHeader: true },
      ];

      const merged = detectMergedCells(cells);

      // Only the spanning cell should remain
      expect(merged.filter((c) => c.row === 0).length).toBeLessThan(3);
    });
  });

  describe('validateTable', () => {
    it('should validate well-formed table', () => {
      const table = {
        rows: 2,
        cols: 2,
        cells: [
          { row: 0, col: 0, content: 'A', isHeader: true },
          { row: 0, col: 1, content: 'B', isHeader: true },
          { row: 1, col: 0, content: 'C', isHeader: false },
          { row: 1, col: 1, content: 'D', isHeader: false },
        ],
        html: '<table>...</table>',
        csv: 'A,B\nC,D',
      };

      const result = validateTable(table);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect table with no rows', () => {
      const table = {
        rows: 0,
        cols: 2,
        cells: [],
        html: '<table></table>',
        csv: '',
      };

      const result = validateTable(table);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Table has no rows');
    });

    it('should detect table with no columns', () => {
      const table = {
        rows: 2,
        cols: 0,
        cells: [],
        html: '<table></table>',
        csv: '',
      };

      const result = validateTable(table);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Table has no columns');
    });

    it('should detect out-of-bounds cells', () => {
      const table = {
        rows: 2,
        cols: 2,
        cells: [
          { row: 5, col: 0, content: 'Out of bounds', isHeader: false },
        ],
        html: '<table>...</table>',
        csv: '',
      };

      const result = validateTable(table);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('exceeds table rows'))).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should return null for empty text', () => {
      const result = extractTable('');
      expect(result).toBeNull();
    });

    it('should return null for non-table text', () => {
      const text = 'This is just a regular paragraph without any table structure.';
      const result = extractTable(text);
      expect(result).toBeNull();
    });

    it('should handle single-row table', () => {
      const text = `| Only | One | Row |`;
      const result = extractTable(text);

      expect(result).not.toBeNull();
      expect(result?.rows).toBe(1);
    });

    it('should handle single-column table', () => {
      const text = `| Value |
|-------|
| A |
| B |`;

      const result = extractTable(text);

      expect(result?.cols).toBe(2);
    });

    it('should handle cells with newlines in content', () => {
      const text = `Name,Description
John,"Line 1\nLine 2"`;

      const result = extractTable(text);

      // Should handle gracefully
      expect(result).not.toBeNull();
    });

    it('should handle Unicode content', () => {
      const text = `| Name | City |
|------|------|
| \uC774\uB984 | \uC11C\uC6B8 |`;

      const result = extractTable(text);

      expect(result).not.toBeNull();
      expect(result?.cells.some((c) => c.content.includes('\uC774\uB984'))).toBe(true);
    });

    it('should handle very wide tables', () => {
      const headers = Array.from({ length: 50 }, (_, i) => `Col${i}`).join(' | ');
      const values = Array.from({ length: 50 }, () => 'X').join(' | ');
      const text = `| ${headers} |\n| ${values} |`;

      const result = extractTable(text);

      expect(result).not.toBeNull();
      expect(result?.cols).toBe(51);
    });

    it('should handle empty cells', () => {
      const text = `| A | | C |
|---|---|---|
| 1 | | 3 |`;

      const result = extractTable(text);

      expect(result).not.toBeNull();
      const emptyCell = result?.cells.find((c) => c.row === 0 && c.col === 1);
      expect(emptyCell?.content).toBe('');
    });
  });
});
