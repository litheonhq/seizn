/**
 * Doc-to-DB: Table Parser
 *
 * Utilities for parsing table structures from various formats.
 */

import type { CellDataType, ParsedCell, ParsedStructure, SourceLocation } from './types';
import { inferCellType } from './schema-inference';

// ============================================================
// Markdown Table Parser
// ============================================================

/**
 * Parse a markdown-formatted table
 *
 * @param markdown - Markdown table string
 * @returns Parsed headers and rows
 */
export function parseMarkdownTable(markdown: string): {
  headers: string[];
  rows: string[][];
  hasHeaderRow: boolean;
} {
  const lines = markdown
    .trim()
    .split('\n')
    .filter((line) => line.trim() !== '');

  if (lines.length < 2) {
    return { headers: [], rows: [], hasHeaderRow: false };
  }

  // Parse line into cells
  const parseLine = (line: string): string[] => {
    return line
      .split('|')
      .map((cell) => cell.trim())
      .filter((cell, idx, arr) => {
        // Remove empty leading/trailing cells from pipe-delimited rows
        if (idx === 0 && cell === '') return false;
        if (idx === arr.length - 1 && cell === '') return false;
        return true;
      });
  };

  // Check for separator row (---|---|---)
  const isSeparatorRow = (line: string): boolean => {
    const cells = parseLine(line);
    return cells.every((cell) => /^[-:]+$/.test(cell));
  };

  const headers: string[] = [];
  const rows: string[][] = [];
  let hasHeaderRow = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip separator rows
    if (isSeparatorRow(line)) {
      hasHeaderRow = i === 1; // Separator after first row means header row exists
      continue;
    }

    const cells = parseLine(line);

    if (i === 0 && hasHeaderRow === false && lines.length > 1 && isSeparatorRow(lines[1])) {
      // First row is header if followed by separator
      headers.push(...cells);
      hasHeaderRow = true;
    } else if (headers.length === 0 && i === 0) {
      // First row as header if no separator pattern detected
      headers.push(...cells);
      hasHeaderRow = true;
    } else {
      rows.push(cells);
    }
  }

  // If no clear header, use first row as data
  if (!hasHeaderRow && headers.length > 0) {
    rows.unshift(headers);
    return {
      headers: headers.map((_, i) => `Column ${i + 1}`),
      rows,
      hasHeaderRow: false,
    };
  }

  return { headers, rows, hasHeaderRow };
}

// ============================================================
// CSV Parser
// ============================================================

/**
 * Parse CSV-formatted content
 *
 * @param csv - CSV string
 * @param hasHeader - Whether first row is header (default: true)
 * @param delimiter - Column delimiter (default: ',')
 * @returns Parsed headers and rows
 */
export function parseCSVContent(
  csv: string,
  hasHeader = true,
  delimiter = ','
): {
  headers: string[];
  rows: string[][];
} {
  const lines = csv.trim().split('\n');

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  // Parse a single CSV line (handles quoted values)
  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === delimiter) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }

    result.push(current.trim());
    return result;
  };

  const headers: string[] = [];
  const rows: string[][] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cells = parseCsvLine(line);

    if (i === 0 && hasHeader) {
      headers.push(...cells);
    } else {
      rows.push(cells);
    }
  }

  // Generate default headers if none
  if (!hasHeader && rows.length > 0) {
    const colCount = Math.max(...rows.map((r) => r.length));
    for (let i = 0; i < colCount; i++) {
      headers.push(`Column ${i + 1}`);
    }
  }

  return { headers, rows };
}

// ============================================================
// Tab-Separated Values Parser
// ============================================================

/**
 * Parse tab-separated content
 */
export function parseTSVContent(
  tsv: string,
  hasHeader = true
): {
  headers: string[];
  rows: string[][];
} {
  return parseCSVContent(tsv, hasHeader, '\t');
}

// ============================================================
// ASCII Table Parser
// ============================================================

/**
 * Parse ASCII art table with borders
 *
 * Example:
 * +-------+-------+
 * | Col1  | Col2  |
 * +-------+-------+
 * | val1  | val2  |
 * +-------+-------+
 */
export function parseASCIITable(ascii: string): {
  headers: string[];
  rows: string[][];
  hasHeaderRow: boolean;
} {
  const lines = ascii.split('\n');

  // Filter out border lines
  const dataLines = lines.filter((line) => {
    const trimmed = line.trim();
    // Skip lines that are only borders (+-+-+)
    return trimmed && !/^[+\-]+$/.test(trimmed);
  });

  if (dataLines.length === 0) {
    return { headers: [], rows: [], hasHeaderRow: false };
  }

  // Parse line that uses | as separators
  const parseLine = (line: string): string[] => {
    return line
      .split('|')
      .map((cell) => cell.trim())
      .filter((cell) => cell !== '');
  };

  const headers = parseLine(dataLines[0]);
  const rows = dataLines.slice(1).map(parseLine);

  return {
    headers,
    rows,
    hasHeaderRow: dataLines.length > 1,
  };
}

