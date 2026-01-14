/**
 * Table Extractor
 *
 * Extracts and parses table structures from various formats:
 * - Pipe-delimited (Markdown style)
 * - Tab-separated
 * - Space-aligned columns
 *
 * Features:
 * - Cell span detection
 * - Header row detection
 * - HTML/CSV output generation
 */

import type { ParsedTable, TableCell } from '../types';

/**
 * Table detection patterns
 */
const TABLE_PATTERNS = {
  /** Markdown-style pipe table */
  pipeDelimited: /^[|].*[|]$/m,
  /** Tab-separated values */
  tabDelimited: /\t/,
  /** Markdown separator row (|---|---|) */
  separatorRow: /^[|\s-:]+$/,
  /** CSV-style comma-separated */
  commaDelimited: /^"?[^,]+"?,/,
};

/**
 * Extract a table from text content
 */
export function extractTable(text: string): ParsedTable | null {
  const lines = text.split('\n').filter((line) => line.trim());

  if (lines.length === 0) {
    return null;
  }

  // Detect table format
  const format = detectTableFormat(lines);

  switch (format) {
    case 'pipe':
      return parsePipeTable(lines);
    case 'tab':
      return parseTabTable(lines);
    case 'csv':
      return parseCsvTable(lines);
    case 'space':
      return parseSpaceAlignedTable(lines);
    default:
      return null;
  }
}

/**
 * Detect the table format from content
 */
function detectTableFormat(
  lines: string[]
): 'pipe' | 'tab' | 'csv' | 'space' | null {
  const firstLine = lines[0];

  // Check for pipe-delimited (Markdown tables)
  if (TABLE_PATTERNS.pipeDelimited.test(firstLine)) {
    return 'pipe';
  }

  // Check for tab-separated
  if (TABLE_PATTERNS.tabDelimited.test(firstLine)) {
    return 'tab';
  }

  // Check for CSV
  if (TABLE_PATTERNS.commaDelimited.test(firstLine)) {
    return 'csv';
  }

  // Check for space-aligned columns (multiple spaces between content)
  if (/\s{2,}/.test(firstLine) && lines.length > 1) {
    return 'space';
  }

  return null;
}

/**
 * Parse a pipe-delimited (Markdown) table
 */
function parsePipeTable(lines: string[]): ParsedTable {
  const cells: TableCell[] = [];
  let rows = 0;
  let cols = 0;
  let hasHeader = false;

  // Find and skip separator row
  const dataLines = lines.filter((line) => !TABLE_PATTERNS.separatorRow.test(line));

  // Check if second line was a separator (indicates header)
  if (lines.length > 1 && TABLE_PATTERNS.separatorRow.test(lines[1])) {
    hasHeader = true;
  }

  dataLines.forEach((line, rowIndex) => {
    // Split by pipe, filter empty
    const cellContents = line
      .split('|')
      .map((c) => c.trim())
      .filter((c, i, arr) => i > 0 && i < arr.length); // Remove first/last empty from |...|

    if (cellContents.length > cols) {
      cols = cellContents.length;
    }

    cellContents.forEach((content, colIndex) => {
      cells.push({
        row: rowIndex,
        col: colIndex,
        content,
        isHeader: hasHeader && rowIndex === 0,
      });
    });

    rows++;
  });

  return {
    rows,
    cols,
    cells,
    html: generateHtml(cells, rows, cols),
    csv: generateCsv(cells, rows, cols),
  };
}

/**
 * Parse a tab-delimited table
 */
function parseTabTable(lines: string[]): ParsedTable {
  const cells: TableCell[] = [];
  let rows = 0;
  let cols = 0;

  lines.forEach((line, rowIndex) => {
    const cellContents = line.split('\t').map((c) => c.trim());

    if (cellContents.length > cols) {
      cols = cellContents.length;
    }

    cellContents.forEach((content, colIndex) => {
      cells.push({
        row: rowIndex,
        col: colIndex,
        content,
        isHeader: rowIndex === 0, // Assume first row is header for TSV
      });
    });

    rows++;
  });

  return {
    rows,
    cols,
    cells,
    html: generateHtml(cells, rows, cols),
    csv: generateCsv(cells, rows, cols),
  };
}

