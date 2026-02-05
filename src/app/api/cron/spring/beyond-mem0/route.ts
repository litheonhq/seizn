/**
 * Beyond Mem0 Daily Maintenance Cron Job
 *
 * Runs daily maintenance tasks for Beyond Mem0 features:
 * - Tier rebalancing (MemGPT-style)
 * - Link generation for new memories (A-MEM)
 * - Community detection updates (GraphRAG)
 * - Community summary refresh (GraphRAG)
 *
 * GET /api/cron/spring/beyond-mem0
 *
 * Headers:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Query Parameters:
 *   tasks: Comma-separated list of tasks to run (default: all)
 *          Options: tier_rebalance, link_generation, community_detection, summary_refresh
 *   dryRun: If "true", only report what would be done (default: false)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createTierManagerService } from '@/lib/spring/memory-v4/tier-manager';
import { createLinkGeneratorService } from '@/lib/spring/memory-v4/link-generator';
import { createFactInvalidationService } from '@/lib/spring/memory-v4/fact-invalidation';
import { createCommunityDetectionService } from '@/lib/graph-rag/community/detection';
import { createCommunitySummaryService } from '@/lib/graph-rag/community/summary';

// =============================================================================
// Configuration
// =============================================================================

const JOB_TIMEOUT_MS = 55000; // 55 seconds (leave room for response)
const MAX_USERS_PER_RUN = 50;
const MAX_GRAPHS_PER_RUN = 20;

type TaskType = 'tier_rebalance' | 'link_generation' | 'fact_invalidation' | 'community_detection' | 'summary_refresh';

const ALL_TASKS: TaskType[] = [
  'tier_rebalance',
  'link_generation',
  'fact_invalidation',
  'community_detection',
  'summary_refresh',
];

// =============================================================================
// Auth
// =============================================================================

function verifyCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn('CRON_SECRET not configured');
    return false;
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice(7);
  return token === cronSecret;
}

// =============================================================================
// Task Results
// =============================================================================

interface TaskResult {
  task: TaskType;
  status: 'completed' | 'failed' | 'skipped' | 'partial';
  duration: number;
  details: Record<string, unknown>;
  error?: string;
}

// =============================================================================
// Task Processors
// =============================================================================

/**
 * Rebalance memory tiers for all active users
 */
