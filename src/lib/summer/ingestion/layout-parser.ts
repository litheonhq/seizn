/**
 * Layout-Aware PDF Parser
 *
 * Extracts text with layout information from PDFs,
 * preserving document structure (headers, columns, sections).
 */

export type LayoutZone =
  | 'header'
  | 'footer'
  | 'body'
  | 'sidebar'
  | 'title'
  | 'caption'
  | 'table'
  | 'figure'
  | 'equation'
  | 'footnote';

export interface TextBlock {
  text: string;
  page: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  fontSize: number;
  fontName?: string;
  isBold: boolean;
  isItalic: boolean;
  zone: LayoutZone;
  confidence: number;
}

export interface PageLayout {
  pageNumber: number;
  width: number;
  height: number;
  blocks: TextBlock[];
  columns: number; // Detected column count
  hasHeader: boolean;
  hasFooter: boolean;
}

export interface DocumentLayout {
  pageCount: number;
  pages: PageLayout[];
  metadata: {
    title?: string;
    author?: string;
    createdAt?: Date;
    language?: string;
  };
}

// Layout detection thresholds
const LAYOUT_CONFIG = {
  headerZoneRatio: 0.1, // Top 10% of page
  footerZoneRatio: 0.1, // Bottom 10% of page
  marginRatio: 0.05, // Side margins
  columnGapThreshold: 50, // Min px gap between columns
  titleFontSizeMultiplier: 1.4, // Font size > avg * 1.4 = title
  minBlockHeight: 10, // Ignore blocks smaller than this
};

/**
 * Classify text block into layout zone
 */
export function classifyZone(
  block: Omit<TextBlock, 'zone' | 'confidence'>,
  pageHeight: number,
  avgFontSize: number
): { zone: LayoutZone; confidence: number } {
  const { bounds, fontSize, text } = block;
  const normalizedY = bounds.y / pageHeight;

  // Header zone (top 10%)
  if (normalizedY < LAYOUT_CONFIG.headerZoneRatio) {
    return { zone: 'header', confidence: 0.9 };
  }

  // Footer zone (bottom 10%)
  if (normalizedY > 1 - LAYOUT_CONFIG.footerZoneRatio) {
    // Check for page numbers
    if (/^\d+$/.test(text.trim()) || /^page\s*\d+$/i.test(text.trim())) {
      return { zone: 'footer', confidence: 0.95 };
    }
    return { zone: 'footer', confidence: 0.85 };
  }

  // Title detection (large font at top)
  if (fontSize > avgFontSize * LAYOUT_CONFIG.titleFontSizeMultiplier && normalizedY < 0.3) {
    return { zone: 'title', confidence: 0.85 };
  }

  // Caption detection (small font, usually below figures/tables)
  if (fontSize < avgFontSize * 0.85 && /^(figure|fig\.|table|caption)/i.test(text.trim())) {
    return { zone: 'caption', confidence: 0.9 };
  }

  // Footnote detection
  if (normalizedY > 0.85 && fontSize < avgFontSize * 0.9) {
    return { zone: 'footnote', confidence: 0.75 };
  }

  // Default to body
  return { zone: 'body', confidence: 0.7 };
}

/**
 * Detect number of columns in a page
 */
export function detectColumns(blocks: TextBlock[], pageWidth: number): number {
  if (blocks.length < 3) return 1;

  // Get x-coordinates of block centers
  const centers = blocks
    .filter((b) => b.zone === 'body')
    .map((b) => b.bounds.x + b.bounds.width / 2);

  if (centers.length < 3) return 1;

  // Cluster centers to detect columns
  const sortedCenters = [...centers].sort((a, b) => a - b);
  const gaps: number[] = [];

  for (let i = 1; i < sortedCenters.length; i++) {
    gaps.push(sortedCenters[i] - sortedCenters[i - 1]);
  }

  // Count significant gaps (potential column boundaries)
  const significantGaps = gaps.filter((g) => g > LAYOUT_CONFIG.columnGapThreshold);

  if (significantGaps.length === 0) return 1;
  if (significantGaps.length >= 1 && significantGaps.length <= 2) return 2;
  return Math.min(3, significantGaps.length + 1);
}

/**
 * Merge adjacent text blocks into logical units
 */
