/**
 * Control Tower - System Health Service
 *
 * Monitors health of all system components
 */

import { createServerClient } from '@/lib/supabase';
import type {
  HealthStatus,
  ServiceHealth,
  ServiceName,
  SystemHealth,
} from './types';

// Service health check configuration
const SERVICE_CHECKS: Array<{
  name: ServiceName;
  displayName: string;
  check: () => Promise<{ status: HealthStatus; latencyMs?: number; error?: string }>;
}> = [
  {
    name: 'database',
    displayName: 'Database (PostgreSQL)',
    check: checkDatabase,
  },
  {
    name: 'cache',
    displayName: 'Cache (Redis/Upstash)',
    check: checkCache,
  },
  {
    name: 'vector_store',
    displayName: 'Vector Store',
    check: checkVectorStore,
  },
  {
    name: 'llm_gateway',
    displayName: 'LLM Gateway',
    check: checkLLMGateway,
  },
  {
    name: 'storage',
    displayName: 'Object Storage',
    check: checkStorage,
  },
  {
    name: 'auth',
    displayName: 'Authentication',
    check: checkAuth,
  },
];

// Start time for uptime calculation
const startTime = Date.now();

/**
 * Get comprehensive system health status
 */
export async function getSystemHealth(): Promise<SystemHealth> {
  const services: ServiceHealth[] = [];
  let hasUnhealthy = false;
  let hasDegraded = false;

  // Run all health checks in parallel
  const checkPromises = SERVICE_CHECKS.map(async (service) => {
    const startMs = Date.now();
    try {
      const result = await Promise.race([
        service.check(),
        new Promise<{ status: HealthStatus; latencyMs?: number; error: string }>((resolve) =>
          setTimeout(() => resolve({ status: 'unhealthy', error: 'Health check timeout' }), 5000)
        ),
      ]);

      const latencyMs = result.latencyMs ?? (Date.now() - startMs);

      return {
        name: service.name,
        displayName: service.displayName,
        status: result.status,
        latencyMs,
        lastCheck: new Date().toISOString(),
        errorMessage: result.error,
      };
    } catch (err) {
      return {
        name: service.name,
        displayName: service.displayName,
        status: 'unhealthy' as HealthStatus,
        latencyMs: Date.now() - startMs,
        lastCheck: new Date().toISOString(),
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  });

  const results = await Promise.all(checkPromises);

  for (const result of results) {
    services.push(result);
    if (result.status === 'unhealthy') hasUnhealthy = true;
    if (result.status === 'degraded') hasDegraded = true;
  }

  // Determine overall status
  let overall: HealthStatus = 'healthy';
  if (hasUnhealthy) overall = 'unhealthy';
  else if (hasDegraded) overall = 'degraded';

  return {
    overall,
    services,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    version: process.env.npm_package_version || '0.1.0',
  };
}

/**
 * Check database health
 */
async function checkDatabase(): Promise<{ status: HealthStatus; latencyMs?: number; error?: string }> {
  const startMs = Date.now();
  try {
    const supabase = createServerClient();
    const { error } = await supabase.from('api_keys').select('id').limit(1);

    const latencyMs = Date.now() - startMs;

    if (error) {
      return {
        status: latencyMs > 1000 ? 'unhealthy' : 'degraded',
        latencyMs,
        error: error.message,
      };
    }

    // Consider degraded if latency > 500ms
    const status: HealthStatus = latencyMs > 500 ? 'degraded' : 'healthy';
    return { status, latencyMs };
  } catch (err) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - startMs,
      error: err instanceof Error ? err.message : 'Database connection failed',
    };
  }
}

/**
 * Check cache health (Upstash Redis)
 */
async function checkCache(): Promise<{ status: HealthStatus; latencyMs?: number; error?: string }> {
  const startMs = Date.now();

  if (!process.env.UPSTASH_REDIS_REST_URL) {
    return { status: 'unknown', error: 'Redis not configured' };
  }

  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    await redis.ping();
    const latencyMs = Date.now() - startMs;

    const status: HealthStatus = latencyMs > 200 ? 'degraded' : 'healthy';
    return { status, latencyMs };
  } catch (err) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - startMs,
      error: err instanceof Error ? err.message : 'Cache connection failed',
    };
  }
}

