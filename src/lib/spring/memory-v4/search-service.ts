/**
 * Search Service v3
 *
 * Advanced search with filters, query expansion, and intelligent reranking.
 * Implements Mem0-style "Advanced Retrieval" pattern.
 *
 * HNSW Optimization:
 * - ef_search parameter tuning based on recall mode and collection size
 * - 2-stage query pattern for filtered searches
 * - Iterative scan support (pgvector 0.8.0+)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { computeEmbedding } from '@/lib/embeddings';
import { getLanguageProcessor } from './language-processor';
import type {
  SearchV3Request,
  SearchV3Response,
  SearchV3Result,
  SearchFiltersV3,
  QueryExpansion,
} from './types';

// =============================================================================
// HNSW Tuning Configuration
// =============================================================================

export type RecallMode = 'fast' | 'balanced' | 'high_recall';

export interface HNSWConfig {
  /** ef_search parameter (higher = better recall, slower) */
  efSearch: number;
  /** Oversample factor for 2-stage filtering (3-5x typical) */
  oversampleFactor: number;
  /** Whether to use iterative scan for filtered queries */
  useIterativeScan: boolean;
}

/** Default HNSW configurations by recall mode */
const HNSW_PRESETS: Record<RecallMode, HNSWConfig> = {
  fast: {
    efSearch: 40,
    oversampleFactor: 2,
    useIterativeScan: false,
  },
  balanced: {
    efSearch: 100,
    oversampleFactor: 3,
    useIterativeScan: true,
  },
  high_recall: {
    efSearch: 200,
    oversampleFactor: 5,
    useIterativeScan: true,
  },
};

/**
 * Calculate optimal ef_search based on collection characteristics
 */
export function calculateEfSearch(
  topK: number,
  vectorCount: number,
  hasFilters: boolean,
  recallMode: RecallMode = 'balanced'
): number {
  // Base: 4x topK minimum
  let efSearch = Math.max(40, topK * 4);

  // Adjust for collection size
  if (vectorCount > 100000) {
    efSearch = Math.round(efSearch * 1.5);
  } else if (vectorCount > 10000) {
    efSearch = Math.round(efSearch * 1.25);
  }

  // Adjust for filters (need more candidates to filter from)
  if (hasFilters) {
    efSearch = Math.round(efSearch * 1.5);
  }

  // Apply mode multiplier
  const modeMultipliers: Record<RecallMode, number> = {
    fast: 0.6,
    balanced: 1.0,
    high_recall: 2.0,
  };
  efSearch = Math.round(efSearch * modeMultipliers[recallMode]);

  // Clamp to valid range
  return Math.max(16, Math.min(400, efSearch));
}

// =============================================================================
// Search Service v3
// =============================================================================