/**
 * Parse a CSV table
 */
function parseCsvTable(lines: string[]): ParsedTable {
  const cells: TableCell[] = [];
  let rows = 0;
  let cols = 0;

  lines.forEach((line, rowIndex) => {
    // Simple CSV parsing (handles quoted fields)
    const cellContents = parseCsvLine(line);

    if (cellContents.length > cols) {
      cols = cellContents.length;
    }

    cellContents.forEach((content, colIndex) => {
      cells.push({
        row: rowIndex,
        col: colIndex,
        content,
        isHeader: rowIndex === 0,
      });
    });

    rows++;
  });

  return {
    rows,
    cols,
    cells,
    html: generateHtml(cells, rows, cols),
    csv: generateCsv(cells, rows, cols),
  };
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCsvLine(line: string): string[] {
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
        // End of quoted field
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        // Start of quoted field
        inQuotes = true;
      } else if (char === ',') {
        // Field separator
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }

  // Don't forget the last field
  result.push(current.trim());

  return result;
}

/**
 * Parse a space-aligned table
 */
function parseSpaceAlignedTable(lines: string[]): ParsedTable {
  const cells: TableCell[] = [];

  // Detect column boundaries from first line
  const columnBoundaries = detectColumnBoundaries(lines);

  if (columnBoundaries.length === 0) {
    // Fallback: split by multiple spaces
    return parseByMultipleSpaces(lines);
  }

  const cols = columnBoundaries.length;
  const rows = lines.length;

  lines.forEach((line, rowIndex) => {
    columnBoundaries.forEach((boundary, colIndex) => {
      const start = boundary.start;
      const end = colIndex < cols - 1 ? columnBoundaries[colIndex + 1].start : line.length;
      const content = line.substring(start, end).trim();

      cells.push({
        row: rowIndex,
        col: colIndex,
        content,
        isHeader: rowIndex === 0,
      });
    });
  });

  return {
    rows,
    cols,
    cells,
    html: generateHtml(cells, rows, cols),
    csv: generateCsv(cells, rows, cols),
  };
}

/**
 * Detect column boundaries from space-aligned text
 */
function detectColumnBoundaries(
  lines: string[]
): Array<{ start: number; end: number }> {
  if (lines.length < 2) return [];

  // Find positions where all lines have spaces
  const maxLen = Math.max(...lines.map((l) => l.length));
  const spacePositions: boolean[] = new Array(maxLen).fill(true);

  lines.forEach((line) => {
    for (let i = 0; i < maxLen; i++) {
      if (i < line.length && line[i] !== ' ') {
        spacePositions[i] = false;
      }
    }
  });

  // Find gaps (consecutive spaces) as column separators
  const boundaries: Array<{ start: number; end: number }> = [];
  let inContent = false;
  let contentStart = 0;

  for (let i = 0; i < maxLen; i++) {
    if (!spacePositions[i]) {
      if (!inContent) {
        inContent = true;
        contentStart = i;
      }
    } else {
      if (inContent) {
        inContent = false;
        boundaries.push({ start: contentStart, end: i });
      }
    }
  }

  if (inContent) {
    boundaries.push({ start: contentStart, end: maxLen });
  }

  return boundaries;
}

/**
 * Fallback: parse by splitting on multiple spaces
 */
function parseByMultipleSpaces(lines: string[]): ParsedTable {
  const cells: TableCell[] = [];
  let rows = 0;
  let cols = 0;

  lines.forEach((line, rowIndex) => {
    const cellContents = line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);

    if (cellContents.length > cols) {
      cols = cellContents.length;
    }

    cellContents.forEach((content, colIndex) => {
      cells.push({
        row: rowIndex,
        col: colIndex,
        content,
        isHeader: rowIndex === 0,
      });
    });

    rows++;
  });

  return {
    rows,
    cols,
    cells,
    html: generateHtml(cells, rows, cols),
    csv: generateCsv(cells, rows, cols),
  };
}

/**
 * Generate HTML table from cells
 */
