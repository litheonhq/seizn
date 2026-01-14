/**
 * Multimodal Retriever
 *
 * Advanced retrieval for layout-aware document search:
 * - Block type weighted search
 * - Table content search with structure awareness
 * - Context expansion (surrounding blocks)
 * - Highlighting support
 */

import { getEmbeddingProvider } from '@/lib/summer/embedding';
import {
  searchBlocksBySimilarity,
  getContextBlocks,
  queryBlocks,
} from '../store/block-store';
import type {
  DocumentBlock,
  BlockType,
  MultimodalSearchResult,
  MultimodalSearchOptions,
  HighlightSpan,
  ExpandedContext,
} from '../types';

/**
 * Default block type weights (higher = more important)
 */
const DEFAULT_BLOCK_WEIGHTS: Record<BlockType, number> = {
  heading: 1.5,
  table: 1.3,
  code: 1.2,
  caption: 1.1,
  text: 1.0,
  list: 1.0,
  figure: 0.8,
};

/**
 * Search options with defaults applied
 */
interface ResolvedSearchOptions {
  topK: number;
  blockTypes: BlockType[] | null;
  blockTypeWeights: Record<BlockType, number>;
  includeContext: boolean;
  contextWindow: number;
  threshold: number;
  pageRange: { start?: number; end?: number } | null;
}

/**
 * Perform multimodal search across document blocks
 */
export async function multimodalSearch(
  userId: string,
  collectionId: string,
  query: string,
  options: MultimodalSearchOptions = {}
): Promise<MultimodalSearchResult[]> {
  const opts = resolveOptions(options);

  // Generate query embedding
  const embeddingProvider = getEmbeddingProvider();
  const [queryEmbedding] = await embeddingProvider.embed([query], 'query');

  // Search for similar blocks
  const rawResults = await searchBlocksBySimilarity(
    userId,
    collectionId,
    queryEmbedding,
    {
      topK: opts.topK * 2, // Fetch more for re-ranking
      threshold: opts.threshold,
      blockTypes: opts.blockTypes ?? undefined,
      pageRange: opts.pageRange ?? undefined,
    }
  );

  // Apply block type weights
  const weightedResults = rawResults.map((result) => {
    const weight = opts.blockTypeWeights[result.blockType] ?? 1.0;
    return {
      ...result,
      weightedScore: result.similarity * weight,
    };
  });

  // Sort by weighted score
  weightedResults.sort((a, b) => b.weightedScore - a.weightedScore);

  // Take top K after weighting
  const topResults = weightedResults.slice(0, opts.topK);

  // Expand context if requested
  let finalResults: MultimodalSearchResult[];

  if (opts.includeContext) {
    finalResults = await Promise.all(
      topResults.map(async (result) => {
        const context = await getContextBlocks(
          userId,
          collectionId,
          result.id,
          opts.contextWindow
        );

        // Combine into result with context blocks
        const allBlocks = [
          ...context.before,
          result,
          ...context.after,
        ];

        // Generate highlights for the matched block
        const highlights = generateHighlights(result, query);

        return {
          blocks: allBlocks,
          score: result.weightedScore,
          highlights,
        };
      })
    );
  } else {
    finalResults = topResults.map((result) => ({
      blocks: [result],
      score: result.weightedScore,
      highlights: generateHighlights(result, query),
    }));
  }

  return finalResults;
}

/**
 * Search specifically within tables
 */
export async function searchTables(
  userId: string,
  collectionId: string,
  query: string,
  options: {
    topK?: number;
    threshold?: number;
    includeContext?: boolean;
  } = {}
): Promise<MultimodalSearchResult[]> {
  return multimodalSearch(userId, collectionId, query, {
    ...options,
    blockTypes: ['table', 'caption'],
    blockTypeWeights: {
      ...DEFAULT_BLOCK_WEIGHTS,
      table: 2.0, // Boost table matches
      caption: 1.5,
    },
  });
}

/**
 * Search specifically within code blocks
 */
export async function searchCode(
  userId: string,
  collectionId: string,
  query: string,
  options: {
    topK?: number;
    threshold?: number;
    includeContext?: boolean;
  } = {}
): Promise<MultimodalSearchResult[]> {
  return multimodalSearch(userId, collectionId, query, {
    ...options,
    blockTypes: ['code'],
    blockTypeWeights: {
      ...DEFAULT_BLOCK_WEIGHTS,
      code: 2.0, // Boost code matches
    },
  });
}

/**
 * Search with page range constraint
 */
export async function searchInPages(
  userId: string,
  collectionId: string,
  query: string,
  pageStart: number,
  pageEnd: number,
  options: MultimodalSearchOptions = {}
): Promise<MultimodalSearchResult[]> {
  return multimodalSearch(userId, collectionId, query, {
    ...options,
    pageRange: { start: pageStart, end: pageEnd },
  });
}

/**
 * Get expanded context for a specific block
 */
