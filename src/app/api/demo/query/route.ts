import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createQueryEmbedding } from '@/lib/ai';
import { ValidationErrors, ServerErrors, createApiError, ErrorCodes } from '@/lib/api-error';
import { getRedis } from '@/lib/redis';

// Demo namespace with pre-seeded sample memories
const DEMO_USER_ID = 'demo-user-00000000-0000-0000-0000-000000000000';
const DEMO_NAMESPACE = 'demo:public';
const RATE_LIMIT_KEY_PREFIX = 'demo_query:';
const RATE_LIMIT_WINDOW = 24 * 60 * 60; // 24 hours
const MAX_DEMO_QUERIES = 3; // 3 free queries per IP per day

/**
 * Get Redis client with runtime validation
 * Throws error if Redis is not configured (required for demo rate limiting)
 */
function getRequiredRedis() {
  const redis = getRedis();
  if (!redis) {
    throw new Error('Redis is required for demo rate limiting but UPSTASH_REDIS_REST_URL/TOKEN are not configured');
  }
  return redis;
}

interface DemoQueryRequest {
  query: string;
  mode?: 'vector' | 'hybrid' | 'keyword';
}

/**
 * GET /api/demo/query - Check remaining demo queries
 */
export async function GET(request: NextRequest) {
  try {
    const redis = getRequiredRedis();
    const ip = getClientIP(request);
    const rateLimitKey = `${RATE_LIMIT_KEY_PREFIX}${ip}`;

    const used = await redis.get<number>(rateLimitKey) ?? 0;
    const remaining = Math.max(0, MAX_DEMO_QUERIES - used);

    return NextResponse.json({
      success: true,
      demo: {
        max_queries: MAX_DEMO_QUERIES,
        used,
        remaining,
        reset_window: '24 hours',
      },
    });
  } catch (error) {
    console.error('Demo query GET error:', error);
    return ServerErrors.internal('demo_query_check');
  }
}

/**
 * POST /api/demo/query - Execute a demo query (no API key required)
 *
 * Rate limited to 3 queries per IP per 24 hours
 * Uses pre-seeded demo memories to showcase search functionality
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const redis = getRequiredRedis();

    // Get client IP for rate limiting
    const ip = getClientIP(request);
    const rateLimitKey = `${RATE_LIMIT_KEY_PREFIX}${ip}`;

    // Check rate limit
    const used = await redis.get<number>(rateLimitKey) ?? 0;
    if (used >= MAX_DEMO_QUERIES) {
      return createApiError({
        code: ErrorCodes.RATE_LIMIT_EXCEEDED,
        message: `Demo limit reached (${MAX_DEMO_QUERIES}/day). Sign up for unlimited access.`,
        status: 429,
        details: {
          max_queries: MAX_DEMO_QUERIES,
          used,
          reset_window: '24 hours',
          upgrade_url: '/signup',
        },
      });
    }

    // Limit request body size (16 KB max for demo)
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 16384) {
      return ValidationErrors.invalidField('body', 'Request body too large (max 16 KB)');
    }

    // Parse request
    const body: DemoQueryRequest = await request.json();

    if (!body.query || body.query.trim().length === 0) {
      return ValidationErrors.missingField('query');
    }

    if (body.query.length > 500) {
      return ValidationErrors.invalidField('query', 'Demo queries limited to 500 characters');
    }

    const mode = body.mode || 'vector';
    const query = body.query.trim();

    const supabase = createServerClient();

    // Execute search
    let results: DemoResult[] = [];
    let searchError: Error | null = null;

    if (mode === 'keyword') {
      const { data, error } = await supabase.rpc('keyword_search_memories', {
        query_text: query,
        match_user_id: DEMO_USER_ID,
        match_count: 5,
        match_namespace: DEMO_NAMESPACE,
      });
      results = data || [];
      searchError = error;
    } else if (mode === 'hybrid') {
      const queryEmbedding = await createQueryEmbedding(query);
      const { data, error } = await supabase.rpc('hybrid_search_memories', {
        query_text: query,
        query_embedding: queryEmbedding,
        match_user_id: DEMO_USER_ID,
        match_count: 5,
        match_threshold: 0.6,
        match_namespace: DEMO_NAMESPACE,
        keyword_weight: 0.3,
        vector_weight: 0.7,
      });
      results = data || [];
      searchError = error;
    } else {
      // Default: vector search
      const queryEmbedding = await createQueryEmbedding(query);
      const { data, error } = await supabase.rpc('search_memories', {
        query_embedding: queryEmbedding,
        match_user_id: DEMO_USER_ID,
        match_count: 5,
        match_threshold: 0.6,
        match_namespace: DEMO_NAMESPACE,
      });
      results = data || [];
      searchError = error;
    }

    if (searchError) {
      console.error('Demo search error:', searchError);
      return ServerErrors.database('demo_search');
    }

    // Increment rate limit counter
    await redis.setex(rateLimitKey, RATE_LIMIT_WINDOW, used + 1);

    const latencyMs = Date.now() - startTime;

    // Return results with full trace (the "debug" value proposition)
    return NextResponse.json({
      success: true,
      demo: true,
      mode,
      results: results.map(r => ({
        id: r.id,
        content: r.content,
        memory_type: r.memory_type,
        similarity: r.similarity,
        created_at: r.created_at,
      })),
      count: results.length,
      trace: {
        latency_ms: latencyMs,
        mode,
        query_length: query.length,
        embedding_model: mode !== 'keyword' ? 'text-embedding-3-small' : null,
        estimated_cost: mode !== 'keyword' ? '$0.00002' : '$0.00000',
        threshold: 0.6,
        limit: 5,
      },
      rate_limit: {
        used: used + 1,
        remaining: MAX_DEMO_QUERIES - used - 1,
        reset_window: '24 hours',
      },
      cta: {
        message: 'Want unlimited queries with full tracing?',
        signup_url: '/signup',
        docs_url: '/docs',
      },
    });
  } catch (error) {
    console.error('Demo query error:', error);
    return ServerErrors.internal('demo_query');
  }
}

interface DemoResult {
  id: string;
  content: string;
  memory_type: string;
  similarity: number;
  created_at: string;
}

function getClientIP(request: NextRequest): string {
  // Try various headers for client IP
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    return xff.split(',')[0].trim();
  }

  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  // Fallback for local development
  return '127.0.0.1';
}
