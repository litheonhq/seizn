/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import type { HealingStats, HealingStrategy } from '@/lib/fall/healing';

/**
 * GET /api/fall/healing/history
 *
 * Get healing execution history
 *
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - contract_id: Filter by contract ID
 * - status: Filter by status (success, failed, in_progress)
 * - stats: If "true", return aggregated statistics
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const supabase = createServerClient();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const offset = (page - 1) * limit;
    const contractId = searchParams.get('contract_id');
    const status = searchParams.get('status');
    const includeStats = searchParams.get('stats') === 'true';

    // Build query
    let query = supabase
      .from('fall_healing_history')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (contractId) {
      query = query.eq('contract_id', contractId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    // Execute paginated query
    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) throw error;

    const response: any = {
      success: true,
      history: data ?? [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    };

    // Optionally include aggregated statistics
    if (includeStats) {
      const stats = await getHealingStats(supabase, userId, contractId);
      response.stats = stats;
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error('Fall healing history GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/fall/healing/history
 *
 * Clear healing history
 *
 * Query params:
 * - contract_id: Optional, clear only for specific contract
 * - before: Optional, clear entries before this date (ISO string)
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const supabase = createServerClient();

    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get('contract_id');
    const before = searchParams.get('before');

    let query = supabase
      .from('fall_healing_history')
      .delete()
      .eq('user_id', userId);

    if (contractId) {
      query = query.eq('contract_id', contractId);
    }

    if (before) {
      query = query.lt('created_at', before);
    }

    const { error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: `Deleted ${count ?? 0} history entries`,
      deleted: count ?? 0,
    });
  } catch (err) {
    console.error('Fall healing history DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Get aggregated healing statistics
 */
async function getHealingStats(
  supabase: any,
  userId: string,
  contractId: string | null
): Promise<HealingStats> {
  // Fetch all history for aggregation
  let query = supabase
    .from('fall_healing_history')
    .select('status, duration_ms, successful_actions, failed_actions, results')
    .eq('user_id', userId);

  if (contractId) {
    query = query.eq('contract_id', contractId);
  }

  const { data: entries } = await query;

  if (!entries || entries.length === 0) {
    return {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageDurationMs: 0,
      strategyBreakdown: {} as Record<HealingStrategy, { attempts: number; successes: number; failures: number }>,
      commonFailures: [],
    };
  }

  let totalExecutions = 0;
  let successfulExecutions = 0;
  let failedExecutions = 0;
  let totalDuration = 0;

  const strategyBreakdown: Record<string, { attempts: number; successes: number; failures: number }> = {};
  const failuresByType: Record<string, number> = {};

  for (const entry of entries) {
    totalExecutions++;
    totalDuration += entry.duration_ms || 0;

    if (entry.status === 'success') {
      successfulExecutions++;
    } else if (entry.status === 'failed') {
      failedExecutions++;
    }

    // Process results for strategy breakdown
    if (Array.isArray(entry.results)) {
      for (const result of entry.results) {
        const strategy = result.strategy as string;
        if (!strategyBreakdown[strategy]) {
          strategyBreakdown[strategy] = { attempts: 0, successes: 0, failures: 0 };
        }
        strategyBreakdown[strategy].attempts++;
        if (result.status === 'success') {
          strategyBreakdown[strategy].successes++;
        } else if (result.status === 'failed') {
          strategyBreakdown[strategy].failures++;

          // Track common failures
          const failureKey = `${result.assertionType || 'unknown'}:${result.field || 'unknown'}`;
          failuresByType[failureKey] = (failuresByType[failureKey] || 0) + 1;
        }
      }
    }
  }

  // Sort and get top common failures
  const commonFailures = Object.entries(failuresByType)
    .map(([key, count]) => {
      const [assertionType, field] = key.split(':');
      return { assertionType, field: field !== 'unknown' ? field : undefined, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalExecutions,
    successfulExecutions,
    failedExecutions,
    averageDurationMs: totalExecutions > 0 ? Math.round(totalDuration / totalExecutions) : 0,
    strategyBreakdown: strategyBreakdown as Record<HealingStrategy, { attempts: number; successes: number; failures: number }>,
    commonFailures,
  };
}
