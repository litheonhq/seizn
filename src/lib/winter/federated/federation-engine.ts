/**
 * Seizn Winter - Federation Engine
 *
 * Orchestrates federated queries across multiple data sources,
 * handles result merging, deduplication, and scoring.
 */

import { createServerClient } from '@/lib/supabase';
import type {
  FederatedSource,
  FederatedQuery,
  FederatedQueryResponse,
  FederatedResultItem,
  SourceQueryResult,
  FederatedQueryDebug,
  MergeStrategy,
  DeduplicationStrategy,
  SourceHealthCheckResult,
  SourceHealthStatus,
} from './types';
import { SourceConnector, createConnector } from './source-connector';

// ============================================
// Federation Engine
// ============================================

export class FederationEngine {
  private connectors: Map<string, SourceConnector> = new Map();
  private sourceCache: Map<string, FederatedSource> = new Map();
  private healthCache: Map<string, SourceHealthCheckResult> = new Map();

  constructor(private readonly userId: string) {}

  // ============================================
  // Source Management
  // ============================================

  /**
   * Load and initialize all enabled sources for the user
   */
  async initialize(): Promise<void> {
    const supabase = createServerClient();

    const { data: sources, error } = await supabase
      .from('summer_federated_sources')
      .select('*')
      .eq('user_id', this.userId)
      .eq('is_active', true);

    if (error) {
      throw new Error(`Failed to load federated sources: ${error.message}`);
    }

    for (const source of sources || []) {
      try {
        const federatedSource = this.mapToFederatedSource(source);
        this.sourceCache.set(source.id, federatedSource);

        const connector = createConnector(federatedSource);
        await connector.connect();
        this.connectors.set(source.id, connector);
      } catch (err) {
        console.error(`Failed to initialize source ${source.id}:`, err);
      }
    }
  }

  /**
   * Add a new source connector
   */
  async addSource(source: FederatedSource): Promise<void> {
    this.sourceCache.set(source.id, source);

    const connector = createConnector(source);
    await connector.connect();
    this.connectors.set(source.id, connector);
  }

  /**
   * Remove a source connector
   */
  async removeSource(sourceId: string): Promise<void> {
    const connector = this.connectors.get(sourceId);
    if (connector) {
      await connector.disconnect();
      this.connectors.delete(sourceId);
    }
    this.sourceCache.delete(sourceId);
    this.healthCache.delete(sourceId);
  }

  /**
   * Get all registered sources
   */
  getSources(): FederatedSource[] {
    return Array.from(this.sourceCache.values());
  }

  /**
   * Get a specific source
   */
  getSource(sourceId: string): FederatedSource | undefined {
    return this.sourceCache.get(sourceId);
  }

  // ============================================
  // Query Execution
  // ============================================

  /**
   * Execute a federated query across sources
   */
  async query(query: FederatedQuery): Promise<FederatedQueryResponse> {
    const startTime = performance.now();
    const debug: Partial<FederatedQueryDebug> = query.debug
      ? {
          originalQuery: query.query,
          rawResults: {},
          timings: { queryDispatchMs: 0, mergeMs: 0, totalMs: 0 },
        }
      : {};

    // Determine which sources to query
    const targetSources = this.getTargetSources(query.sources);

    if (targetSources.length === 0) {
      return {
        success: true,
        results: [],
        totalCount: 0,
        sources: [],
        totalLatencyMs: 0,
        mergeStrategy: query.mergeStrategy || 'interleave',
        duplicatesRemoved: 0,
      };
    }

    // Execute queries based on execution mode
    const queryStartTime = performance.now();
    const sourceResults = await this.executeQueries(targetSources, query);
    if (debug.timings) {
      debug.timings.queryDispatchMs = performance.now() - queryStartTime;
    }

    // Store raw results for debug
    if (query.debug && debug.rawResults) {
      for (const result of sourceResults) {
        debug.rawResults[result.sourceId] = result.items;
      }
    }

    // Merge results
    const mergeStartTime = performance.now();
    const { merged, duplicatesRemoved } = this.mergeResults(
      sourceResults,
      query.mergeStrategy || 'interleave',
      query.deduplicationStrategy || 'none',
      query.topK
    );
    if (debug.timings) {
      debug.timings.mergeMs = performance.now() - mergeStartTime;
    }

    // Build source summaries
    const sourceSummaries: SourceQueryResult[] = sourceResults.map((result) => ({
      sourceId: result.sourceId,
      sourceName: result.sourceName,
      resultCount: result.items.length,
      latencyMs: result.latencyMs,
      success: result.success,
      error: result.error,
      warnings: result.warnings,
    }));

    const totalLatencyMs = Math.round(performance.now() - startTime);

    if (debug.timings) {
      debug.timings.totalMs = totalLatencyMs;
    }

    if (debug.mergeDetails === undefined && query.debug) {
      debug.mergeDetails = {
        strategy: query.mergeStrategy || 'interleave',
        inputCount: sourceResults.reduce((sum, r) => sum + r.items.length, 0),
        outputCount: merged.length,
        deduplicationMatches: duplicatesRemoved,
      };
    }

    return {
      success: true,
      results: merged,
      totalCount: merged.length,
      sources: sourceSummaries,
      totalLatencyMs,
      mergeStrategy: query.mergeStrategy || 'interleave',
      duplicatesRemoved,
      debug: query.debug ? (debug as FederatedQueryDebug) : undefined,
    };
  }

