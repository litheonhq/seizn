/**
 * PDF Parser with Layout Preservation
 *
 * Extracts structured blocks from PDF documents:
 * - Text blocks with approximate bounding boxes
 * - Headings (detected by font size patterns)
 * - Tables (detected by grid patterns)
 * - Lists (detected by bullet/number patterns)
 * - Code blocks (detected by monospace patterns)
 *
 * Uses pdf-parse for text extraction with layout analysis
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const pdfParse = require('pdf-parse');

import type {
  DocumentBlock,
  ParsedDocument,
  ParseOptions,
  BlockType,
  BoundingBox,
} from '../types';
import { randomUUID } from 'crypto';

/**
 * Default parse options
 */
const DEFAULT_OPTIONS: Required<ParseOptions> = {
  extractTables: true,
  extractFigures: true,
  detectCode: true,
  confidenceThreshold: 0.5,
  maxPages: 500,
};

/**
 * Patterns for block type detection
 */
const PATTERNS = {
  // Heading patterns (numbered sections, capital letters, etc.)
  heading: /^(?:(?:\d+\.)+\s*|(?:[A-Z][A-Z\s]{2,}$)|(?:#{1,6}\s+))/m,
  // List patterns (bullets, numbers, letters)
  list: /^[\s]*(?:[-*\u2022\u2023\u25E6]\s+|\d+[.)]\s+|[a-z][.)]\s+|[ivxlcdm]+[.)]\s+)/im,
  // Code patterns (indentation, common keywords)
  code: /^(?:\s{4,}|\t+)(?:(?:function|const|let|var|if|for|while|class|import|export|return|def|async|await)\s|[{}\[\]();])/m,
  // Table row pattern (pipe-separated or tab-separated)
  tableRow: /^[|\t].*[|\t]$/m,
  // Caption pattern (Figure X, Table X, etc.)
  caption: /^(?:Figure|Table|Fig\.|Tab\.)\s*\d+[.:]/i,
};

/**
 * Parse a PDF buffer into structured blocks
 */
export async function parsePdf(
  buffer: Buffer,
  options: ParseOptions = {}
): Promise<ParsedDocument> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const documentId = randomUUID();

  // Parse PDF with pdf-parse
  const pdfData = await pdfParse(buffer, {
    max: opts.maxPages,
    // Custom page render function to preserve more layout info
    pagerender: renderPage,
  });

  const rawText: string = pdfData.text || '';
  const pageCount: number = pdfData.numpages || 1;
  const metadata = {
    info: pdfData.info || null,
    version: pdfData.version || null,
    numPages: pageCount,
  };

  // Split text by pages (pdf-parse adds page breaks)
  const pageTexts = splitByPages(rawText, pageCount);

  // Extract blocks from each page
  const blocks: DocumentBlock[] = [];
  let orderIndex = 0;

  for (let pageNum = 0; pageNum < pageTexts.length; pageNum++) {
    const pageText = pageTexts[pageNum];
    const pageBlocks = extractBlocksFromPage(
      pageText,
      pageNum + 1,
      documentId,
      opts,
      orderIndex
    );
    orderIndex += pageBlocks.length;
    blocks.push(...pageBlocks);
  }

  // Post-process: merge adjacent blocks of same type, clean up
  const mergedBlocks = postProcessBlocks(blocks);

  return {
    id: documentId,
    filename: 'document.pdf',
    mimeType: 'application/pdf',
    pageCount,
    blocks: mergedBlocks,
    metadata,
    parsedAt: new Date().toISOString(),
  };
}

/**
 * Custom page render function for pdf-parse
 */
function renderPage(pageData: { getTextContent: () => Promise<{ items: unknown[] }> }): Promise<string> {
  return pageData
    .getTextContent()
    .then((textContent) => {
      let lastY = -1;
      let text = '';
      for (const item of textContent.items as Array<{ str: string; transform?: number[] }>) {
        // Check for new line based on Y position change
        if (item.transform && item.transform.length >= 6) {
          const y = item.transform[5];
          if (lastY !== -1 && Math.abs(y - lastY) > 5) {
            text += '\n';
          }
          lastY = y;
        }
        text += item.str;
      }
      return text;
    })
    .catch(() => '');
}

/**
 * Split raw text by pages using page break markers or heuristics
 */
