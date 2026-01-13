/**
 * Table Extractor
 *
 * Extracts structured table data from documents.
 * Handles various table formats and converts to normalized structure.
 */

export interface TableCell {
  value: string;
  rowIndex: number;
  colIndex: number;
  rowSpan: number;
  colSpan: number;
  isHeader: boolean;
  alignment?: 'left' | 'center' | 'right';
  dataType?: 'text' | 'number' | 'date' | 'currency' | 'percentage';
}

export interface ExtractedTable {
  id: string;
  page: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  rowCount: number;
  colCount: number;
  cells: TableCell[];
  caption?: string;
  confidence: number;
  headers?: string[];
  markdown?: string;
}

export interface TableExtractionOptions {
  detectHeaders?: boolean;
  detectDataTypes?: boolean;
  minConfidence?: number;
  mergeAdjacentTables?: boolean;
}

const DEFAULT_OPTIONS: TableExtractionOptions = {
  detectHeaders: true,
  detectDataTypes: true,
  minConfidence: 0.6,
  mergeAdjacentTables: false,
};

/**
 * Detect if a cell contains header content
 */
function _isHeaderCell(cell: Omit<TableCell, 'isHeader'>, rowIndex: number): boolean {
  // First row is often header
  if (rowIndex === 0) return true;

  // Check for bold/uppercase patterns (would be detected during extraction)
  const value = cell.value.trim();

  // Empty cells in first row are likely headers
  if (rowIndex === 0 && value === '') return true;

  // Short, non-numeric text in first row
  if (rowIndex === 0 && value.length < 30 && !/^\d+([.,]\d+)?$/.test(value)) {
    return true;
  }

  return false;
}

/**
 * Detect data type of cell value
 */
export function detectCellDataType(value: string): TableCell['dataType'] {
  const trimmed = value.trim();

  if (trimmed === '') return 'text';

  // Currency patterns
  if (/^[$€£¥₩][\d,]+(\.\d{2})?$/.test(trimmed) || /^[\d,]+(\.\d{2})?\s*[$€£¥₩]$/.test(trimmed)) {
    return 'currency';
  }

  // Percentage
  if (/^-?\d+([.,]\d+)?%$/.test(trimmed)) {
    return 'percentage';
  }

  // Date patterns
  if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/.test(trimmed)) {
    return 'date';
  }

  // Number (including negative, decimals, thousands separators)
  if (/^-?[\d,]+([.,]\d+)?$/.test(trimmed)) {
    return 'number';
  }

  return 'text';
}

/**
 * Detect column alignment from cell values
 */
function detectAlignment(cells: TableCell[], colIndex: number): TableCell['alignment'] {
  const colCells = cells.filter((c) => c.colIndex === colIndex && !c.isHeader);

  if (colCells.length === 0) return 'left';

  // Count data types
  const types = colCells.map((c) => c.dataType);
  const numericCount = types.filter((t) => t === 'number' || t === 'currency' || t === 'percentage').length;

  // Numeric columns are typically right-aligned
  if (numericCount > colCells.length * 0.6) {
    return 'right';
  }

  return 'left';
}

/**
 * Convert table to Markdown format
 */
export function tableToMarkdown(table: ExtractedTable): string {
  if (table.cells.length === 0) return '';

  // Build 2D grid
  const grid: string[][] = Array.from({ length: table.rowCount }, () =>
    Array.from({ length: table.colCount }, () => '')
  );

  // Fill grid
  for (const cell of table.cells) {
    if (cell.rowIndex < table.rowCount && cell.colIndex < table.colCount) {
      grid[cell.rowIndex][cell.colIndex] = cell.value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    }
  }

  // Build markdown
  const lines: string[] = [];

  // Header row
  lines.push('| ' + grid[0].join(' | ') + ' |');

  // Separator with alignment
  const separators = Array.from({ length: table.colCount }, (_, i) => {
    const alignment = detectAlignment(table.cells, i);
    if (alignment === 'right') return '---:';
    if (alignment === 'center') return ':---:';
    return '---';
  });
  lines.push('| ' + separators.join(' | ') + ' |');

  // Data rows
  for (let row = 1; row < table.rowCount; row++) {
    lines.push('| ' + grid[row].join(' | ') + ' |');
  }

  // Add caption if present
  if (table.caption) {
    lines.push('');
    lines.push(`*${table.caption}*`);
  }

  return lines.join('\n');
}

