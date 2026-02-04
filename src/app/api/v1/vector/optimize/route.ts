/**
 * POST /api/v1/vector/optimize - Get HNSW optimization recommendations
 *
 * Analyzes current workload and provides recommendations for:
 * - HNSW parameters (m, ef_construction, ef_search)
 * - Memory usage optimization
 * - Index health status
 *
 * @security Requires admin or vector:optimize scope
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-key';
import {
  HnswOptimizer,
  optimizeConfig,
  analyzeWorkload,
  checkIndexHealth,
  estimateIndexMemory,
  estimateBuildTime,
  getAdaptiveEfSearch,
} from '@/lib/vector/hnsw-optimizer';
import { createServerClient } from '@/lib/supabase';

interface OptimizeRequest {
  collection_id?: string;
  table_name?: string;
  index_name?: string;
  current_config?: {
    m?: number;
    ef_construction?: number;
    ef_search?: number;
  };
  memory_budget_mb?: number;
  analyze_workload?: boolean;
  check_health?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json(
        { error: 'Unauthorized', message: auth.error },
        { status: 401 }
      );
    }

    // Check permissions
    const hasPermission =
      auth.scopes?.includes('admin') ||
      auth.scopes?.includes('vector:optimize') ||
      auth.scopes?.includes('*');

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Requires admin or vector:optimize scope' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as OptimizeRequest;
    const supabase = createServerClient();

    // Get vector count from database
    let vectorCount = 0;
    const dimension = 1024; // Default Voyage AI dimension

    if (body.collection_id) {
      const { count } = await supabase
        .from('summer_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('collection_id', body.collection_id);
      vectorCount = count || 0;
    } else {
      const { count } = await supabase
        .from('memories')
        .select('*', { count: 'exact', head: true })
        .eq('is_deleted', false);
      vectorCount = count || 0;
    }

    // Analyze workload if requested
    let workload = undefined;
    if (body.analyze_workload !== false) {
      workload = await analyzeWorkload(body.collection_id, 7) || undefined;
    }

    // Generate optimization recommendation
    const recommendation = optimizeConfig({
      vectorCount,
      dimension,
      workload,
      currentConfig: body.current_config,
      memoryBudgetMB: body.memory_budget_mb,
    });

    // Check index health if requested
    let health = undefined;
    if (body.check_health) {
      health = await checkIndexHealth(
        body.table_name || 'memories',
        body.index_name || 'idx_memories_embedding_hnsw'
      );
    }

    // Memory estimation
    const memoryEstimate = estimateIndexMemory({
      vectorCount,
      dimension,
      m: recommendation.recommendedConfig.m,
    });

    // Build time estimation
    const buildTimeEstimate = estimateBuildTime({
      vectorCount,
      dimension,
      m: recommendation.recommendedConfig.m,
      efConstruction: recommendation.recommendedConfig.efConstruction,
    });

    return NextResponse.json({
      vector_count: vectorCount,
      dimension,
      workload_profile: workload,
      recommendation,
      memory_estimate: memoryEstimate,
      build_time_estimate: buildTimeEstimate,
      index_health: health,
    });
  } catch (error) {
    console.error('[VectorOptimize] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/vector/optimize - Get adaptive ef_search for a query
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json(
        { error: 'Unauthorized', message: auth.error },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const topK = parseInt(searchParams.get('top_k') || '10');
    const complexity = (searchParams.get('complexity') || 'moderate') as 'simple' | 'moderate' | 'complex';
    const recall = (searchParams.get('recall') || 'standard') as 'standard' | 'high' | 'critical';
    const maxLatency = searchParams.get('max_latency_ms')
      ? parseInt(searchParams.get('max_latency_ms')!)
      : undefined;

    const efSearch = getAdaptiveEfSearch({
      topK,
      queryComplexity: complexity,
      recallRequirement: recall,
      maxLatencyMs: maxLatency,
    });

    return NextResponse.json({
      recommended_ef_search: efSearch,
      parameters: {
        top_k: topK,
        complexity,
        recall_requirement: recall,
        max_latency_ms: maxLatency,
      },
      limits: HnswOptimizer.limits.efSearch,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