export class SearchServiceV3 {
  private anthropic: Anthropic | null = null;
  private vectorCount: number = 0;
  private vectorCountCacheTime: number = 0;
  private readonly VECTOR_COUNT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private supabase: SupabaseClient) {
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
  }

  /**
   * Get cached vector count for ef_search calculation
   */
  private async getVectorCount(userId: string): Promise<number> {
    const now = Date.now();
    if (now - this.vectorCountCacheTime < this.VECTOR_COUNT_CACHE_TTL) {
      return this.vectorCount;
    }

    try {
      const { count, error } = await this.supabase
        .from('spring_memory_notes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'active')
        .not('embedding', 'is', null);

      if (!error && count !== null) {
        this.vectorCount = count;
        this.vectorCountCacheTime = now;
      }
    } catch {
      // Use cached value on error
    }

    return this.vectorCount;
  }

  /**
   * Check if filters are present (affects HNSW tuning)
   */
  private hasFilters(filters: SearchFiltersV3): boolean {
    return !!(
      filters.types?.length ||
      filters.categories?.length ||
      filters.tags?.length ||
      filters.privacyClasses?.length ||
      filters.statuses?.length ||
      filters.agentId ||
      filters.namespace ||
      filters.language ||
      filters.time?.since ||
      filters.time?.until
    );
  }

  /**
   * Get HNSW configuration based on request parameters
   */
  private async getHNSWConfig(
    userId: string,
    topK: number,
    filters: SearchFiltersV3,
    recallMode: RecallMode = 'balanced'
  ): Promise<HNSWConfig> {
    const vectorCount = await this.getVectorCount(userId);
    const hasFilters = this.hasFilters(filters);

    // Use preset as base
    const preset = HNSW_PRESETS[recallMode];

    // Calculate optimal ef_search
    const efSearch = calculateEfSearch(topK, vectorCount, hasFilters, recallMode);

    return {
      efSearch,
      oversampleFactor: hasFilters ? preset.oversampleFactor : 2,
      useIterativeScan: preset.useIterativeScan && hasFilters,
    };
  }

  /**
   * Perform advanced search with filters and optional enhancements.
   * Supports cross-lingual search via canonical embeddings.
   */
  async search(
    userId: string,
    request: SearchV3Request & { recallMode?: RecallMode }
  ): Promise<SearchV3Response> {
    const startTime = Date.now();

    // Default values
    const mode = request.mode || 'hybrid';
    const topK = Math.min(request.topK || 20, 100);
    const filters = request.filters || {};
    const recallMode = request.recallMode || 'balanced';

    // Fast existence probe: if the user has no v4 notes at all, skip the
    // embedding + 3-RPC fallback chain that otherwise runs to completion and
    // returns an empty array anyway. Saves ~10–30s on cold paths and is the
    // root cause of the empty-pool 504s seen via the MCP surface.
    {
      const probe = await this.supabase
        .from('spring_memory_notes')
        .select('id')
        .eq('user_id', userId)
        .limit(1);
      if (probe.error) {
        // Probe failure (RLS denial, network blip, schema drift) shouldn't break
        // search — we just skip the short-circuit and fall through to the full
        // chain. Log so the failure is visible if it becomes systemic.
        console.warn('[search-service] empty-pool probe failed, continuing with full chain:', {
          userId,
          error: probe.error.message || String(probe.error),
        });
      } else if (Array.isArray(probe.data) && probe.data.length === 0) {
        console.log('[search-service] empty-pool short-circuit', {
          userId,
          mode,
          processingMs: Date.now() - startTime,
        });
        return {
          results: [],
          total: 0,
          filters,
          mode: 'empty_pool',
          processingMs: Date.now() - startTime,
        };
      }
    }

    // Get HNSW configuration
    const hnswConfig = await this.getHNSWConfig(userId, topK, filters, recallMode);

    // Query expansion (if enabled and mode is advanced)
    let queryExpansion: QueryExpansion | undefined;
    if (request.expandQuery && (mode === 'advanced' || mode === 'hybrid')) {
      queryExpansion = await this.expandQuery(request.query);
    }

    // Generate embedding for the query
    const queryEmbedding = await this.generateEmbedding(request.query);

    // Detect query language for cross-lingual search
    const langProcessor = getLanguageProcessor();
    const queryLang = await langProcessor.processQuery(request.query);

    let searchResults: SearchV3Result[];
    let usedMode: string = mode;
    const fetchLimit = topK * (request.rerank ? 3 : 1);

    // Route to the best search strategy based on mode
    if (mode === 'hybrid') {
      // Try PGroonga hybrid search (dense + lexical + RRF)
      const { data: hybridResults, error: hybridError } =
        await this.supabase.rpc('search_memories_hybrid', {
          p_user_id: userId,
          p_query_embedding: queryEmbedding,
          p_query_text: request.query,
          p_language: filters.language || null,
          p_limit: fetchLimit,
          p_rrf_k: 60,
          p_dense_weight: 0.6,
          p_lexical_weight: 0.4,
          p_min_similarity: 0.3,
          p_use_canonical: true,
        });

      if (!hybridError && hybridResults?.length > 0) {
        usedMode = 'hybrid';
        searchResults = hybridResults.map(
          (row: Record<string, unknown>) => ({
            ...this.mapResultFromDb(row),
            language: row.language as string | undefined,
            matchedBy: row.matched_by as 'dense' | 'lexical' | 'both' | undefined,
            matchedRepr: row.matched_repr as 'raw' | 'normalized' | 'canonical' | 'romanized' | undefined,
          })
        );
      } else {
        // Fallback: try cross-lingual search
        const { data: crossLingualResults, error: crossLingualError } =
          await this.supabase.rpc('search_memories_crosslingual', {
            p_user_id: userId,
            p_query_embedding: queryEmbedding,
            p_language: filters.language || null,
            p_use_canonical: true,
            p_limit: fetchLimit,
            p_min_similarity: 0.5,
          });

        if (!crossLingualError && crossLingualResults?.length > 0) {
          usedMode = 'crosslingual';
          searchResults = crossLingualResults.map(
            (row: Record<string, unknown>) => ({
              ...this.mapResultFromDb(row),
              language: row.language as string | undefined,
              searchMode: (row.search_mode as 'direct' | 'canonical') || 'direct',
            })
          );
        } else {
          // Final fallback: standard v3 search
          const { data: results, error } = await this.supabase.rpc(
            'search_spring_memory_notes_v3',
            {
              p_user_id: userId,
              p_query_embedding: queryEmbedding,
              p_query_text: request.query,
              p_types: filters.types || null,
              p_categories: filters.categories || null,
              p_tags: filters.tags || null,
              p_privacy_classes: filters.privacyClasses || null,
              p_statuses: filters.statuses || null,
              p_agent_id: filters.agentId || null,
              p_namespace: filters.namespace || null,
              p_since: filters.time?.since || null,
              p_until: filters.time?.until || null,
              p_include_expired: filters.includeExpired || false,
              p_limit: fetchLimit,
              p_ef_search: hnswConfig.efSearch,
            }
          );

          if (error) {
            throw new Error(`Search failed: ${error.message}`);
          }

          usedMode = 'semantic';
          searchResults = (results || []).map(this.mapResultFromDb);
        }
      }
    } else {
      // Non-hybrid modes: cross-lingual then v3 fallback
      const { data: crossLingualResults, error: crossLingualError } =
        await this.supabase.rpc('search_memories_crosslingual', {
          p_user_id: userId,
          p_query_embedding: queryEmbedding,
          p_language: filters.language || null,
          p_use_canonical: true,
          p_limit: fetchLimit,
          p_min_similarity: 0.5,
        });

      if (!crossLingualError && crossLingualResults?.length > 0) {
        usedMode = 'crosslingual';
        searchResults = crossLingualResults.map(
          (row: Record<string, unknown>) => ({
            ...this.mapResultFromDb(row),
            language: row.language as string | undefined,
            searchMode: (row.search_mode as 'direct' | 'canonical') || 'direct',
          })
        );
      } else {
        const { data: results, error } = await this.supabase.rpc(
          'search_spring_memory_notes_v3',
          {
            p_user_id: userId,
            p_query_embedding: queryEmbedding,
            p_query_text: request.query,
            p_types: filters.types || null,
            p_categories: filters.categories || null,
            p_tags: filters.tags || null,
            p_privacy_classes: filters.privacyClasses || null,
            p_statuses: filters.statuses || null,
            p_agent_id: filters.agentId || null,
            p_namespace: filters.namespace || null,
            p_since: filters.time?.since || null,
            p_until: filters.time?.until || null,
            p_include_expired: filters.includeExpired || false,
            p_limit: fetchLimit,
            p_ef_search: hnswConfig.efSearch,
          }
        );

        if (error) {
          throw new Error(`Search failed: ${error.message}`);
        }

        searchResults = (results || []).map(this.mapResultFromDb);
      }
    }

    // Reranking (if enabled)
    if (request.rerank && searchResults.length > 0) {
      searchResults = await this.rerankResults(request.query, searchResults);
      searchResults = searchResults.slice(0, topK);
    }

    // Add usage stats if requested
    if (request.includeUsage) {
      searchResults = await this.addUsageStats(searchResults);
    }

    const processingMs = Date.now() - startTime;

    return {
      results: searchResults,
      total: searchResults.length,
      queryExpansion: queryExpansion
        ? {
            original: request.query,
            expanded: queryExpansion.expandedTerms,
            synonyms: queryExpansion.synonyms.flatMap((s) => s.synonyms),
            entities: queryExpansion.entities.map((e) => e.text),
          }
        : undefined,
      filters,
      mode: usedMode,
      processingMs,
    };
  }

  /**
   * Expand query with synonyms and entities
   */
  async expandQuery(query: string): Promise<QueryExpansion> {
    if (!this.anthropic) {
      return {
        originalQuery: query,
        expandedTerms: [query],
        synonyms: [],
        entities: [],
      };
    }

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: `Analyze this search query and provide expansions:

Query: "${query}"

Return a JSON object with:
1. "expandedTerms": array of alternative phrasings (max 3)
2. "synonyms": array of {"term": "...", "synonyms": [...]} for key terms
3. "entities": array of {"text": "...", "type": "person|project|tool|concept", "aliases": [...]}

Only include relevant expansions. Return valid JSON only.`,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const parsed = JSON.parse(content.text);

      return {
        originalQuery: query,
        expandedTerms: parsed.expandedTerms || [query],
        synonyms: parsed.synonyms || [],
        entities: parsed.entities || [],
      };
    } catch (error) {
      console.error('Query expansion failed:', error);
      return {
        originalQuery: query,
        expandedTerms: [query],
        synonyms: [],
        entities: [],
      };
    }
  }

  /**
   * Rerank results using LLM
   */
  async rerankResults(
    query: string,
    results: SearchV3Result[]
  ): Promise<SearchV3Result[]> {
    if (!this.anthropic || results.length === 0) {
      return results;
    }

    try {
      // Prepare documents for reranking
      const docs = results.slice(0, 30).map((r, i) => ({
        id: i,
        content: r.content.slice(0, 500),
      }));

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: `Rerank these documents by relevance to the query.

Query: "${query}"

Documents:
${docs.map((d) => `[${d.id}] ${d.content}`).join('\n\n')}

Return a JSON array of document IDs in order of relevance (most relevant first).
Only return the array, e.g., [3, 1, 0, 2]`,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const rankedIds: number[] = JSON.parse(content.text);

      // Reorder results based on ranking
      const reranked: SearchV3Result[] = [];
      for (let i = 0; i < rankedIds.length; i++) {
        const idx = rankedIds[i];
        if (idx >= 0 && idx < results.length) {
          const result = { ...results[idx] };
          result.rerankScore = 1 - i / rankedIds.length; // Score from 1.0 to 0
          reranked.push(result);
        }
      }

      // Add any results not in ranking
      for (let i = 0; i < results.length; i++) {
        if (!rankedIds.includes(i)) {
          reranked.push(results[i]);
        }
      }

      return reranked;
    } catch (error) {
      console.error('Reranking failed:', error);
      return results;
    }
  }

  /**
   * Add usage statistics to results
   */
  async addUsageStats(results: SearchV3Result[]): Promise<SearchV3Result[]> {
    if (results.length === 0) return results;

    const noteIds = results.map((r) => r.id);

    const { data: usageData } = await this.supabase
      .from('spring_memory_usage')
      .select('note_id, created_at')
      .in('note_id', noteIds)
      .order('created_at', { ascending: false });

    // Count usages per note
    const usageCounts = new Map<string, { count: number; lastUsed: Date }>();
    for (const usage of usageData || []) {
      const existing = usageCounts.get(usage.note_id);
      if (existing) {
        existing.count++;
      } else {
        usageCounts.set(usage.note_id, {
          count: 1,
          lastUsed: new Date(usage.created_at),
        });
      }
    }

    // Merge usage stats into results
    return results.map((r) => {
      const usage = usageCounts.get(r.id);
      return {
        ...r,
        usageCount: usage?.count || 0,
        lastUsedAt: usage?.lastUsed,
      };
    });
  }

  /**
   * Generate embedding for a query using the shared embedding provider
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    return computeEmbedding(text, 'query');
  }

  /**
   * Map database result to SearchV3Result
   * Fixed: use note_type instead of type (v3 schema compatibility)
   */
  private mapResultFromDb(row: Record<string, unknown>): SearchV3Result {
    return {
      id: row.id as string,
      content: row.content as string,
      // Fixed: v3 uses note_type column, not type
      type: (row.note_type || row.type) as string,
      status: row.status as string,
      category: row.category as string | undefined,
      tags: (row.tags as string[]) || [],
      privacyClass: row.privacy_class as string,
      // Fixed: v3 uses payload_json, not metadata
      metadata: (row.metadata || row.payload_json) as Record<string, unknown> | undefined,
      extractionConfidence: row.extraction_confidence
        ? parseFloat(row.extraction_confidence as string)
        : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      validUntil: row.valid_until ? new Date(row.valid_until as string) : undefined,
      semanticScore: row.semantic_score as number,
      keywordScore: row.keyword_score as number,
      combinedScore: row.combined_score as number,
      language: row.language as string | undefined,
      searchMode: (row.search_mode as 'direct' | 'canonical') || undefined,
    };
  }

  /**
   * Search with graph expansion (follows edges to find related memories)
   */
  async searchWithGraphExpansion(
    userId: string,
    query: string,
    options: {
      limit?: number;
      expandHops?: number;
      edgeTypes?: string[];
      recallMode?: RecallMode;
    } = {}
  ): Promise<{ results: SearchV3Result[]; expanded: boolean }> {
    const limit = options.limit || 10;
    const expandHops = options.expandHops || 1;
    const edgeTypes = options.edgeTypes || ['relates_to', 'supports', 'derived_from'];
    const recallMode = options.recallMode || 'balanced';

    // Get HNSW config
    const hnswConfig = await this.getHNSWConfig(userId, limit, {}, recallMode);

    // Generate embedding
    const queryEmbedding = await this.generateEmbedding(query);

    // Try graph-expanded search
    const { data: graphResults, error } = await this.supabase.rpc(
      'search_spring_memories_with_graph',
      {
        p_user_id: userId,
        p_query_embedding: queryEmbedding,
        p_limit: limit,
        p_expand_hops: expandHops,
        p_edge_types: edgeTypes,
        p_ef_search: hnswConfig.efSearch,
      }
    );

    if (error) {
      // Fallback to regular search if graph function doesn't exist
      console.warn('Graph search failed, falling back to regular search:', error.message);
      const response = await this.search(userId, {
        query,
        topK: limit,
        recallMode,
      });
      return { results: response.results, expanded: false };
    }

    const results = (graphResults || []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      content: row.content as string,
      type: row.note_type as string,
      status: 'active',
      tags: [],
      privacyClass: 'internal',
      createdAt: new Date(),
      updatedAt: new Date(),
      semanticScore: row.similarity as number,
      keywordScore: 0,
      combinedScore: row.similarity as number,
      isExpanded: row.is_expanded as boolean,
      expansionPath: row.expansion_path as string[],
    })) as SearchV3Result[];

    return {
      results,
      expanded: results.some((r) => (r as { isExpanded?: boolean }).isExpanded),
    };
  }

  /**
   * Unified search with flexible options
   */
  async searchUnified(
    userId: string,
    query: string,
    options: {
      queryText?: string;
      scope?: string;
      noteType?: string;
      types?: string[];
      tags?: string[];
      limit?: number;
      threshold?: number;
      efSearch?: number;
      mode?: 'semantic' | 'keyword' | 'hybrid';
    } = {}
  ): Promise<SearchV3Result[]> {
    const queryEmbedding = await this.generateEmbedding(query);

    const { data: results, error } = await this.supabase.rpc(
      'search_spring_memories_unified',
      {
        p_user_id: userId,
        p_query_embedding: queryEmbedding,
        p_options: {
          query_text: options.queryText || query,
          scope: options.scope,
          note_type: options.noteType,
          types: options.types,
          tags: options.tags,
          limit: options.limit || 10,
          threshold: options.threshold || 0.5,
          ef_search: options.efSearch || 100,
          mode: options.mode || 'hybrid',
        },
      }
    );

    if (error) {
      // Fallback to v3 search
      console.warn('Unified search failed, falling back:', error.message);
      const response = await this.search(userId, {
        query,
        topK: options.limit || 10,
        filters: {
          types: options.types,
          tags: options.tags,
          namespace: options.scope,
        },
      });
      return response.results;
    }

    return (results || []).map(this.mapResultFromDb.bind(this));
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createSearchServiceV3(supabase: SupabaseClient): SearchServiceV3 {
  return new SearchServiceV3(supabase);
}
