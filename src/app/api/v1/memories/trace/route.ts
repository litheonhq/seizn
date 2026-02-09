/**
 * Memory Trace API — Timeline visualization data for memory operations
 *
 * GET /api/v1/memories/trace
 *   Returns memory lifecycle events: creation, retrieval, decay, consolidation
 *   For the Memory Trace Dashboard.
 *
 * Query params:
 *   - period: "24h" | "7d" | "30d" (default: "7d")
 *   - type: "all" | "created" | "retrieved" | "decayed" | "merged" | "archived"
 *   - limit: number (default: 100, max: 500)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import { getDecayAnalytics } from '@/lib/memory/smart-decay';

const META = { version: 'v1' as const };

async function resolveAuth(
  request: NextRequest
): Promise<{ userId: string; keyId: string | null } | { error: NextResponse }> {
  const authResult = await authenticateRequest(request, { skipUsageCheck: false });
  if (!isAuthError(authResult)) {
    return { userId: authResult.userId, keyId: authResult.keyId };
  }
  const session = await auth();
  if (session?.user?.id) {
    return { userId: session.user.id, keyId: null };
  }
  return { error: authErrorResponse(authResult.authError) };
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  const authResult = await resolveAuth(request);
  if ('error' in authResult) return authResult.error;
  const { userId, keyId } = authResult;

  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || '7d';
  const eventType = searchParams.get('type') || 'all';
  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);

  // Calculate period start
  const periodMs: Record<string, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  const cutoff = new Date(Date.now() - (periodMs[period] || periodMs['7d']));
  const supabase = createServerClient();

  try {
    // Parallel queries for trace data
    const [memoriesResult, decayAnalytics] = await Promise.all([
      // Recent memory events
      supabase
        .from('memories')
        .select('id, content, memory_type, importance, access_count, source, is_deleted, merged_into, created_at, updated_at, last_accessed_at')
        .eq('user_id', userId)
        .gte('updated_at', cutoff.toISOString())
        .order('updated_at', { ascending: false })
        .limit(limit),

      // Decay health analytics
      getDecayAnalytics(userId),
    ]);

    const memories = memoriesResult.data || [];

    // Classify events
    const events = memories.map((m) => {
      let event = 'updated';
      if (new Date(m.created_at) >= cutoff && !m.is_deleted) event = 'created';
      if (m.is_deleted) event = 'deleted';
      if (m.merged_into) event = 'merged';

      return {
        id: m.id,
        event,
        content: m.content?.slice(0, 120) + (m.content && m.content.length > 120 ? '...' : ''),
        memoryType: m.memory_type,
        importance: m.importance,
        accessCount: m.access_count || 0,
        source: m.source,
        mergedInto: m.merged_into,
        timestamp: m.updated_at || m.created_at,
      };
    });

    // Filter by event type
    const filteredEvents =
      eventType === 'all'
        ? events
        : events.filter((e) => e.event === eventType);

    // Aggregate stats
    const stats = {
      created: events.filter((e) => e.event === 'created').length,
      retrieved: memories.reduce((sum, m) => sum + (m.access_count || 0), 0),
      merged: events.filter((e) => e.event === 'merged').length,
      deleted: events.filter((e) => e.event === 'deleted').length,
    };

    // Timeline buckets (hourly for 24h, daily for 7d/30d)
    const bucketSize = period === '24h' ? 3600000 : 86400000;
    const buckets: Record<string, { created: number; retrieved: number }> = {};

    for (const event of events) {
      const ts = new Date(event.timestamp).getTime();
      const bucketKey = new Date(Math.floor(ts / bucketSize) * bucketSize).toISOString();
      if (!buckets[bucketKey]) {
        buckets[bucketKey] = { created: 0, retrieved: 0 };
      }
      if (event.event === 'created') buckets[bucketKey].created++;
    }

    const timeline = Object.entries(buckets)
      .map(([time, counts]) => ({ time, ...counts }))
      .sort((a, b) => a.time.localeCompare(b.time));

    if (keyId) {
      logRequest(
        { userId, keyId, endpoint: '/v1/memories/trace', method: 'GET', startTime },
        200
      ).catch(console.error);
    }

    return NextResponse.json({
      success: true,
      data: {
        events: filteredEvents,
        stats,
        timeline,
        health: decayAnalytics,
      },
      meta: {
        ...META,
        period,
        eventType,
        totalEvents: filteredEvents.length,
        latencyMs: Date.now() - startTime,
      },
    });
  } catch (error) {
    console.error('[v1/memories/trace] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