/**
 * Parse table from HTML structure
 */
export function parseTableFromHTML(html: string, page: number = 1): ExtractedTable | null {
  // Simple regex-based HTML table parser
  // In production, use proper HTML parser like cheerio

  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return null;

  const tableContent = tableMatch[1];
  const cells: TableCell[] = [];
  let rowIndex = 0;
  let maxColIndex = 0;

  // Extract rows
  const rowMatches = tableContent.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);

  for (const rowMatch of rowMatches) {
    const rowContent = rowMatch[1];
    let colIndex = 0;

    // Extract cells (th and td)
    const cellMatches = rowContent.matchAll(/<(th|td)[^>]*(?:colspan="(\d+)")?[^>]*(?:rowspan="(\d+)")?[^>]*>([\s\S]*?)<\/\1>/gi);

    for (const cellMatch of cellMatches) {
      const [, tag, colSpanStr, rowSpanStr, content] = cellMatch;
      const isHeader = tag.toLowerCase() === 'th';
      const colSpan = parseInt(colSpanStr || '1', 10);
      const rowSpan = parseInt(rowSpanStr || '1', 10);

      // Clean content (remove HTML tags)
      const cleanContent = content.replace(/<[^>]*>/g, '').trim();

      cells.push({
        value: cleanContent,
        rowIndex,
        colIndex,
        rowSpan,
        colSpan,
        isHeader: isHeader || rowIndex === 0,
        dataType: detectCellDataType(cleanContent),
      });

      colIndex += colSpan;
      maxColIndex = Math.max(maxColIndex, colIndex);
    }

    rowIndex++;
  }

  if (cells.length === 0) return null;

  const table: ExtractedTable = {
    id: `table_${page}_${Date.now()}`,
    page,
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    rowCount: rowIndex,
    colCount: maxColIndex,
    cells,
    confidence: 0.9,
    headers: cells.filter((c) => c.isHeader && c.rowIndex === 0).map((c) => c.value),
  };

  table.markdown = tableToMarkdown(table);

  return table;
}

/**
 * Extract tables from text using delimiter patterns
 */
export function extractTablesFromText(
  text: string,
  page: number = 1,
  options: TableExtractionOptions = DEFAULT_OPTIONS
): ExtractedTable[] {
  const tables: ExtractedTable[] = [];

  // Pattern 1: Tab-separated values
  const tsvBlocks = findDelimitedBlocks(text, '\t');
  for (const block of tsvBlocks) {
    const table = parseDelimitedTable(block.content, '\t', page, block.startLine);
    if (table && table.confidence >= (options.minConfidence ?? 0.6)) {
      tables.push(table);
    }
  }

  // Pattern 2: Pipe-separated (Markdown tables)
  const pipeBlocks = findDelimitedBlocks(text, '|');
  for (const block of pipeBlocks) {
    const table = parseMarkdownTable(block.content, page, block.startLine);
    if (table && table.confidence >= (options.minConfidence ?? 0.6)) {
      tables.push(table);
    }
  }

  // Pattern 3: Space-aligned columns (fixed-width)
  const alignedBlocks = findAlignedBlocks(text);
  for (const block of alignedBlocks) {
    const table = parseAlignedTable(block.content, page, block.startLine);
    if (table && table.confidence >= (options.minConfidence ?? 0.6)) {
      tables.push(table);
    }
  }

  // Apply options
  for (const table of tables) {
    if (options.detectHeaders) {
      table.headers = table.cells
        .filter((c) => c.isHeader && c.rowIndex === 0)
        .map((c) => c.value);
    }

    if (options.detectDataTypes) {
      for (const cell of table.cells) {
        cell.dataType = detectCellDataType(cell.value);
        cell.alignment = detectAlignment(table.cells, cell.colIndex);
      }
    }

    table.markdown = tableToMarkdown(table);
  }

  return tables;
}

/**
 * Find blocks of text with consistent delimiter usage
 */