// ============================================================
// Aligned Columns Parser
// ============================================================

/**
 * Parse space-aligned columnar text
 *
 * Detects column positions by finding consistent spacing patterns.
 */
export function parseAlignedColumns(text: string): {
  headers: string[];
  rows: string[][];
  hasHeaderRow: boolean;
} {
  const lines = text.split('\n').filter((line) => line.trim() !== '');

  if (lines.length < 2) {
    return { headers: [], rows: [], hasHeaderRow: false };
  }

  // Find column boundaries by analyzing all lines
  const findColumnPositions = (): number[] => {
    const positions: Set<number> = new Set();
    positions.add(0); // First column always starts at 0

    // Find positions where all lines have whitespace
    const maxLength = Math.max(...lines.map((l) => l.length));

    for (let pos = 1; pos < maxLength - 1; pos++) {
      const spaceCount = lines.filter((line) => {
        const char = line[pos];
        const prevChar = line[pos - 1];
        // Look for transition from non-space to space (column end)
        return char === ' ' && prevChar !== ' ';
      }).length;

      // If most lines have space at this position, it's a column boundary
      if (spaceCount > lines.length * 0.5) {
        // Find the start of next column
        for (let nextPos = pos + 1; nextPos < maxLength; nextPos++) {
          const hasContent = lines.some((line) => {
            const char = line[nextPos];
            return char && char !== ' ';
          });
          if (hasContent) {
            positions.add(nextPos);
            break;
          }
        }
      }
    }

    return Array.from(positions).sort((a, b) => a - b);
  };

  const columnPositions = findColumnPositions();

  if (columnPositions.length < 2) {
    // Fallback: split by multiple spaces
    const headers = lines[0].split(/\s{2,}/).map((s) => s.trim());
    const rows = lines.slice(1).map((line) => line.split(/\s{2,}/).map((s) => s.trim()));
    return { headers, rows, hasHeaderRow: true };
  }

  // Extract cells based on column positions
  const extractCells = (line: string): string[] => {
    const cells: string[] = [];
    for (let i = 0; i < columnPositions.length; i++) {
      const start = columnPositions[i];
      const end = columnPositions[i + 1] ?? line.length;
      cells.push(line.slice(start, end).trim());
    }
    return cells;
  };

  const headers = extractCells(lines[0]);
  const rows = lines.slice(1).map(extractCells);

  return {
    headers,
    rows,
    hasHeaderRow: true,
  };
}

// ============================================================
// Auto-detect Table Format
// ============================================================

/**
 * Auto-detect and parse table format
 */
export function autoParseTable(content: string): {
  headers: string[];
  rows: string[][];
  hasHeaderRow: boolean;
  format: 'markdown' | 'csv' | 'tsv' | 'ascii' | 'aligned' | 'unknown';
} {
  const trimmed = content.trim();

  // Check for markdown table (pipe delimiters with separator row)
  if (trimmed.includes('|') && /\|[-:]+\|/.test(trimmed)) {
    const result = parseMarkdownTable(trimmed);
    return { ...result, format: 'markdown' };
  }

  // Check for ASCII art table (borders with +)
  if (trimmed.includes('+') && /\+[-+]+\+/.test(trimmed)) {
    const result = parseASCIITable(trimmed);
    return { ...result, format: 'ascii' };
  }

  // Check for TSV (tabs between values)
  if (trimmed.includes('\t')) {
    const result = parseTSVContent(trimmed);
    return { ...result, hasHeaderRow: true, format: 'tsv' };
  }

  // Check for CSV (commas with multiple per line)
  const lines = trimmed.split('\n');
  if (lines.length > 0) {
    const commasPerLine = lines.map((l) => (l.match(/,/g) || []).length);
    const avgCommas = commasPerLine.reduce((a, b) => a + b, 0) / lines.length;

    if (avgCommas >= 1 && commasPerLine.every((c) => Math.abs(c - avgCommas) <= 1)) {
      const result = parseCSVContent(trimmed);
      return { ...result, hasHeaderRow: true, format: 'csv' };
    }
  }

  // Check for simple markdown table (pipes without separator)
  if (trimmed.includes('|')) {
    const result = parseMarkdownTable(trimmed);
    return { ...result, format: 'markdown' };
  }

  // Try aligned columns
  if (lines.length >= 2) {
    const result = parseAlignedColumns(trimmed);
    if (result.headers.length >= 2 && result.rows.length >= 1) {
      return { ...result, format: 'aligned' };
    }
  }

  return { headers: [], rows: [], hasHeaderRow: false, format: 'unknown' };
}