function generateHtml(cells: TableCell[], rows: number, cols: number): string {
  // Build a 2D grid for easier rendering
  const grid: (TableCell | null)[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(null)
  );

  cells.forEach((cell) => {
    if (cell.row < rows && cell.col < cols) {
      grid[cell.row][cell.col] = cell;
    }
  });

  let html = '<table border="1" cellpadding="4" cellspacing="0">';

  grid.forEach((row, rowIndex) => {
    html += '<tr>';
    row.forEach((cell) => {
      if (cell) {
        const tag = cell.isHeader ? 'th' : 'td';
        const rowSpan = cell.rowSpan && cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : '';
        const colSpan = cell.colSpan && cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : '';
        html += `<${tag}${rowSpan}${colSpan}>${escapeHtml(cell.content)}</${tag}>`;
      } else if (rowIndex === 0) {
        // Empty header cell
        html += '<th></th>';
      } else {
        // Empty data cell
        html += '<td></td>';
      }
    });
    html += '</tr>';
  });

  html += '</table>';
  return html;
}

/**
 * Generate CSV from cells
 */
function generateCsv(cells: TableCell[], rows: number, cols: number): string {
  // Build a 2D grid
  const grid: string[][] = Array.from({ length: rows }, () =>
    Array(cols).fill('')
  );

  cells.forEach((cell) => {
    if (cell.row < rows && cell.col < cols) {
      grid[cell.row][cell.col] = cell.content;
    }
  });

  return grid
    .map((row) =>
      row.map((cell) => {
        // Escape quotes and wrap in quotes if needed
        if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join(',')
    )
    .join('\n');
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Detect merged cells (spans) in a table
 * Returns updated cells with rowSpan/colSpan properties
 */
export function detectMergedCells(cells: TableCell[]): TableCell[] {
  // Group cells by row
  const byRow = new Map<number, TableCell[]>();
  cells.forEach((cell) => {
    const row = byRow.get(cell.row) || [];
    row.push(cell);
    byRow.set(cell.row, row);
  });

  // Detect column spans (cells with empty neighbors)
  const updatedCells = cells.map((cell) => {
    const newCell = { ...cell };

    // Check for horizontal span (empty cells to the right with same content)
    const rowCells = byRow.get(cell.row) || [];
    let colSpan = 1;
    for (let c = cell.col + 1; c < rowCells.length; c++) {
      const nextCell = rowCells.find((rc) => rc.col === c);
      if (!nextCell || nextCell.content === '' || nextCell.content === cell.content) {
        colSpan++;
      } else {
        break;
      }
    }
    if (colSpan > 1) {
      newCell.colSpan = colSpan;
    }

    return newCell;
  });

  // Filter out cells that are part of a span
  const spanCoverage = new Set<string>();
  updatedCells.forEach((cell) => {
    if (cell.colSpan && cell.colSpan > 1) {
      for (let c = cell.col + 1; c < cell.col + cell.colSpan; c++) {
        spanCoverage.add(`${cell.row}-${c}`);
      }
    }
    if (cell.rowSpan && cell.rowSpan > 1) {
      for (let r = cell.row + 1; r < cell.row + cell.rowSpan; r++) {
        spanCoverage.add(`${r}-${cell.col}`);
      }
    }
  });

  return updatedCells.filter((cell) => !spanCoverage.has(`${cell.row}-${cell.col}`));
}

/**
 * Validate a parsed table structure
 */
export function validateTable(table: ParsedTable): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (table.rows === 0) {
    errors.push('Table has no rows');
  }

  if (table.cols === 0) {
    errors.push('Table has no columns');
  }

  if (table.cells.length === 0) {
    errors.push('Table has no cells');
  }

  // Check for out-of-bounds cells
  table.cells.forEach((cell, idx) => {
    if (cell.row >= table.rows) {
      errors.push(`Cell ${idx}: row ${cell.row} exceeds table rows ${table.rows}`);
    }
    if (cell.col >= table.cols) {
      errors.push(`Cell ${idx}: col ${cell.col} exceeds table cols ${table.cols}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}