export function mergeAdjacentBlocks(
  blocks: TextBlock[],
  maxVerticalGap: number = 15
): TextBlock[] {
  if (blocks.length === 0) return [];

  // Sort by page, then y, then x
  const sorted = [...blocks].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    if (Math.abs(a.bounds.y - b.bounds.y) > maxVerticalGap) return a.bounds.y - b.bounds.y;
    return a.bounds.x - b.bounds.x;
  });

  const merged: TextBlock[] = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];

    // Check if blocks should merge
    const sameZone = next.zone === current.zone;
    const samePage = next.page === current.page;
    const verticallyClose = Math.abs(next.bounds.y - (current.bounds.y + current.bounds.height)) < maxVerticalGap;
    const similarFontSize = Math.abs(next.fontSize - current.fontSize) < 2;

    if (sameZone && samePage && verticallyClose && similarFontSize) {
      // Merge blocks
      current.text += ' ' + next.text;
      current.bounds.width = Math.max(
        current.bounds.x + current.bounds.width,
        next.bounds.x + next.bounds.width
      ) - current.bounds.x;
      current.bounds.height = next.bounds.y + next.bounds.height - current.bounds.y;
    } else {
      merged.push(current);
      current = { ...next };
    }
  }

  merged.push(current);
  return merged;
}

/**
 * Extract reading order from blocks (handles multi-column layouts)
 */
export function getReadingOrder(blocks: TextBlock[], columnCount: number): TextBlock[] {
  if (columnCount === 1) {
    // Single column: sort by y, then x
    return [...blocks].sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      if (Math.abs(a.bounds.y - b.bounds.y) < 10) return a.bounds.x - b.bounds.x;
      return a.bounds.y - b.bounds.y;
    });
  }

  // Multi-column: group by column, then sort
  const pageGroups = new Map<number, TextBlock[]>();
  for (const block of blocks) {
    const existing = pageGroups.get(block.page) ?? [];
    existing.push(block);
    pageGroups.set(block.page, existing);
  }

  const result: TextBlock[] = [];

  for (const [, pageBlocks] of pageGroups) {
    // Determine column boundaries
    const bodyBlocks = pageBlocks.filter((b) => b.zone === 'body');
    const maxX = Math.max(...bodyBlocks.map((b) => b.bounds.x + b.bounds.width));
    const columnWidth = maxX / columnCount;

    // Assign blocks to columns
    const columns: TextBlock[][] = Array.from({ length: columnCount }, () => []);
    for (const block of pageBlocks) {
      const colIdx = Math.min(columnCount - 1, Math.floor(block.bounds.x / columnWidth));
      columns[colIdx].push(block);
    }

    // Sort within each column by y
    for (const col of columns) {
      col.sort((a, b) => a.bounds.y - b.bounds.y);
    }

    // Interleave columns in reading order (left to right)
    for (const col of columns) {
      result.push(...col);
    }
  }

  return result;
}

/**
 * Parse PDF buffer to extract layout (placeholder for actual PDF library integration)
 */
export async function parseLayoutFromBuffer(
  buffer: Buffer,
  options?: {
    detectTables?: boolean;
    detectEquations?: boolean;
  }
): Promise<DocumentLayout> {
  // This is a placeholder. In production, integrate with pdf.js or pdf-parse.
  // The actual implementation would:
  // 1. Load PDF using pdfjs-dist
  // 2. Extract text items with position data
  // 3. Build TextBlocks from items
  // 4. Classify zones and detect columns
  // 5. Return structured DocumentLayout

  // For now, return a mock structure
  return {
    pageCount: 1,
    pages: [
      {
        pageNumber: 1,
        width: 612, // Letter size
        height: 792,
        blocks: [],
        columns: 1,
        hasHeader: false,
        hasFooter: false,
      },
    ],
    metadata: {},
  };
}

/**
 * Convert DocumentLayout to structured text with metadata
 */
export function layoutToStructuredText(layout: DocumentLayout): {
  text: string;
  sections: Array<{
    zone: LayoutZone;
    text: string;
    page: number;
    startOffset: number;
    endOffset: number;
  }>;
} {
  const sections: Array<{
    zone: LayoutZone;
    text: string;
    page: number;
    startOffset: number;
    endOffset: number;
  }> = [];

  let fullText = '';
  let currentOffset = 0;

  for (const page of layout.pages) {
    const orderedBlocks = getReadingOrder(page.blocks, page.columns);

    for (const block of orderedBlocks) {
      const startOffset = currentOffset;
      fullText += block.text + '\n';
      currentOffset = fullText.length;

      sections.push({
        zone: block.zone,
        text: block.text,
        page: block.page,
        startOffset,
        endOffset: currentOffset - 1,
      });
    }
  }

  return { text: fullText.trim(), sections };
}