function splitByPages(rawText: string, pageCount: number): string[] {
  // pdf-parse typically adds form feed characters between pages
  const pageBreakPattern = /\f/;
  const parts = rawText.split(pageBreakPattern);

  // If we got fewer parts than pages, distribute evenly
  if (parts.length < pageCount) {
    const lines = rawText.split('\n');
    const linesPerPage = Math.ceil(lines.length / pageCount);
    const pages: string[] = [];
    for (let i = 0; i < pageCount; i++) {
      const start = i * linesPerPage;
      const end = Math.min(start + linesPerPage, lines.length);
      pages.push(lines.slice(start, end).join('\n'));
    }
    return pages;
  }

  return parts.slice(0, pageCount);
}

/**
 * Extract blocks from a single page of text
 */
function extractBlocksFromPage(
  pageText: string,
  pageNumber: number,
  documentId: string,
  options: Required<ParseOptions>,
  startOrderIndex: number
): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  const lines = pageText.split('\n');
  let orderIndex = startOrderIndex;

  let currentBlock: { type: BlockType; lines: string[]; startLine: number } | null = null;
  let tableBuffer: string[] = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Skip empty lines (may signal block boundaries)
    if (!trimmedLine) {
      if (currentBlock && currentBlock.lines.length > 0) {
        blocks.push(createBlock(currentBlock, pageNumber, documentId, orderIndex++, lines.length));
        currentBlock = null;
      }
      if (inTable && tableBuffer.length > 0) {
        blocks.push(createTableBlock(tableBuffer, pageNumber, documentId, orderIndex++, i, lines.length, options));
        tableBuffer = [];
        inTable = false;
      }
      continue;
    }

    // Detect block type
    const detectedType = detectBlockType(line, trimmedLine, options);

    // Handle table detection
    if (options.extractTables && (detectedType === 'table' || inTable)) {
      if (PATTERNS.tableRow.test(line) || isTableContinuation(line, tableBuffer)) {
        tableBuffer.push(line);
        inTable = true;
        continue;
      } else if (inTable && tableBuffer.length > 0) {
        // End of table
        blocks.push(createTableBlock(tableBuffer, pageNumber, documentId, orderIndex++, i, lines.length, options));
        tableBuffer = [];
        inTable = false;
      }
    }

    // Check if we should start a new block
    if (!currentBlock || currentBlock.type !== detectedType) {
      // Save previous block
      if (currentBlock && currentBlock.lines.length > 0) {
        blocks.push(createBlock(currentBlock, pageNumber, documentId, orderIndex++, lines.length));
      }
      // Start new block
      currentBlock = { type: detectedType, lines: [line], startLine: i };
    } else {
      // Continue current block
      currentBlock.lines.push(line);
    }
  }

  // Handle remaining content
  if (currentBlock && currentBlock.lines.length > 0) {
    blocks.push(createBlock(currentBlock, pageNumber, documentId, orderIndex++, lines.length));
  }
  if (tableBuffer.length > 0) {
    blocks.push(createTableBlock(tableBuffer, pageNumber, documentId, orderIndex++, lines.length, lines.length, options));
  }

  return blocks;
}

/**
 * Detect the type of a text block based on content patterns
 */
function detectBlockType(
  line: string,
  trimmedLine: string,
  options: Required<ParseOptions>
): BlockType {
  // Caption detection (highest priority)
  if (PATTERNS.caption.test(trimmedLine)) {
    return 'caption';
  }

  // Heading detection
  if (PATTERNS.heading.test(trimmedLine)) {
    return 'heading';
  }

  // List detection
  if (PATTERNS.list.test(line)) {
    return 'list';
  }

  // Code detection
  if (options.detectCode && PATTERNS.code.test(line)) {
    return 'code';
  }

  // Table row detection
  if (options.extractTables && PATTERNS.tableRow.test(line)) {
    return 'table';
  }

  // Default to text
  return 'text';
}

/**
 * Check if a line is a continuation of a table
 */
function isTableContinuation(line: string, tableBuffer: string[]): boolean {
  if (tableBuffer.length === 0) return false;

  // Check if line has similar structure to previous table rows
  const prevLine = tableBuffer[tableBuffer.length - 1];
  const prevPipes = (prevLine.match(/\|/g) || []).length;
  const currentPipes = (line.match(/\|/g) || []).length;

  // Same number of pipes suggests table continuation
  return prevPipes > 0 && prevPipes === currentPipes;
}

/**
 * Create a document block from accumulated lines
 */
