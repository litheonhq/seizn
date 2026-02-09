// Internal API for background memory optimization
// Called by Vercel Cron or internal processes
// NOT exposed to external users

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  findSimilarMemories,
  mergeMemories,
  executeMerge,
  applyMemoryDecay,
  updateImportanceScores,
} from '@/lib/memory-optimizer';
import { createEmbedding } from '@/lib/ai';

// Verify internal request (cron secret or admin)
function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  return false;
}

// POST /api/internal/optimize - Run optimization for all users
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch((e: unknown) => {
      console.warn('[Internal Optimize] Failed to parse request body:', e instanceof Error ? e.message : e);
      return {} as Record<string, unknown>;
    });
    const { userId, action = 'all' } = body;

    const supabase = createServerClient();
    const results: Record<string, unknown> = {};

    // Get users to optimize
    let userIds: string[] = [];

    if (userId) {
      userIds = [userId];
    } else {
      // Get all active users (those with memories in last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: activeUsers } = await supabase
        .from('memories')
        .select('user_id')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .eq('is_deleted', false);

      if (activeUsers) {
        userIds = [...new Set(activeUsers.map((u) => u.user_id))];
      }
    }

    results.usersProcessed = userIds.length;
    results.actions = {};

    for (const uid of userIds) {
      const userResults: Record<string, unknown> = {};

      // Action: Find and auto-merge highly similar memories
      if (action === 'all' || action === 'merge') {
        const similarPairs = await findSimilarMemories(uid, 0.95); // Very high threshold for auto-merge

        let mergedCount = 0;
        for (const pair of similarPairs.slice(0, 5)) { // Limit merges per run
          try {
            const mergedContent = await mergeMemories(pair.memory1, pair.memory2);
            const newEmbedding = await createEmbedding(mergedContent);

            const success = await executeMerge(
              uid,
              pair.memory1.id,
              pair.memory2.id,
              mergedContent,
              newEmbedding
            );

            if (success) mergedCount++;
          } catch (error) {
            console.error('Merge error:', error);
          }
        }

        userResults.merged = mergedCount;
        userResults.similarPairsFound = similarPairs.length;
      }

      // Action: Update importance scores
      if (action === 'all' || action === 'importance') {
        userResults.importanceUpdated = await updateImportanceScores(uid);
      }

      // Action: Apply decay
      if (action === 'all' || action === 'decay') {
        userResults.decayed = await applyMemoryDecay(uid);
      }

      (results.actions as Record<string, unknown>)[uid] = userResults;
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error('Optimization error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/internal/optimize - Get optimization stats
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId required' },
        { status: 400 }
      );
    }

    // Get similar memories for preview (not auto-merge)
    const similarPairs = await findSimilarMemories(userId, 0.85);

    return NextResponse.json({
      success: true,
      userId,
      similarPairs: similarPairs.slice(0, 10).map((p) => ({
        memory1: { id: p.memory1.id, content: p.memory1.content },
        memory2: { id: p.memory2.id, content: p.memory2.content },
        similarity: p.similarity,
      })),
      totalSimilarPairs: similarPairs.length,
    });
  } catch (error) {
    console.error('Get optimization stats error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
