/**
 * Memory Search v4 API
 *
 * Advanced search with Beyond Mem0 features:
 * - Tier-aware retrieval (MemGPT-style)
 * - Late-interaction reranking
 * - GraphRAG community context
 * - Hybrid search modes
 *
 * POST /api/memories/search_v4
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import { createSearchServiceV3 } from '@/lib/spring/memory-v4';
import { createTierManagerService, type MemoryTier } from '@/lib/spring/memory-v4';
import { createHybridRetriever } from '@/lib/retrieval/late-interaction';
import { createCommunitySummaryService } from '@/lib/graph-rag/community';
import type { SearchFiltersV3 } from '@/lib/spring/memory-v4';

// =============================================================================
// Types
// =============================================================================

interface SearchV4Request {
  query: string;
  topK?: number;
  filters?: SearchFiltersV3;
  advanced?: {
    /** Use late-interaction (ColBERT) reranking */
    useLateInteraction?: boolean;
    /** Augment with GraphRAG community context */
    useGraphRAG?: boolean;
    /** Include community summaries */
    useCommunities?: boolean;
    /** Graph ID for GraphRAG (if different from default) */
    graphId?: string;
    /** Tier-based retrieval strategy */
    tierStrategy?: 'hot_first' | 'balanced' | 'comprehensive';
    /** Custom tier budgets */
    tierBudgets?: {
      hot?: number;
      warm?: number;
      cold?: number;
    };
    /** Recall mode for HNSW */
    recallMode?: 'fast' | 'balanced' | 'high_recall';
    /** Include memory tiers in response */
    includeTiers?: boolean;
  };
}

interface SearchV4Response {
  results: Array<{
    id: string;
    content: string;
    type: string;
    similarity: number;
    tier?: MemoryTier;
    lateInteractionScore?: number;
    tags?: string[];
    categories?: string[];
  }>;
  totalResults: number;
  query: string;
  graphContext?: {
    communities: Array<{
      id: string;
      name?: string;
      summary: string;
      similarity: number;
    }>;
    entities?: Array<{
      name: string;
      type: string;
    }>;
  };
  metadata: {
    searchMode: string;
    processingMs: number;
    tierDistribution?: Record<MemoryTier, number>;
    usedLateInteraction: boolean;
    usedGraphRAG: boolean;
  };
}