function createBlock(
  blockData: { type: BlockType; lines: string[]; startLine: number },
  pageNumber: number,
  documentId: string,
  orderIndex: number,
  totalLines: number
): DocumentBlock {
  const content = blockData.lines.join('\n').trim();

  // Estimate bounding box based on line positions
  const bbox = estimateBoundingBox(blockData.startLine, blockData.lines.length, totalLines);

  return {
    id: randomUUID(),
    documentId,
    blockType: blockData.type,
    pageNumber,
    bbox,
    content,
    contentHtml: blockData.type === 'code' ? `<pre><code>${escapeHtml(content)}</code></pre>` : undefined,
    metadata: {
      lineCount: blockData.lines.length,
      charCount: content.length,
    },
    orderIndex,
  };
}

/**
 * Create a table block from accumulated table lines
 */
function createTableBlock(
  tableLines: string[],
  pageNumber: number,
  documentId: string,
  orderIndex: number,
  endLine: number,
  totalLines: number,
  _options: Required<ParseOptions>
): DocumentBlock {
  const content = tableLines.join('\n').trim();
  const startLine = endLine - tableLines.length;
  const bbox = estimateBoundingBox(startLine, tableLines.length, totalLines);

  // Generate simple HTML representation
  const html = generateTableHtml(tableLines);

  return {
    id: randomUUID(),
    documentId,
    blockType: 'table',
    pageNumber,
    bbox,
    content,
    contentHtml: html,
    metadata: {
      rowCount: tableLines.length,
      format: 'pipe-delimited',
    },
    orderIndex,
  };
}

/**
 * Estimate bounding box based on line position
 * Uses normalized coordinates (0-1) for page position
 */
function estimateBoundingBox(
  startLine: number,
  lineCount: number,
  totalLines: number
): BoundingBox {
  const pageHeight = 1.0;
  const lineHeight = totalLines > 0 ? pageHeight / totalLines : 0.02;

  return {
    x: 0,
    y: startLine * lineHeight,
    width: 1.0,
    height: lineCount * lineHeight,
  };
}

/**
 * Generate HTML table from pipe-delimited lines
 */
function generateTableHtml(lines: string[]): string {
  if (lines.length === 0) return '<table></table>';

  const rows = lines.map((line) => {
    // Split by pipe or tab
    const cells = line.split(/[|\t]/).filter((c) => c.trim());
    return cells;
  });

  let html = '<table border="1" cellpadding="4" cellspacing="0">';

  rows.forEach((cells, rowIndex) => {
    html += '<tr>';
    cells.forEach((cell) => {
      const tag = rowIndex === 0 ? 'th' : 'td';
      html += `<${tag}>${escapeHtml(cell.trim())}</${tag}>`;
    });
    html += '</tr>';
  });

  html += '</table>';
  return html;
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
 * Post-process blocks: merge adjacent same-type blocks, clean up
 */
function postProcessBlocks(blocks: DocumentBlock[]): DocumentBlock[] {
  if (blocks.length <= 1) return blocks;

  const result: DocumentBlock[] = [];
  let current = blocks[0];

  for (let i = 1; i < blocks.length; i++) {
    const next = blocks[i];

    // Merge adjacent text blocks on same page
    if (
      current.blockType === 'text' &&
      next.blockType === 'text' &&
      current.pageNumber === next.pageNumber
    ) {
      // Merge into current
      current = {
        ...current,
        content: current.content + '\n\n' + next.content,
        bbox: current.bbox && next.bbox
          ? {
              x: Math.min(current.bbox.x, next.bbox.x),
              y: current.bbox.y,
              width: Math.max(current.bbox.width, next.bbox.width),
              height: (next.bbox.y + next.bbox.height) - current.bbox.y,
            }
          : current.bbox,
        metadata: {
          ...current.metadata,
          charCount: current.content.length + next.content.length + 2,
        },
      };
    } else {
      // Different type or page, save current and move on
      result.push(current);
      current = next;
    }
  }

  // Don't forget the last block
  result.push(current);

  // Re-index order
  return result.map((block, idx) => ({
    ...block,
    orderIndex: idx,
  }));
}

/**
 * Parse PDF from a file path (server-side only)
 */
export async function parsePdfFromPath(
  filePath: string,
  options?: ParseOptions
): Promise<ParsedDocument> {
  const fs = await import('fs/promises');
  const buffer = await fs.readFile(filePath);
  const result = await parsePdf(buffer, options);

  // Extract filename from path
  const filename = filePath.split(/[/\\]/).pop() || 'document.pdf';
  return {
    ...result,
    filename,
  };
}
