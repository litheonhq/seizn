/**
 * Layout-Aware PDF Parser
 *
 * Extracts text with layout information from PDFs,
 * preserving document structure (headers, columns, sections).
 */

import { PDFParse } from 'pdf-parse';

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

const DEFAULT_PAGE_WIDTH = 612; // Letter width in points
const DEFAULT_PAGE_HEIGHT = 792; // Letter height in points
const MAX_LINES_PER_PAGE = 1200;
const MAX_CHARS_PER_LINE = 400;

function normalizeLineText(line: string): string {
  return line
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function estimateLineFontSize(
  line: string,
  index: number,
  totalLines: number,
  baseFontSize: number
): number {
  if (index === 0 && line.length > 0 && line.length <= 120) {
    return Math.min(baseFontSize * 1.35, 20);
  }

  if (index <= Math.max(2, Math.floor(totalLines * 0.08)) && line.length <= 120) {
    return Math.min(baseFontSize * 1.15, 18);
  }

  return baseFontSize;
}

function inferSpecialZone(
  text: string,
  options?: {
    detectTables?: boolean;
    detectEquations?: boolean;
  }
): LayoutZone | null {
  const value = text.trim();
  if (!value) return null;

  if (
    options?.detectTables &&
    (value.includes('\t') || (value.includes('|') && value.split('|').length >= 3))
  ) {
    return 'table';
  }

  if (
    options?.detectEquations &&
    /[=+\-*/^]/.test(value) &&
    /[A-Za-z0-9]/.test(value) &&
    !/^https?:\/\//i.test(value)
  ) {
    return 'equation';
  }

  if (/^(figure|fig\.|table)\s+\d+/i.test(value)) {
    return 'caption';
  }

  return null;
}

function parseMetadataDate(infoResult: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDateNode?: () => any;
}): Date | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dates = infoResult.getDateNode?.() as any;
    const candidate = dates?.CreationDate ?? dates?.XmpCreateDate ?? dates?.ModDate;
    if (candidate instanceof Date && !Number.isNaN(candidate.getTime())) {
      return candidate;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

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
export function detectColumns(blocks: TextBlock[], _pageWidth: number): number {
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
 * Parse PDF buffer to extract layout-aware document structure.
 */
export async function parseLayoutFromBuffer(
  buffer: Buffer,
  options?: {
    detectTables?: boolean;
    detectEquations?: boolean;
  }
): Promise<DocumentLayout> {
  const parser = new PDFParse({ data: buffer });
  try {
    const [textResult, infoResult] = await Promise.all([
      parser.getText({ lineEnforce: true }),
      parser.getInfo({ parsePageInfo: true }),
    ]);

    const pageInfoByNumber = new Map(
      (infoResult.pages ?? []).map((page) => [page.pageNumber, page])
    );

    const pages: PageLayout[] = [];

    for (const pageText of textResult.pages ?? []) {
      const pageNumber = pageText.num;
      const pageInfo = pageInfoByNumber.get(pageNumber);
      const width = pageInfo?.width ?? DEFAULT_PAGE_WIDTH;
      const height = pageInfo?.height ?? DEFAULT_PAGE_HEIGHT;

      const lines = pageText.text
        .split(/\r?\n/)
        .map(normalizeLineText)
        .filter((line) => line.length > 0)
        .slice(0, MAX_LINES_PER_PAGE);

      const avgLineLength =
        lines.length > 0
          ? lines.reduce((sum, line) => sum + Math.min(line.length, MAX_CHARS_PER_LINE), 0) /
            lines.length
          : 0;
      const baseFontSize = Math.max(10, Math.min(14, 10 + avgLineLength / 120));
      const verticalSpacing =
        lines.length > 0 ? Math.max(12, (height * 0.82) / lines.length) : 14;
      const topOffset = height * 0.09;
      const baseX = width * 0.08;
      const maxTextWidth = width * 0.84;

      const preliminaryBlocks: Array<Omit<TextBlock, 'zone' | 'confidence'>> = lines.map(
        (line, index) => {
          const fontSize = estimateLineFontSize(line, index, lines.length, baseFontSize);
          const blockHeight = Math.max(LAYOUT_CONFIG.minBlockHeight, fontSize * 1.3);
          const y = Math.min(height - blockHeight, topOffset + index * verticalSpacing);
          const textWidth = Math.min(
            maxTextWidth,
            Math.max(fontSize * 2, Math.min(line.length, MAX_CHARS_PER_LINE) * fontSize * 0.55)
          );

          return {
            text: line,
            page: pageNumber,
            bounds: {
              x: baseX,
              y,
              width: textWidth,
              height: blockHeight,
            },
            fontSize,
            fontName: undefined,
            isBold:
              /[:：]$/.test(line) ||
              (line.length > 3 &&
                line.length <= 100 &&
                /^[A-Z0-9][A-Z0-9\s,.:;'"()/-]+$/.test(line)),
            isItalic: false,
          };
        }
      );

      const avgFontSize =
        preliminaryBlocks.length > 0
          ? preliminaryBlocks.reduce((sum, block) => sum + block.fontSize, 0) /
            preliminaryBlocks.length
          : baseFontSize;

      const classifiedBlocks: TextBlock[] = preliminaryBlocks.map((block) => {
        const specialZone = inferSpecialZone(block.text, options);
        if (specialZone) {
          return {
            ...block,
            zone: specialZone,
            confidence: 0.85,
          };
        }

        const classification = classifyZone(block, height, avgFontSize);
        return {
          ...block,
          zone: classification.zone,
          confidence: classification.confidence,
        };
      });

      const mergedBlocks = mergeAdjacentBlocks(classifiedBlocks);
      const columns = detectColumns(mergedBlocks, width);

      pages.push({
        pageNumber,
        width,
        height,
        blocks: mergedBlocks,
        columns,
        hasHeader: mergedBlocks.some((block) => block.zone === 'header'),
        hasFooter: mergedBlocks.some((block) => block.zone === 'footer'),
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const info = (infoResult.info ?? {}) as any;

    return {
      pageCount: pages.length || textResult.total || 0,
      pages,
      metadata: {
        title: typeof info.Title === 'string' ? info.Title : undefined,
        author: typeof info.Author === 'string' ? info.Author : undefined,
        createdAt: parseMetadataDate(infoResult),
        language: typeof info.Language === 'string' ? info.Language : undefined,
      },
    };
  } finally {
    await parser.destroy();
  }
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