// =============================================================================
// Handler
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = (await request.json()) as SearchV4Request;

    const {
      query,
      topK = 20,
      filters = {},
      advanced = {},
    } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const startTime = Date.now();
    const supabase = createServerClient();

    // Initialize services
    const searchService = createSearchServiceV3(supabase);
    const tierManager = createTierManagerService(supabase);

    // Determine search strategy
    const tierStrategy = advanced.tierStrategy ?? 'balanced';
    const useLateInteraction = advanced.useLateInteraction ?? false;
    const useGraphRAG = advanced.useGraphRAG ?? false;
    const useCommunities = advanced.useCommunities ?? false;

    // Step 1: Base search with tier awareness
    const searchResults = await searchService.search(userId, {
      query,
      topK: topK * 2, // Oversample for filtering/reranking
      filters,
      mode: 'hybrid',
      rerank: true,
      recallMode: advanced.recallMode ?? 'balanced',
    });

    // Step 2: Apply tier filtering if using tier strategy
    let tierDistribution: Record<MemoryTier, number> | undefined;

    if (tierStrategy !== 'comprehensive' && advanced.includeTiers) {
      // Get tier info for all results in a single batch query
      const tierMap = await tierManager.calculateTiersBatch(
        searchResults.results.map((r) => r.id),
        userId,
      );
      const resultsWithTiers = searchResults.results.map((r) => ({
        ...r,
        tier: tierMap.get(r.id) ?? 'warm',
      }));

      // Categorize by tier
      const hotResults = resultsWithTiers.filter((r) => r.tier === 'hot');
      const warmResults = resultsWithTiers.filter((r) => r.tier === 'warm');
      const coldResults = resultsWithTiers.filter((r) => r.tier === 'cold');
      const frozenResults = resultsWithTiers.filter((r) => r.tier === 'frozen');

      let hotSliced: typeof resultsWithTiers = [];
      let warmSliced: typeof resultsWithTiers = [];
      let coldSliced: typeof resultsWithTiers = [];

      // Apply tier strategy
      if (tierStrategy === 'hot_first') {
        // Prioritize hot tier
        const tierBudgets = advanced.tierBudgets ?? { hot: 60, warm: 30, cold: 10 };
        const hotCount = Math.ceil(topK * (tierBudgets.hot ?? 60) / 100);
        const warmCount = Math.ceil(topK * (tierBudgets.warm ?? 30) / 100);
        const coldCount = topK - hotCount - warmCount;

        hotSliced = hotResults.slice(0, hotCount);
        warmSliced = warmResults.slice(0, warmCount);
        coldSliced = coldResults.slice(0, coldCount);

        searchResults.results = [...hotSliced, ...warmSliced, ...coldSliced];
      } else if (tierStrategy === 'balanced') {
        // Balanced approach
        const tierBudgets = advanced.tierBudgets ?? { hot: 40, warm: 40, cold: 20 };
        const hotCount = Math.ceil(topK * (tierBudgets.hot ?? 40) / 100);
        const warmCount = Math.ceil(topK * (tierBudgets.warm ?? 40) / 100);
        const coldCount = topK - hotCount - warmCount;

        hotSliced = hotResults.slice(0, hotCount);
        warmSliced = warmResults.slice(0, warmCount);
        coldSliced = coldResults.slice(0, coldCount);

        searchResults.results = [...hotSliced, ...warmSliced, ...coldSliced];
      }

      // Calculate tier distribution from sliced results
      tierDistribution = {
        hot: hotSliced.length,
        warm: warmSliced.length,
        cold: coldSliced.length,
        frozen: frozenResults.length,
      };
    }

    // Step 3: Late-interaction reranking
    let lateInteractionApplied = false;
    if (useLateInteraction && searchResults.results.length > 0) {
      try {
        const hybridRetriever = createHybridRetriever();

        // Rerank using late interaction
        const reranked = await hybridRetriever.retrieve(query, '', {
          topK,
          lateInteraction: true,
          denseBias: 0.4,
          sparseBias: 0.2,
        });

        // Merge scores with existing results
        const rerankedMap = new Map(
          reranked.documents.map((d) => [d.id, d.lateInteractionScore ?? 0])
        );

        // Add late interaction scores and re-sort
        const resultsWithLateInteraction = searchResults.results.map((r) => ({
          ...r,
          lateInteractionScore: rerankedMap.get(r.id) ?? 0,
        }));

        // Re-sort by combined score (combinedScore is the primary similarity metric)
        resultsWithLateInteraction.sort((a, b) => {
          const aScore = a.combinedScore * 0.6 + a.lateInteractionScore * 0.4;
          const bScore = b.combinedScore * 0.6 + b.lateInteractionScore * 0.4;
          return bScore - aScore;
        });

        searchResults.results = resultsWithLateInteraction;

        lateInteractionApplied = true;
      } catch (error) {
        console.error('Late interaction reranking failed:', error);
        // Continue without late interaction
      }
    }

    // Step 4: GraphRAG community context
    let graphContext: SearchV4Response['graphContext'] | undefined;
    let graphRAGApplied = false;

    if ((useGraphRAG || useCommunities) && advanced.graphId) {
      try {
        const summaryService = createCommunitySummaryService(supabase);

        const relevantCommunities = await summaryService.findRelevantCommunities(
          advanced.graphId,
          query,
          { topK: 3, minSimilarity: 0.5 }
        );

        if (relevantCommunities.length > 0) {
          graphContext = {
            communities: relevantCommunities.map((c) => ({
              id: c.community.id,
              name: c.community.name,
              summary: c.summary,
              similarity: c.similarity,
            })),
          };
          graphRAGApplied = true;
        }
      } catch (error) {
        console.error('GraphRAG context retrieval failed:', error);
        // Continue without GraphRAG
      }
    }

    // Step 5: Trim to final topK
    searchResults.results = searchResults.results.slice(0, topK);

    // Build response
    const response: SearchV4Response = {
      results: searchResults.results.map((r) => ({
        id: r.id,
        content: r.content,
        type: r.type,
        similarity: r.combinedScore,
        tier: advanced.includeTiers ? (r as { tier?: MemoryTier }).tier : undefined,
        lateInteractionScore: lateInteractionApplied ? (r as { lateInteractionScore?: number }).lateInteractionScore : undefined,
        tags: r.tags,
        categories: r.category ? [r.category] : [],
      })),
      totalResults: searchResults.results.length,
      query,
      graphContext,
      metadata: {
        searchMode: tierStrategy,
        processingMs: Date.now() - startTime,
        tierDistribution,
        usedLateInteraction: lateInteractionApplied,
        usedGraphRAG: graphRAGApplied,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Search v4 error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 }
    );
  }
}