async function processTierRebalance(
  supabase: ReturnType<typeof createServerClient>,
  startTime: number,
  dryRun: boolean
): Promise<TaskResult> {
  const taskStart = Date.now();
  const tierManager = createTierManagerService(supabase);

  try {
    // Get users with active memories
    const { data: users, error: usersError } = await supabase
      .from('spring_memory_notes')
      .select('user_id')
      .eq('status', 'active')
      .limit(MAX_USERS_PER_RUN);

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }

    const uniqueUserIds = [...new Set(users?.map((u) => u.user_id) || [])];

    if (uniqueUserIds.length === 0) {
      return {
        task: 'tier_rebalance',
        status: 'completed',
        duration: Date.now() - taskStart,
        details: { usersProcessed: 0, message: 'No active users found' },
      };
    }

    let totalPromoted = 0;
    let totalDemoted = 0;
    let totalUnchanged = 0;
    let processedUsers = 0;
    const errors: Array<{ userId: string; error: string }> = [];

    for (const userId of uniqueUserIds) {
      // Check timeout
      if (Date.now() - startTime > JOB_TIMEOUT_MS) {
        return {
          task: 'tier_rebalance',
          status: 'partial',
          duration: Date.now() - taskStart,
          details: {
            usersProcessed: processedUsers,
            totalUsers: uniqueUserIds.length,
            promoted: totalPromoted,
            demoted: totalDemoted,
            unchanged: totalUnchanged,
            stoppedReason: 'timeout',
          },
        };
      }

      try {
        if (!dryRun) {
          const result = await tierManager.rebalanceTiers(userId, { batchSize: 100 });
          totalPromoted += result.promoted;
          totalDemoted += result.demoted;
          totalUnchanged += result.unchanged;
        }
        processedUsers++;
      } catch (error) {
        errors.push({
          userId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      task: 'tier_rebalance',
      status: errors.length > 0 ? 'partial' : 'completed',
      duration: Date.now() - taskStart,
      details: {
        usersProcessed: processedUsers,
        promoted: totalPromoted,
        demoted: totalDemoted,
        unchanged: totalUnchanged,
        errors: errors.length > 0 ? errors : undefined,
        dryRun,
      },
    };
  } catch (error) {
    return {
      task: 'tier_rebalance',
      status: 'failed',
      duration: Date.now() - taskStart,
      details: {},
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate links for new memories (A-MEM style)
 */
async function processLinkGeneration(
  supabase: ReturnType<typeof createServerClient>,
  startTime: number,
  dryRun: boolean
): Promise<TaskResult> {
  const taskStart = Date.now();
  const linkGenerator = createLinkGeneratorService(supabase);

  try {
    // Get users with recent memories
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours

    const { data: users, error: usersError } = await supabase
      .from('spring_memory_notes')
      .select('user_id')
      .eq('status', 'active')
      .gte('created_at', since.toISOString())
      .limit(MAX_USERS_PER_RUN);

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }

    const uniqueUserIds = [...new Set(users?.map((u) => u.user_id) || [])];

    if (uniqueUserIds.length === 0) {
      return {
        task: 'link_generation',
        status: 'completed',
        duration: Date.now() - taskStart,
        details: { usersProcessed: 0, message: 'No users with new memories' },
      };
    }

    let totalEdgesCreated = 0;
    let totalMemoriesProcessed = 0;
    let processedUsers = 0;
    const errors: Array<{ userId: string; error: string }> = [];

    for (const userId of uniqueUserIds) {
      // Check timeout
      if (Date.now() - startTime > JOB_TIMEOUT_MS) {
        return {
          task: 'link_generation',
          status: 'partial',
          duration: Date.now() - taskStart,
          details: {
            usersProcessed: processedUsers,
            totalUsers: uniqueUserIds.length,
            totalEdgesCreated,
            totalMemoriesProcessed,
            stoppedReason: 'timeout',
          },
        };
      }

      try {
        if (!dryRun) {
          const result = await linkGenerator.processNewMemories(userId, {
            since,
            limit: 50,
            config: {
              maxLinks: 3,
              minSimilarity: 0.7,
              useLLMValidation: true,
              minConfidence: 0.6,
            },
          });
          totalEdgesCreated += result.totalEdgesCreated;
          totalMemoriesProcessed += result.processed;
        }
        processedUsers++;
      } catch (error) {
        errors.push({
          userId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      task: 'link_generation',
      status: errors.length > 0 ? 'partial' : 'completed',
      duration: Date.now() - taskStart,
      details: {
        usersProcessed: processedUsers,
        totalEdgesCreated,
        totalMemoriesProcessed,
        errors: errors.length > 0 ? errors : undefined,
        dryRun,
      },
    };
  } catch (error) {
    return {
      task: 'link_generation',
      status: 'failed',
      duration: Date.now() - taskStart,
      details: {},
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Process expired facts and clean up invalidations
 */
async function processFactInvalidation(
  supabase: ReturnType<typeof createServerClient>,
  startTime: number,
  dryRun: boolean
): Promise<TaskResult> {
  const taskStart = Date.now();
  const factInvalidation = createFactInvalidationService(supabase);

  try {
    if (dryRun) {
      // Count expired facts without processing
      const { count: expiredCount } = await supabase
        .from('spring_memory_notes')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .not('valid_to', 'is', null)
        .lt('valid_to', new Date().toISOString());

      return {
        task: 'fact_invalidation',
        status: 'completed',
        duration: Date.now() - taskStart,
        details: {
          wouldInvalidate: expiredCount ?? 0,
          dryRun: true,
        },
      };
    }

    // Process expired facts
    const expiredResult = await factInvalidation.processExpiredFacts();

    // Archive old invalidations (older than 90 days)
    const archivedCount = await factInvalidation.archiveOldInvalidations(90);

    return {
      task: 'fact_invalidation',
      status: expiredResult.errors.length > 0 ? 'partial' : 'completed',
      duration: Date.now() - taskStart,
      details: {
        invalidated: expiredResult.invalidated,
        archived: archivedCount,
        errors: expiredResult.errors.length > 0 ? expiredResult.errors : undefined,
      },
    };
  } catch (error) {
    return {
      task: 'fact_invalidation',
      status: 'failed',
      duration: Date.now() - taskStart,
      details: {},
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Update community detection for knowledge graphs
 */
async function processCommunityDetection(
  supabase: ReturnType<typeof createServerClient>,
  startTime: number,
  dryRun: boolean
): Promise<TaskResult> {
  const taskStart = Date.now();
  const communityDetection = createCommunityDetectionService(supabase);

  try {
    // Get graphs that need community detection update
    // Either never run, or last run > 7 days ago
    const staleThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const { data: graphs, error: graphsError } = await supabase
      .from('knowledge_graphs')
      .select('id, user_id, name')
      .or(`metadata->lastCommunityRun.is.null,metadata->lastCommunityRun.lt.${staleThreshold.toISOString()}`)
      .limit(MAX_GRAPHS_PER_RUN);

    if (graphsError) {
      // Try without the metadata filter if it fails
      const { data: fallbackGraphs, error: fallbackError } = await supabase
        .from('knowledge_graphs')
        .select('id, user_id, name')
        .limit(MAX_GRAPHS_PER_RUN);

      if (fallbackError) {
        throw new Error(`Failed to fetch graphs: ${fallbackError.message}`);
      }

      // Use fallback graphs
      if (!fallbackGraphs || fallbackGraphs.length === 0) {
        return {
          task: 'community_detection',
          status: 'completed',
          duration: Date.now() - taskStart,
          details: { graphsProcessed: 0, message: 'No graphs found' },
        };
      }

      return await runCommunityDetection(
        fallbackGraphs,
        communityDetection,
        supabase,
        startTime,
        taskStart,
        dryRun
      );
    }

    if (!graphs || graphs.length === 0) {
      return {
        task: 'community_detection',
        status: 'completed',
        duration: Date.now() - taskStart,
        details: { graphsProcessed: 0, message: 'No graphs need community detection' },
      };
    }

    return await runCommunityDetection(
      graphs,
      communityDetection,
      supabase,
      startTime,
      taskStart,
      dryRun
    );
  } catch (error) {
    return {
      task: 'community_detection',
      status: 'failed',
      duration: Date.now() - taskStart,
      details: {},
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function runCommunityDetection(
  graphs: Array<{ id: string; user_id: string; name: string | null }>,
  communityDetection: ReturnType<typeof createCommunityDetectionService>,
  supabase: ReturnType<typeof createServerClient>,
  startTime: number,
  taskStart: number,
  dryRun: boolean
): Promise<TaskResult> {
  let totalCommunitiesDetected = 0;
  let processedGraphs = 0;
  const errors: Array<{ graphId: string; error: string }> = [];

  for (const graph of graphs) {
    // Check timeout
    if (Date.now() - startTime > JOB_TIMEOUT_MS) {
      return {
        task: 'community_detection',
        status: 'partial',
        duration: Date.now() - taskStart,
        details: {
          graphsProcessed: processedGraphs,
          totalGraphs: graphs.length,
          totalCommunitiesDetected,
          stoppedReason: 'timeout',
        },
      };
    }

    try {
      if (!dryRun) {
        const result = await communityDetection.detectCommunities(graph.id, graph.user_id, {
          algorithm: 'louvain',
          resolution: 1.0,
          minCommunitySize: 3,
        });
        totalCommunitiesDetected += result.communities.length;

        // Update last run timestamp
        await supabase
          .from('knowledge_graphs')
          .update({
            metadata: supabase.rpc('jsonb_set_value', {
              target: 'metadata',
              path: '{lastCommunityRun}',
              value: JSON.stringify(new Date().toISOString()),
            }),
          })
          .eq('id', graph.id);
      }
      processedGraphs++;
    } catch (error) {
      errors.push({
        graphId: graph.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return {
    task: 'community_detection',
    status: errors.length > 0 ? 'partial' : 'completed',
    duration: Date.now() - taskStart,
    details: {
      graphsProcessed: processedGraphs,
      totalCommunitiesDetected,
      errors: errors.length > 0 ? errors : undefined,
      dryRun,
    },
  };
}

/**
 * Refresh stale community summaries
 */
async function processSummaryRefresh(
  supabase: ReturnType<typeof createServerClient>,
  startTime: number,
  dryRun: boolean
): Promise<TaskResult> {
  const taskStart = Date.now();
  const summaryService = createCommunitySummaryService(supabase);

  try {
    // Get graphs with communities
    const { data: graphs, error: graphsError } = await supabase
      .from('graph_communities')
      .select('graph_id')
      .limit(MAX_GRAPHS_PER_RUN);

    if (graphsError) {
      throw new Error(`Failed to fetch graphs: ${graphsError.message}`);
    }

    const uniqueGraphIds = [...new Set(graphs?.map((g) => g.graph_id) || [])];

    if (uniqueGraphIds.length === 0) {
      return {
        task: 'summary_refresh',
        status: 'completed',
        duration: Date.now() - taskStart,
        details: { graphsProcessed: 0, message: 'No graphs with communities found' },
      };
    }

    let totalSummariesRefreshed = 0;
    let processedGraphs = 0;
    const errors: Array<{ graphId: string; error: string }> = [];

    for (const graphId of uniqueGraphIds) {
      // Check timeout
      if (Date.now() - startTime > JOB_TIMEOUT_MS) {
        return {
          task: 'summary_refresh',
          status: 'partial',
          duration: Date.now() - taskStart,
          details: {
            graphsProcessed: processedGraphs,
            totalGraphs: uniqueGraphIds.length,
            totalSummariesRefreshed,
            stoppedReason: 'timeout',
          },
        };
      }

      try {
        if (!dryRun) {
          const refreshed = await summaryService.refreshStaleSummaries(graphId, 168); // 7 days
          totalSummariesRefreshed += refreshed;
        }
        processedGraphs++;
      } catch (error) {
        errors.push({
          graphId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      task: 'summary_refresh',
      status: errors.length > 0 ? 'partial' : 'completed',
      duration: Date.now() - taskStart,
      details: {
        graphsProcessed: processedGraphs,
        totalSummariesRefreshed,
        errors: errors.length > 0 ? errors : undefined,
        dryRun,
      },
    };
  } catch (error) {
    return {
      task: 'summary_refresh',
      status: 'failed',
      duration: Date.now() - taskStart,
      details: {},
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =============================================================================
// Main Handler
// =============================================================================

export async function GET(request: NextRequest) {
  // Verify cron authentication
  if (!verifyCronAuth(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const startTime = Date.now();
  const results: TaskResult[] = [];

  // Parse query parameters
  const { searchParams } = new URL(request.url);
  const tasksParam = searchParams.get('tasks');
  const dryRun = searchParams.get('dryRun') === 'true';

  // Determine which tasks to run
  let tasksToRun: TaskType[] = ALL_TASKS;
  if (tasksParam) {
    const requestedTasks = tasksParam.split(',').map((t) => t.trim() as TaskType);
    tasksToRun = requestedTasks.filter((t) => ALL_TASKS.includes(t));
    if (tasksToRun.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid tasks. Valid options: ${ALL_TASKS.join(', ')}`,
        },
        { status: 400 }
      );
    }
  }

  try {
    const supabase = createServerClient();

    // Run tasks in order
    for (const task of tasksToRun) {
      // Check overall timeout
      if (Date.now() - startTime > JOB_TIMEOUT_MS) {
        results.push({
          task,
          status: 'skipped',
          duration: 0,
          details: { reason: 'Global timeout reached' },
        });
        continue;
      }

      let result: TaskResult;

      switch (task) {
        case 'tier_rebalance':
          result = await processTierRebalance(supabase, startTime, dryRun);
          break;
        case 'link_generation':
          result = await processLinkGeneration(supabase, startTime, dryRun);
          break;
        case 'fact_invalidation':
          result = await processFactInvalidation(supabase, startTime, dryRun);
          break;
        case 'community_detection':
          result = await processCommunityDetection(supabase, startTime, dryRun);
          break;
        case 'summary_refresh':
          result = await processSummaryRefresh(supabase, startTime, dryRun);
          break;
        default:
          result = {
            task,
            status: 'skipped',
            duration: 0,
            details: { reason: 'Unknown task' },
          };
      }

      results.push(result);
    }

    // Calculate summary
    const completed = results.filter((r) => r.status === 'completed').length;
    const partial = results.filter((r) => r.status === 'partial').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;

    const overallSuccess = failed === 0;
    const overallStatus =
      failed > 0 ? 'partial_failure' : partial > 0 ? 'partial_success' : 'success';

    return NextResponse.json({
      success: overallSuccess,
      status: overallStatus,
      summary: {
        completed,
        partial,
        failed,
        skipped,
        totalDuration: Date.now() - startTime,
      },
      dryRun,
      results,
    });
  } catch (error) {
    console.error('Beyond Mem0 cron job error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        results,
      },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggering
export { GET as POST };