function findDelimitedBlocks(
  text: string,
  delimiter: string
): Array<{ content: string; startLine: number }> {
  const lines = text.split('\n');
  const blocks: Array<{ content: string; startLine: number }> = [];

  let currentBlock: string[] = [];
  let blockStart = 0;
  const minDelimiters = delimiter === '|' ? 2 : 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const delimiterCount = (line.match(new RegExp(delimiter === '|' ? '\\|' : delimiter, 'g')) || []).length;

    if (delimiterCount >= minDelimiters) {
      if (currentBlock.length === 0) {
        blockStart = i;
      }
      currentBlock.push(line);
    } else if (currentBlock.length >= 2) {
      // End of block - need at least 2 rows for a table
      blocks.push({
        content: currentBlock.join('\n'),
        startLine: blockStart,
      });
      currentBlock = [];
    } else {
      currentBlock = [];
    }
  }

  // Don't forget last block
  if (currentBlock.length >= 2) {
    blocks.push({
      content: currentBlock.join('\n'),
      startLine: blockStart,
    });
  }

  return blocks;
}

/**
 * Find blocks with space-aligned columns
 */
function findAlignedBlocks(text: string): Array<{ content: string; startLine: number }> {
  const lines = text.split('\n');
  const blocks: Array<{ content: string; startLine: number }> = [];

  // Look for lines with multiple space-separated values where spaces align
  let currentBlock: string[] = [];
  let blockStart = 0;
  let columnPositions: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Find positions of multi-space gaps
    const gaps: number[] = [];
    const multiSpaceRegex = /\s{2,}/g;
    let match;

    while ((match = multiSpaceRegex.exec(line)) !== null) {
      gaps.push(match.index);
    }

    if (gaps.length >= 1 && line.trim().length > 0) {
      if (currentBlock.length === 0) {
        blockStart = i;
        columnPositions = gaps;
        currentBlock.push(line);
      } else {
        // Check if gaps align with previous lines (within tolerance)
        const aligned = gaps.some((g) => columnPositions.some((p) => Math.abs(g - p) < 3));

        if (aligned) {
          currentBlock.push(line);
        } else if (currentBlock.length >= 2) {
          blocks.push({
            content: currentBlock.join('\n'),
            startLine: blockStart,
          });
          currentBlock = [line];
          blockStart = i;
          columnPositions = gaps;
        } else {
          currentBlock = [line];
          blockStart = i;
          columnPositions = gaps;
        }
      }
    } else if (currentBlock.length >= 2) {
      blocks.push({
        content: currentBlock.join('\n'),
        startLine: blockStart,
      });
      currentBlock = [];
      columnPositions = [];
    }
  }

  if (currentBlock.length >= 2) {
    blocks.push({
      content: currentBlock.join('\n'),
      startLine: blockStart,
    });
  }

  return blocks;
}

/**
 * Parse delimiter-separated table
 */
function parseDelimitedTable(
  content: string,
  delimiter: string,
  page: number,
  startLine: number
): ExtractedTable | null {
  const lines = content.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return null;

  const cells: TableCell[] = [];
  let maxCols = 0;

  for (let rowIndex = 0; rowIndex < lines.length; rowIndex++) {
    const values = lines[rowIndex].split(delimiter).map((v) => v.trim());
    maxCols = Math.max(maxCols, values.length);

    for (let colIndex = 0; colIndex < values.length; colIndex++) {
      cells.push({
        value: values[colIndex],
        rowIndex,
        colIndex,
        rowSpan: 1,
        colSpan: 1,
        isHeader: rowIndex === 0,
        dataType: detectCellDataType(values[colIndex]),
      });
    }
  }

  return {
    id: `table_${page}_${startLine}`,
    page,
    bounds: { x: 0, y: startLine, width: 0, height: lines.length },
    rowCount: lines.length,
    colCount: maxCols,
    cells,
    confidence: 0.75,
  };
}

/**
 * Parse Markdown-style table
 */