  /**
   * Get target sources for a query
   */
  private getTargetSources(sourceIds?: string[]): FederatedSource[] {
    const allSources = Array.from(this.sourceCache.values()).filter((s) => s.enabled);

    if (!sourceIds || sourceIds.length === 0) {
      return allSources;
    }

    return allSources.filter((s) => sourceIds.includes(s.id));
  }

  /**
   * Execute queries against all target sources
   */
  private async executeQueries(
    sources: FederatedSource[],
    query: FederatedQuery
  ): Promise<SourceQueryResultWithItems[]> {
    const timeout = query.sourceTimeoutMs || 5000;

    const queryPromises = sources.map(async (source) => {
      const connector = this.connectors.get(source.id);
      if (!connector) {
        return {
          sourceId: source.id,
          sourceName: source.name,
          items: [],
          resultCount: 0,
          latencyMs: 0,
          success: false,
          error: 'Connector not found',
        };
      }

      const startTime = performance.now();

      try {
        const results = await Promise.race([
          connector.search({
            query: query.query,
            embedding: query.embedding,
            topK: query.topK,
            threshold: query.threshold,
            filter: query.filter,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Query timeout')), timeout)
          ),
        ]);

        const items: FederatedResultItem[] = results.map((result, index) => ({
          id: `${source.id}_${result.id}`,
          documentId: result.documentId || result.id,
          content: result.content,
          score: result.score,
          rawScore: result.rawScore,
          sourceId: source.id,
          sourceName: source.name,
          sourceRank: index + 1,
          metadata: result.metadata || {},
          highlights: result.highlights,
        }));

        return {
          sourceId: source.id,
          sourceName: source.name,
          items,
          resultCount: items.length,
          latencyMs: Math.round(performance.now() - startTime),
          success: true,
        };
      } catch (error) {
        return {
          sourceId: source.id,
          sourceName: source.name,
          items: [],
          resultCount: 0,
          latencyMs: Math.round(performance.now() - startTime),
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    return Promise.all(queryPromises);
  }

  // ============================================
  // Result Merging
  // ============================================

  /**
   * Merge results from multiple sources
   */
  private mergeResults(
    sourceResults: SourceQueryResultWithItems[],
    strategy: MergeStrategy,
    deduplicationStrategy: DeduplicationStrategy,
    topK: number
  ): { merged: FederatedResultItem[]; duplicatesRemoved: number } {
    // Collect all items
    let allItems = sourceResults.flatMap((r) => r.items);

    // Deduplicate
    const beforeCount = allItems.length;
    allItems = this.deduplicateResults(allItems, deduplicationStrategy);
    const duplicatesRemoved = beforeCount - allItems.length;

    // Apply merge strategy
    let merged: FederatedResultItem[];
    switch (strategy) {
      case 'interleave':
        merged = this.interleaveResults(sourceResults);
        break;
      case 'append':
        merged = allItems;
        break;
      case 'weighted':
        merged = this.weightedMerge(allItems, sourceResults);
        break;
      case 'reciprocal_rank':
        merged = this.reciprocalRankFusion(sourceResults);
        break;
      default:
        merged = allItems;
    }

    // Limit to topK
    return {
      merged: merged.slice(0, topK),
      duplicatesRemoved,
    };
  }

  /**
   * Interleave results from sources (round-robin)
   */
  private interleaveResults(sourceResults: SourceQueryResultWithItems[]): FederatedResultItem[] {
    const result: FederatedResultItem[] = [];
    const sources = sourceResults.filter((r) => r.items.length > 0);
    const indices = sources.map(() => 0);

    let hasMore = true;
    while (hasMore) {
      hasMore = false;
      for (let i = 0; i < sources.length; i++) {
        if (indices[i] < sources[i].items.length) {
          result.push(sources[i].items[indices[i]]);
          indices[i]++;
          hasMore = true;
        }
      }
    }

    return result;
  }

  /**
   * Weight-based merge (sort by weighted score)
   */
  private weightedMerge(
    items: FederatedResultItem[],
    sourceResults: SourceQueryResultWithItems[]
  ): FederatedResultItem[] {
    const sourceWeights = new Map<string, number>();
    for (const source of this.sourceCache.values()) {
      sourceWeights.set(source.id, source.weight || 1);
    }

    return items
      .map((item) => ({
        ...item,
        score: item.score * (sourceWeights.get(item.sourceId) || 1),
      }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Reciprocal Rank Fusion for merging ranked lists
   * RRF(d) = sum(1 / (k + rank(d)))  where k is typically 60
   */
  private reciprocalRankFusion(
    sourceResults: SourceQueryResultWithItems[],
    k: number = 60
  ): FederatedResultItem[] {
    const scores = new Map<string, { item: FederatedResultItem; score: number }>();

    for (const result of sourceResults) {
      for (let i = 0; i < result.items.length; i++) {
        const item = result.items[i];
        const rank = i + 1;
        const rrfScore = 1 / (k + rank);

        const existing = scores.get(item.documentId);
        if (existing) {
          existing.score += rrfScore;
        } else {
          scores.set(item.documentId, { item, score: rrfScore });
        }
      }
    }

    return Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .map(({ item, score }) => ({ ...item, score }));
  }

  /**
   * Deduplicate results based on strategy
   */
  private deduplicateResults(
    items: FederatedResultItem[],
    strategy: DeduplicationStrategy
  ): FederatedResultItem[] {
    if (strategy === 'none') return items;

    const seen = new Set<string>();
    const result: FederatedResultItem[] = [];

    for (const item of items) {
      let key: string;

      switch (strategy) {
        case 'id':
          key = item.documentId;
          break;
        case 'content_hash':
          key = this.simpleHash(item.content);
          break;
        case 'exact_match':
          key = item.content.toLowerCase().trim();
          break;
        case 'similarity':
          // For similarity, use first 500 chars as proxy
          key = this.simpleHash(item.content.slice(0, 500).toLowerCase());
          break;
        default:
          key = item.id;
      }

      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }

    return result;
  }

  /**
   * Simple string hash for deduplication
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  // ============================================
  // Health Checks
  // ============================================

  /**
   * Perform health checks on all sources
   */
  async healthCheck(): Promise<SourceHealthCheckResult[]> {
    const results: SourceHealthCheckResult[] = [];

    for (const [sourceId, connector] of this.connectors) {
      const source = this.sourceCache.get(sourceId);
      const startTime = performance.now();

      try {
        const isHealthy = await connector.healthCheck();
        const latencyMs = Math.round(performance.now() - startTime);

        const result: SourceHealthCheckResult = {
          sourceId,
          status: isHealthy ? 'healthy' : 'unhealthy',
          latencyMs,
          checkedAt: new Date().toISOString(),
        };

        this.healthCache.set(sourceId, result);
        results.push(result);
      } catch (error) {
        const result: SourceHealthCheckResult = {
          sourceId,
          status: 'unhealthy',
          latencyMs: Math.round(performance.now() - startTime),
          message: error instanceof Error ? error.message : 'Health check failed',
          checkedAt: new Date().toISOString(),
        };

        this.healthCache.set(sourceId, result);
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Get cached health status for a source
   */
  getSourceHealth(sourceId: string): SourceHealthCheckResult | undefined {
    return this.healthCache.get(sourceId);
  }

  // ============================================
  // Cleanup
  // ============================================

  /**
   * Disconnect all sources and cleanup
   */
  async shutdown(): Promise<void> {
    for (const connector of this.connectors.values()) {
      try {
        await connector.disconnect();
      } catch (error) {
        console.error('Error disconnecting connector:', error);
      }
    }

    this.connectors.clear();
    this.sourceCache.clear();
    this.healthCache.clear();
  }

  // ============================================
  // Helpers
  // ============================================

  /**
   * Map database row to FederatedSource
   */
  private mapToFederatedSource(data: Record<string, unknown>): FederatedSource {
    return {
      id: data.id as string,
      name: data.name as string,
      description: data.description as string | undefined,
      provider: data.provider as FederatedSource['provider'],
      enabled: data.is_active as boolean,
      priority: (data.priority as number) || 0,
      weight: (data.weight as number) || 1,
      capabilities: (data.capabilities as FederatedSource['capabilities']) || {
        vector: true,
        keyword: false,
        hybrid: false,
        filter: true,
        aggregations: false,
        realtime: false,
        transactions: false,
      },
      connectionStatus: 'disconnected',
      healthStatus: 'unknown',
      config: data.config as FederatedSource['config'],
      metadata: data.metadata as Record<string, unknown> | undefined,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
    };
  }
}

// ============================================
// Internal Types
// ============================================

interface SourceQueryResultWithItems extends SourceQueryResult {
  items: FederatedResultItem[];
}

// ============================================
// Factory
// ============================================

const engineCache = new Map<string, FederationEngine>();

/**
 * Get or create a federation engine for a user
 */
export async function getFederationEngine(userId: string): Promise<FederationEngine> {
  let engine = engineCache.get(userId);

  if (!engine) {
    engine = new FederationEngine(userId);
    await engine.initialize();
    engineCache.set(userId, engine);
  }

  return engine;
}

/**
 * Create a new federation engine (without caching)
 */
export function createFederationEngine(userId: string): FederationEngine {
  return new FederationEngine(userId);
}
