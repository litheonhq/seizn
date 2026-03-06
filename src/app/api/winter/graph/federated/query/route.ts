import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, ServerErrors, ValidationErrors } from '@/lib/api-error';
import {
  getFederationEngine,
  type FederatedQuery,
  type FederatedQueryResponse,
} from '@/lib/winter/federated';
import { logServerError } from '@/lib/server/logger';

/**
 * POST /api/winter/graph/federated/query
 *
 * Execute a federated query across multiple data sources.
 *
 * Request body:
 * {
 *   query: string;                    // Required: query text
 *   embedding?: number[];             // Optional: pre-computed query embedding
 *   topK?: number;                    // Optional: number of results (default: 10)
 *   threshold?: number;               // Optional: minimum score threshold
 *   sources?: string[];               // Optional: specific source IDs to query
 *   executionMode?: 'parallel' | 'sequential' | 'adaptive';
 *   mergeStrategy?: 'interleave' | 'append' | 'weighted' | 'reciprocal_rank';
 *   deduplicationStrategy?: 'none' | 'id' | 'content_hash' | 'similarity';
 *   filter?: {
 *     metadata?: Record<string, unknown>;
 *     dateRange?: { field: string; start?: string; end?: string };
 *     documentIds?: string[];
 *     excludeDocumentIds?: string[];
 *   };
 *   sourceTimeoutMs?: number;         // Optional: timeout per source (default: 5000)
 *   totalTimeoutMs?: number;          // Optional: total query timeout (default: 30000)
 *   includeSourceMetadata?: boolean;  // Optional: include source metadata (default: false)
 *   debug?: boolean;                  // Optional: include debug info (default: false)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Validate API key
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    // Parse request body
    let body: Partial<FederatedQuery>;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON body');
    }

    // Validate required fields
    if (!body.query) {
      return ValidationErrors.missingField('query');
    }

    // Build federated query
    const query: FederatedQuery = {
      query: body.query,
      embedding: body.embedding,
      topK: body.topK || 10,
      threshold: body.threshold,
      sources: body.sources,
      executionMode: body.executionMode || 'parallel',
      mergeStrategy: body.mergeStrategy || 'interleave',
      deduplicationStrategy: body.deduplicationStrategy || 'none',
      filter: body.filter,
      sourceTimeoutMs: body.sourceTimeoutMs || 5000,
      totalTimeoutMs: body.totalTimeoutMs || 30000,
      includeSourceMetadata: body.includeSourceMetadata || false,
      debug: body.debug || false,
    };

    // Validate topK
    if (query.topK < 1 || query.topK > 100) {
      return ValidationErrors.invalidField('topK', 'Must be between 1 and 100');
    }

    // Validate merge strategy
    const validMergeStrategies = ['interleave', 'append', 'weighted', 'reciprocal_rank', 'custom'];
    if (!validMergeStrategies.includes(query.mergeStrategy || 'interleave')) {
      return ValidationErrors.invalidField(
        'mergeStrategy',
        `Must be one of: ${validMergeStrategies.join(', ')}`
      );
    }

    // Validate deduplication strategy
    const validDeduplicationStrategies = ['none', 'id', 'content_hash', 'similarity', 'exact_match'];
    if (!validDeduplicationStrategies.includes(query.deduplicationStrategy || 'none')) {
      return ValidationErrors.invalidField(
        'deduplicationStrategy',
        `Must be one of: ${validDeduplicationStrategies.join(', ')}`
      );
    }

    // Get federation engine for user
    const userId = authResult.userId;
    const engine = await getFederationEngine(userId);

    // Check if there are any sources
    const sources = engine.getSources();
    if (sources.length === 0) {
      return NextResponse.json({
        success: true,
        results: [],
        totalCount: 0,
        sources: [],
        totalLatencyMs: 0,
        mergeStrategy: query.mergeStrategy,
        duplicatesRemoved: 0,
        message: 'No federated sources configured. Add sources via /api/admin/federated/sources',
      });
    }

    // Execute federated query
    const startTime = performance.now();

    // Implement total timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('Query timeout exceeded')),
        query.totalTimeoutMs || 30000
      )
    );

    const queryPromise = engine.query(query);

    let result: FederatedQueryResponse;
    try {
      result = await Promise.race([queryPromise, timeoutPromise]);
    } catch (error) {
      if (error instanceof Error && error.message === 'Query timeout exceeded') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'QUERY_TIMEOUT',
              message: 'Federated query exceeded the maximum allowed time',
              totalTimeoutMs: query.totalTimeoutMs,
            },
          },
          { status: 504 }
        );
      }
      throw error;
    }

    const totalLatencyMs = Math.round(performance.now() - startTime);

    // Return response
    return NextResponse.json({
      success: true,
      results: result.results,
      totalCount: result.totalCount,
      sources: result.sources,
      totalLatencyMs,
      mergeStrategy: result.mergeStrategy,
      duplicatesRemoved: result.duplicatesRemoved,
      ...(query.debug && result.debug ? { debug: result.debug } : {}),
    });
  } catch (error) {
    logServerError('Federated query error:', error);
    return ServerErrors.internal('federated_query');
  }
}

/**
 * GET /api/winter/graph/federated/query
 *
 * Get information about available federated sources.
 */
export async function GET(request: NextRequest) {
  try {
    // Validate API key
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const userId = authResult.userId;
    const engine = await getFederationEngine(userId);

    // Get sources
    const sources = engine.getSources();

    // Get health status
    const healthChecks = await engine.healthCheck();

    // Build response
    const sourcesWithHealth = sources.map((source) => {
      const health = healthChecks.find((h) => h.sourceId === source.id);
      return {
        id: source.id,
        name: source.name,
        description: source.description,
        provider: source.provider,
        enabled: source.enabled,
        priority: source.priority,
        weight: source.weight,
        capabilities: source.capabilities,
        health: health
          ? {
              status: health.status,
              latencyMs: health.latencyMs,
              checkedAt: health.checkedAt,
            }
          : null,
      };
    });

    return NextResponse.json({
      success: true,
      sources: sourcesWithHealth,
      totalSources: sources.length,
      enabledSources: sources.filter((s) => s.enabled).length,
    });
  } catch (error) {
    logServerError('Get federated sources error:', error);
    return ServerErrors.internal('get_federated_sources');
  }
}