// ============================================================
// Convert to ParsedStructure
// ============================================================

/**
 * Convert parsed table data to ParsedStructure format
 */
export function toTableStructure(
  parsed: {
    headers: string[];
    rows: string[][];
    hasHeaderRow?: boolean;
  },
  title?: string,
  description?: string,
  sourceLocation?: SourceLocation
): ParsedStructure {
  return {
    type: 'table',
    title: title || 'Untitled Table',
    description,
    headers: parsed.headers,
    rows: parsed.rows.map((row) =>
      row.map((cell) => {
        // Try to parse as number or boolean
        const num = Number(cell);
        if (!isNaN(num) && cell.trim() !== '') return num;

        const lower = cell.toLowerCase();
        if (lower === 'true' || lower === 'yes') return true;
        if (lower === 'false' || lower === 'no') return false;

        return cell;
      })
    ),
    raw_text: '', // Will be filled by caller
    source_location: sourceLocation || {},
    row_count: parsed.rows.length,
    column_count: parsed.headers.length,
  };
}

// ============================================================
// Extract Cells from Table
// ============================================================

/**
 * Extract individual cells from a parsed table for granular search
 */
export function extractTableCells(
  headers: string[],
  rows: (string | number | boolean | null)[][]
): ParsedCell[] {
  const cells: ParsedCell[] = [];

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];

    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const value = row[colIdx];
      if (value === null || value === undefined || value === '') continue;

      const stringValue = String(value);
      cells.push({
        row_index: rowIdx,
        col_index: colIdx,
        cell_key: headers[colIdx] || undefined,
        cell_value: stringValue,
        data_type: inferCellType(stringValue),
      });
    }
  }

  return cells;
}

// ============================================================
// List Parser
// ============================================================

/**
 * Parse a list structure from text
 */
export function parseList(content: string): {
  items: string[];
  listType: 'ordered' | 'unordered';
  nested: boolean;
} {
  const lines = content.split('\n').filter((line) => line.trim() !== '');

  // Detect list type
  const orderedPattern = /^\s*(\d+[\.\)]|\[[\dx]\]|[a-zA-Z][\.\)])/;
  const unorderedPattern = /^\s*([-*+]|[•◦▪▫])\s/;

  let listType: 'ordered' | 'unordered' = 'unordered';
  let isOrdered = 0;
  let isUnordered = 0;

  lines.forEach((line) => {
    if (orderedPattern.test(line)) isOrdered++;
    if (unorderedPattern.test(line)) isUnordered++;
  });

  listType = isOrdered > isUnordered ? 'ordered' : 'unordered';

  // Extract items
  const items = lines.map((line) => {
    return line
      .replace(orderedPattern, '')
      .replace(unorderedPattern, '')
      .trim();
  });

  // Check for nesting (indentation)
  const nested = lines.some((line) => {
    const leadingSpaces = line.match(/^(\s*)/)?.[1].length || 0;
    return leadingSpaces >= 2;
  });

  return { items, listType, nested };
}

// ============================================================
// Key-Value Parser
// ============================================================

/**
 * Parse key-value pairs from text
 */
export function parseKeyValuePairs(content: string): {
  pairs: { key: string; value: string }[];
} {
  const lines = content.split('\n').filter((line) => line.trim() !== '');

  // Detect separator pattern
  const separators = [':', '=', '->', '=>', '|'];
  const separatorCounts: Record<string, number> = {};

  for (const sep of separators) {
    separatorCounts[sep] = lines.filter((line) => line.includes(sep)).length;
  }

  // Use most common separator
  const bestSeparator =
    separators.reduce((best, sep) =>
      separatorCounts[sep] > separatorCounts[best] ? sep : best
    ) || ':';

  const pairs: { key: string; value: string }[] = [];

  for (const line of lines) {
    const sepIndex = line.indexOf(bestSeparator);
    if (sepIndex > 0) {
      const key = line.slice(0, sepIndex).trim();
      const value = line.slice(sepIndex + bestSeparator.length).trim();

      if (key && value) {
        pairs.push({ key, value });
      }
    }
  }

  return { pairs };
}

/**
 * Convert key-value pairs to cells
 */
export function extractKeyValueCells(
  pairs: { key: string; value: string }[]
): ParsedCell[] {
  return pairs.map((pair, index) => ({
    row_index: index,
    col_index: undefined,
    cell_key: pair.key,
    cell_value: pair.value,
    data_type: inferCellType(pair.value),
  }));
}