function parseMarkdownTable(content: string, page: number, startLine: number): ExtractedTable | null {
  const lines = content.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return null;

  // Check for separator line (---|---|---)
  const hasSeparator = lines.some((l) => /^\|?\s*[-:]+\s*\|/.test(l));

  const cells: TableCell[] = [];
  let maxCols = 0;
  let dataRowIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip separator line
    if (/^\|?\s*[-:]+\s*(\|\s*[-:]+\s*)*\|?$/.test(line)) continue;

    // Parse cells
    const values = line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((v) => v.trim());

    maxCols = Math.max(maxCols, values.length);

    for (let colIndex = 0; colIndex < values.length; colIndex++) {
      cells.push({
        value: values[colIndex],
        rowIndex: dataRowIndex,
        colIndex,
        rowSpan: 1,
        colSpan: 1,
        isHeader: dataRowIndex === 0 && hasSeparator,
        dataType: detectCellDataType(values[colIndex]),
      });
    }

    dataRowIndex++;
  }

  if (cells.length === 0) return null;

  return {
    id: `table_${page}_${startLine}`,
    page,
    bounds: { x: 0, y: startLine, width: 0, height: lines.length },
    rowCount: dataRowIndex,
    colCount: maxCols,
    cells,
    confidence: hasSeparator ? 0.9 : 0.7,
  };
}

/**
 * Parse space-aligned table
 */
function parseAlignedTable(content: string, page: number, startLine: number): ExtractedTable | null {
  const lines = content.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return null;

  // Find column boundaries from first line
  const firstLine = lines[0];
  const columnBoundaries: number[] = [0];

  // Find multi-space gaps as column separators
  const multiSpaceRegex = /\s{2,}/g;
  let match;

  while ((match = multiSpaceRegex.exec(firstLine)) !== null) {
    columnBoundaries.push(match.index + match[0].length);
  }

  columnBoundaries.push(firstLine.length);

  const cells: TableCell[] = [];
  const colCount = columnBoundaries.length - 1;

  for (let rowIndex = 0; rowIndex < lines.length; rowIndex++) {
    const line = lines[rowIndex];

    for (let colIndex = 0; colIndex < colCount; colIndex++) {
      const start = columnBoundaries[colIndex];
      const end = columnBoundaries[colIndex + 1];
      const value = line.substring(start, end).trim();

      cells.push({
        value,
        rowIndex,
        colIndex,
        rowSpan: 1,
        colSpan: 1,
        isHeader: rowIndex === 0,
        dataType: detectCellDataType(value),
      });
    }
  }

  return {
    id: `table_${page}_${startLine}`,
    page,
    bounds: { x: 0, y: startLine, width: 0, height: lines.length },
    rowCount: lines.length,
    colCount,
    cells,
    confidence: 0.6,
  };
}

/**
 * Convert table to JSON-serializable format for storage
 */
export function tableToJSON(table: ExtractedTable): Record<string, unknown> {
  // Convert to array of objects using headers
  const headers = table.headers ?? table.cells
    .filter((c) => c.rowIndex === 0)
    .sort((a, b) => a.colIndex - b.colIndex)
    .map((c) => c.value || `col_${c.colIndex}`);

  const rows: Record<string, unknown>[] = [];

  for (let row = 1; row < table.rowCount; row++) {
    const rowCells = table.cells
      .filter((c) => c.rowIndex === row)
      .sort((a, b) => a.colIndex - b.colIndex);

    const rowObj: Record<string, unknown> = {};

    for (let col = 0; col < headers.length; col++) {
      const cell = rowCells.find((c) => c.colIndex === col);
      const header = headers[col] || `col_${col}`;

      if (cell) {
        // Convert value based on detected type
        if (cell.dataType === 'number') {
          rowObj[header] = parseFloat(cell.value.replace(/,/g, ''));
        } else if (cell.dataType === 'percentage') {
          rowObj[header] = parseFloat(cell.value.replace(/%/g, '')) / 100;
        } else {
          rowObj[header] = cell.value;
        }
      } else {
        rowObj[header] = null;
      }
    }

    rows.push(rowObj);
  }

  return {
    id: table.id,
    page: table.page,
    caption: table.caption,
    headers,
    rows,
    rowCount: table.rowCount - 1, // Exclude header
    colCount: table.colCount,
    confidence: table.confidence,
  };
}