export async function expandBlockContext(
  userId: string,
  collectionId: string,
  blockId: string,
  windowSize: number = 2
): Promise<ExpandedContext | null> {
  const supabase = await import('@/lib/supabase').then((m) => m.createServerClient());

  // Get the target block
  const { data: targetData, error: targetError } = await supabase
    .from('document_blocks')
    .select('*')
    .eq('id', blockId)
    .eq('user_id', userId)
    .single();

  if (targetError || !targetData) {
    return null;
  }

  const context = await getContextBlocks(userId, collectionId, blockId, windowSize);

  return {
    matchedBlock: targetData as DocumentBlock,
    beforeBlocks: context.before,
    afterBlocks: context.after,
  };
}

/**
 * Retrieve all blocks of a specific type from a document
 */
export async function getBlocksByType(
  userId: string,
  collectionId: string,
  documentId: string,
  blockType: BlockType
): Promise<DocumentBlock[]> {
  return queryBlocks(userId, collectionId, {
    documentId,
    blockTypes: [blockType],
    orderBy: 'orderIndex',
    orderDirection: 'asc',
  });
}

/**
 * Get document outline (headings only)
 */
export async function getDocumentOutline(
  userId: string,
  collectionId: string,
  documentId: string
): Promise<DocumentBlock[]> {
  return getBlocksByType(userId, collectionId, documentId, 'heading');
}

/**
 * Get all tables in a document
 */
export async function getDocumentTables(
  userId: string,
  collectionId: string,
  documentId: string
): Promise<DocumentBlock[]> {
  return getBlocksByType(userId, collectionId, documentId, 'table');
}

/**
 * Find blocks near a specific page
 */
export async function findBlocksNearPage(
  userId: string,
  collectionId: string,
  documentId: string,
  pageNumber: number,
  range: number = 1
): Promise<DocumentBlock[]> {
  return queryBlocks(userId, collectionId, {
    documentId,
    pageRange: {
      start: Math.max(1, pageNumber - range),
      end: pageNumber + range,
    },
    orderBy: 'orderIndex',
    orderDirection: 'asc',
  });
}

/**
 * Resolve search options with defaults
 */
function resolveOptions(options: MultimodalSearchOptions): ResolvedSearchOptions {
  return {
    topK: options.topK ?? 10,
    blockTypes: options.blockTypes ?? null,
    blockTypeWeights: {
      ...DEFAULT_BLOCK_WEIGHTS,
      ...options.blockTypeWeights,
    },
    includeContext: options.includeContext ?? false,
    contextWindow: options.contextWindow ?? 2,
    threshold: options.threshold ?? 0.5,
    pageRange: options.pageRange ?? null,
  };
}

/**
 * Generate highlight spans for a block based on query terms
 */
function generateHighlights(
  block: DocumentBlock,
  query: string
): HighlightSpan[] {
  const spans: [number, number][] = [];
  const content = block.content.toLowerCase();
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);

  for (const term of queryTerms) {
    if (term.length < 2) continue; // Skip very short terms

    let pos = 0;
    while (pos < content.length) {
      const idx = content.indexOf(term, pos);
      if (idx === -1) break;

      spans.push([idx, idx + term.length]);
      pos = idx + term.length;
    }
  }

  // Merge overlapping spans
  const mergedSpans = mergeOverlappingSpans(spans);

  if (mergedSpans.length === 0) {
    return [];
  }

  return [
    {
      blockId: block.id,
      spans: mergedSpans,
    },
  ];
}

/**
 * Merge overlapping highlight spans
 */
function mergeOverlappingSpans(spans: [number, number][]): [number, number][] {
  if (spans.length === 0) return [];

  // Sort by start position
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current[0] <= last[1]) {
      // Overlapping, extend the last span
      last[1] = Math.max(last[1], current[1]);
    } else {
      // Non-overlapping, add new span
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Compute a relevance score boost based on block position
 * Blocks near the beginning or end of documents are often more important
 */
export function computePositionBoost(
  orderIndex: number,
  totalBlocks: number
): number {
  if (totalBlocks === 0) return 1.0;

  const position = orderIndex / totalBlocks;

  // Boost for first 10% and last 5% of document
  if (position < 0.1) {
    return 1.2; // Introduction/abstract boost
  }
  if (position > 0.95) {
    return 1.1; // Conclusion boost
  }

  return 1.0;
}

/**
 * Re-rank results based on multiple signals
 */
export function reRankResults(
  results: Array<DocumentBlock & { similarity: number }>,
  query: string,
  options: {
    blockTypeWeights?: Partial<Record<BlockType, number>>;
    usePositionBoost?: boolean;
    totalBlocks?: number;
  } = {}
): Array<DocumentBlock & { similarity: number; finalScore: number }> {
  const weights = { ...DEFAULT_BLOCK_WEIGHTS, ...options.blockTypeWeights };
  const usePosition = options.usePositionBoost ?? true;
  const totalBlocks = options.totalBlocks ?? 100;

  return results
    .map((result) => {
      let score = result.similarity;

      // Apply block type weight
      score *= weights[result.blockType] ?? 1.0;

      // Apply position boost
      if (usePosition && result.orderIndex !== undefined) {
        score *= computePositionBoost(result.orderIndex, totalBlocks);
      }

      // Boost exact phrase matches
      if (result.content.toLowerCase().includes(query.toLowerCase())) {
        score *= 1.1;
      }

      return {
        ...result,
        finalScore: score,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}