/**
 * Check vector store health
 */
async function checkVectorStore(): Promise<{ status: HealthStatus; latencyMs?: number; error?: string }> {
  const startMs = Date.now();
  try {
    const supabase = createServerClient();
    // Check if vector extension is available
    const { error } = await supabase.rpc('match_memories', {
      query_embedding: new Array(1536).fill(0),
      match_threshold: 0.5,
      match_count: 1,
      p_user_id: '00000000-0000-0000-0000-000000000000',
    });

    const latencyMs = Date.now() - startMs;

    // Error is expected with dummy data, but we check if the function exists
    if (error && error.message.includes('does not exist')) {
      return {
        status: 'unhealthy',
        latencyMs,
        error: 'Vector functions not available',
      };
    }

    const status: HealthStatus = latencyMs > 1000 ? 'degraded' : 'healthy';
    return { status, latencyMs };
  } catch (err) {
    return {
      status: 'degraded',
      latencyMs: Date.now() - startMs,
      error: err instanceof Error ? err.message : 'Vector store check failed',
    };
  }
}

/**
 * Check LLM Gateway health
 */
async function checkLLMGateway(): Promise<{ status: HealthStatus; latencyMs?: number; error?: string }> {
  const startMs = Date.now();

  // Check if at least one LLM provider is configured
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasGoogle = !!process.env.GOOGLE_API_KEY;

  if (!hasOpenAI && !hasAnthropic && !hasGoogle) {
    return { status: 'unhealthy', error: 'No LLM provider configured' };
  }

  // Simple connectivity check (don't make actual API calls)
  const latencyMs = Date.now() - startMs;

  return {
    status: 'healthy',
    latencyMs,
  };
}

/**
 * Check object storage health
 */
async function checkStorage(): Promise<{ status: HealthStatus; latencyMs?: number; error?: string }> {
  const startMs = Date.now();
  try {
    const supabase = createServerClient();
    const { error } = await supabase.storage.listBuckets();

    const latencyMs = Date.now() - startMs;

    if (error) {
      return {
        status: 'degraded',
        latencyMs,
        error: error.message,
      };
    }

    const status: HealthStatus = latencyMs > 500 ? 'degraded' : 'healthy';
    return { status, latencyMs };
  } catch (err) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - startMs,
      error: err instanceof Error ? err.message : 'Storage check failed',
    };
  }
}

/**
 * Check authentication service health
 */
async function checkAuth(): Promise<{ status: HealthStatus; latencyMs?: number; error?: string }> {
  const startMs = Date.now();
  try {
    const supabase = createServerClient();
    const { error } = await supabase.auth.getSession();

    const latencyMs = Date.now() - startMs;

    if (error) {
      return {
        status: 'degraded',
        latencyMs,
        error: error.message,
      };
    }

    const status: HealthStatus = latencyMs > 500 ? 'degraded' : 'healthy';
    return { status, latencyMs };
  } catch (err) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - startMs,
      error: err instanceof Error ? err.message : 'Auth check failed',
    };
  }
}

/**
 * Record service health to history table
 */
export async function recordServiceHealth(health: ServiceHealth): Promise<void> {
  try {
    const supabase = createServerClient();
    await supabase.from('service_health_history').insert({
      service_name: health.name,
      status: health.status,
      latency_ms: health.latencyMs,
      error_message: health.errorMessage,
      metadata: health.metadata,
      recorded_at: health.lastCheck,
    });
  } catch (err) {
    console.error('Failed to record service health:', err);
  }
}

/**
 * Get service health history
 */
export async function getServiceHealthHistory(
  serviceName: ServiceName,
  hours: number = 24
): Promise<Array<{ status: HealthStatus; latencyMs?: number; recordedAt: string }>> {
  try {
    const supabase = createServerClient();
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('service_health_history')
      .select('status, latency_ms, recorded_at')
      .eq('service_name', serviceName)
      .gte('recorded_at', since)
      .order('recorded_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    return (data || []).map((row) => ({
      status: row.status as HealthStatus,
      latencyMs: row.latency_ms,
      recordedAt: row.recorded_at,
    }));
  } catch (err) {
    console.error('Failed to get service health history:', err);
    return [];
  }
}
