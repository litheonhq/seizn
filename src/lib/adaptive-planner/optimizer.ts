/**
 * Seizn Adaptive Planner - Plan Optimizer
 *
 * Optimizes plans based on historical performance,
 * learns new plans from successful patterns, and
 * provides recommendations for improvement.
 */

import { createServerClient } from '@/lib/supabase';
import type {
  QueryPlan,
  PlanOutcome,
  OptimizationResult,
  OptimizationRecommendation,
  PlanPerformanceSummary,
  QueryPlanRow,
  PlanSelectionRow,
} from './types';
import { rowToQueryPlan } from './types';

// ============================================
// Record Plan Outcome
// ============================================

/**
 * Record the outcome of a plan selection for learning
 */
export async function recordPlanOutcome(
  outcome: PlanOutcome
): Promise<{ success: boolean; selectionId?: string; error?: string }> {
  const supabase = createServerClient();

  const insertData: Partial<PlanSelectionRow> = {
    plan_id: outcome.planId || null,
    trace_id: outcome.traceId || null,
    query_text: outcome.queryText,
    detected_intent: outcome.detectedIntent || null,
    query_features: outcome.queryFeatures || null,
    latency_ms: outcome.latencyMs || null,
    relevance_score: outcome.relevanceScore || null,
    user_satisfied: outcome.userSatisfied ?? null,
  };

  const { data, error } = await supabase
    .from('plan_selections')
    .insert(insertData)
    .select('id')
    .single();

  if (error) {
    console.error('Failed to record plan outcome:', error);
    return { success: false, error: error.message };
  }

  return { success: true, selectionId: data.id };
}

/**
 * Update an existing selection with outcome data
 */
export async function updateSelectionOutcome(
  selectionId: string,
  outcome: {
    latencyMs?: number;
    relevanceScore?: number;
    userSatisfied?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();

  const updateData: Partial<PlanSelectionRow> = {};
  if (outcome.latencyMs !== undefined) updateData.latency_ms = outcome.latencyMs;
  if (outcome.relevanceScore !== undefined) updateData.relevance_score = outcome.relevanceScore;
  if (outcome.userSatisfied !== undefined) updateData.user_satisfied = outcome.userSatisfied;

  const { error } = await supabase
    .from('plan_selections')
    .update(updateData)
    .eq('id', selectionId);

  if (error) {
    console.error('Failed to update selection outcome:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

// ============================================
// Plan Optimization
// ============================================

/**
 * Optimize plans based on historical performance
 */
export async function optimizePlans(
  userId: string,
  options: {
    collectionId?: string;
    minSamples?: number;
    minSuccessRate?: number;
    autoApply?: boolean;
  } = {}
): Promise<OptimizationResult> {
  const {
    collectionId,
    minSamples = 10,
    minSuccessRate = 0.8,
    autoApply = false,
  } = options;

  const result: OptimizationResult = {
    success: true,
    plansCreated: 0,
    plansUpdated: 0,
    plansDeactivated: 0,
    newPlans: [],
    recommendations: [],
  };

  try {
    // 1. Analyze existing plans for underperformers
    const underperformers = await findUnderperformingPlans(userId, collectionId, minSamples);
    for (const plan of underperformers) {
      result.recommendations.push({
        type: 'deactivate',
        priority: 'medium',
        description: `Plan "${plan.planName}" has low success rate (${(plan.successRate * 100).toFixed(0)}%)`,
        affectedPlanIds: [plan.id],
        reason: `Success rate below threshold with ${plan.usageCount} uses`,
        expectedImprovement: 'Better plan matching for these query types',
      });

      if (autoApply) {
        await deactivatePlan(plan.id);
        result.plansDeactivated++;
      }
    }

    // 2. Find opportunities for new learned plans
    const learnedPlans = await learnFromSuccessfulSelections(
      userId,
      collectionId,
      minSamples,
      minSuccessRate
    );

    for (const plan of learnedPlans) {
      result.newPlans.push(plan);
      result.plansCreated++;
    }

    // 3. Find similar plans that could be merged
    const mergeOpportunities = await findMergeOpportunities(userId, collectionId);
    for (const opportunity of mergeOpportunities) {
      result.recommendations.push(opportunity);
    }

    // 4. Find gaps in coverage
    const coverageGaps = await findCoverageGaps(userId, collectionId);
    for (const gap of coverageGaps) {
      result.recommendations.push(gap);
    }

    // 5. Suggest config improvements based on performance data
    const configSuggestions = await analyzeConfigPerformance(userId, collectionId, minSamples);
    for (const suggestion of configSuggestions) {
      result.recommendations.push(suggestion);
    }

  } catch (error) {
    console.error('Plan optimization error:', error);
    result.success = false;
  }

  return result;
}

// ============================================
// Analysis Functions
// ============================================

/**
 * Find plans with low success rates
 */
async function findUnderperformingPlans(
  userId: string,
  collectionId?: string,
  minSamples: number = 10
): Promise<QueryPlan[]> {
  const supabase = createServerClient();

  let queryBuilder = supabase
    .from('query_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .gte('usage_count', minSamples)
    .lt('success_rate', 0.5); // Below 50% success

  if (collectionId) {
    queryBuilder = queryBuilder.eq('collection_id', collectionId);
  }

  const { data, error } = await queryBuilder;

  if (error || !data) {
    return [];
  }

  return (data as QueryPlanRow[]).map(rowToQueryPlan);
}

/**
 * Learn new plans from successful selections without plans
 */
async function learnFromSuccessfulSelections(
  userId: string,
  collectionId?: string,
  minSamples: number = 10,
  minSuccessRate: number = 0.8
): Promise<QueryPlan[]> {
  const supabase = createServerClient();

  // Use the database function for learning
  const { data, error } = await supabase.rpc('learn_plan_from_selections', {
    p_user_id: userId,
    p_collection_id: collectionId || null,
    p_min_samples: minSamples,
    p_min_success_rate: minSuccessRate,
  });

  if (error || !data || data.length === 0) {
    return [];
  }

  const result = data[0];

  if (!result.success || !result.plan_id) {
    return [];
  }

  // Fetch the created plan
  const { data: planData } = await supabase
    .from('query_plans')
    .select('*')
    .eq('id', result.plan_id)
    .single();

  if (!planData) {
    return [];
  }

  return [rowToQueryPlan(planData as QueryPlanRow)];
}

/**
 * Find plans that could potentially be merged
 */
async function findMergeOpportunities(
  userId: string,
  collectionId?: string
): Promise<OptimizationRecommendation[]> {
  const supabase = createServerClient();
  const recommendations: OptimizationRecommendation[] = [];

  let queryBuilder = supabase
    .from('query_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (collectionId) {
    queryBuilder = queryBuilder.eq('collection_id', collectionId);
  }

  const { data: plans, error } = await queryBuilder;

  if (error || !plans || plans.length < 2) {
    return recommendations;
  }

  // Group plans by intent
  const intentGroups: Record<string, QueryPlanRow[]> = {};

  for (const plan of plans as QueryPlanRow[]) {
    if (plan.query_intents && plan.query_intents.length > 0) {
      for (const intent of plan.query_intents) {
        if (!intentGroups[intent]) {
          intentGroups[intent] = [];
        }
        intentGroups[intent].push(plan);
      }
    }
  }

  // Find groups with multiple similar plans
  for (const [intent, group] of Object.entries(intentGroups)) {
    if (group.length >= 2) {
      // Check if configs are similar
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const configSimilarity = calculateConfigSimilarity(
            group[i].plan_config as unknown as Record<string, unknown>,
            group[j].plan_config as unknown as Record<string, unknown>
          );

          if (configSimilarity > 0.8) {
            // Very similar configs
            recommendations.push({
              type: 'merge',
              priority: 'low',
              description: `Plans "${group[i].plan_name}" and "${group[j].plan_name}" have similar configs for intent "${intent}"`,
              affectedPlanIds: [group[i].id, group[j].id],
              reason: `Config similarity: ${(configSimilarity * 100).toFixed(0)}%`,
              expectedImprovement: 'Reduced complexity and better maintenance',
            });
          }
        }
      }
    }
  }

  return recommendations;
}

/**
 * Find gaps in query coverage
 */
async function findCoverageGaps(
  userId: string,
  collectionId?: string
): Promise<OptimizationRecommendation[]> {
  const supabase = createServerClient();
  const recommendations: OptimizationRecommendation[] = [];

  // Get selections that fell back to default plans
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: fallbackSelections, error } = await supabase
    .from('plan_selections')
    .select('detected_intent, query_features')
    .is('plan_id', null)
    .gte('created_at', thirtyDaysAgo.toISOString());

  if (error || !fallbackSelections) {
    return recommendations;
  }

  // Count by intent
  const intentCounts: Record<string, number> = {};

  for (const selection of fallbackSelections) {
    const intent = selection.detected_intent || 'unknown';
    intentCounts[intent] = (intentCounts[intent] || 0) + 1;
  }

  // Find intents with many fallbacks
  for (const [intent, count] of Object.entries(intentCounts)) {
    if (count >= 10) {
      // Check if there's already a plan for this intent
      const { data: existingPlan } = await supabase
        .from('query_plans')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .contains('query_intents', [intent])
        .limit(1)
        .single();

      if (!existingPlan) {
        recommendations.push({
          type: 'create',
          priority: count >= 50 ? 'high' : 'medium',
          description: `No custom plan for intent "${intent}" (${count} queries used defaults)`,
          reason: `${count} queries in the last 30 days fell back to default plans`,
          expectedImprovement: 'Better tuned retrieval for this query type',
        });
      }
    }
  }

  return recommendations;
}

/**
 * Analyze config performance and suggest improvements
 */
async function analyzeConfigPerformance(
  userId: string,
  collectionId?: string,
  minSamples: number = 10
): Promise<OptimizationRecommendation[]> {
  const supabase = createServerClient();
  const recommendations: OptimizationRecommendation[] = [];

  // Get plans with performance data
  let queryBuilder = supabase
    .from('query_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .gte('usage_count', minSamples);

  if (collectionId) {
    queryBuilder = queryBuilder.eq('collection_id', collectionId);
  }

  const { data: plans, error } = await queryBuilder;

  if (error || !plans) {
    return recommendations;
  }

  for (const plan of plans as QueryPlanRow[]) {
    const config = plan.plan_config;

    // High latency suggestion
    if (plan.avg_latency_ms > 2000) {
      recommendations.push({
        type: 'update',
        priority: 'medium',
        description: `Plan "${plan.plan_name}" has high average latency (${plan.avg_latency_ms.toFixed(0)}ms)`,
        affectedPlanIds: [plan.id],
        suggestedConfig: {
          topK: Math.max(5, (config.topK || 10) - 3),
          rerankEnabled: false,
        },
        reason: 'Consider reducing topK or disabling rerank for speed',
        expectedImprovement: 'Lower latency',
      });
    }

    // Low relevance suggestion
    if (plan.avg_relevance_score < 0.5 && plan.success_rate > 0.5) {
      recommendations.push({
        type: 'update',
        priority: 'medium',
        description: `Plan "${plan.plan_name}" has low average relevance (${plan.avg_relevance_score.toFixed(2)})`,
        affectedPlanIds: [plan.id],
        suggestedConfig: {
          topK: (config.topK || 10) + 5,
          threshold: Math.max(0.3, (config.threshold || 0.5) - 0.1),
          rerankEnabled: true,
        },
        reason: 'Consider increasing topK or lowering threshold',
        expectedImprovement: 'Better relevance',
      });
    }

    // Hybrid alpha tuning
    if (plan.avg_relevance_score < 0.6) {
      const currentAlpha = config.hybridAlpha || 0.7;
      const suggestedAlpha = currentAlpha < 0.5 ? currentAlpha + 0.15 : currentAlpha - 0.15;

      recommendations.push({
        type: 'update',
        priority: 'low',
        description: `Plan "${plan.plan_name}" might benefit from hybrid alpha adjustment`,
        affectedPlanIds: [plan.id],
        suggestedConfig: {
          hybridAlpha: Math.max(0.2, Math.min(0.9, suggestedAlpha)),
        },
        reason: `Current alpha: ${currentAlpha}, try adjusting vector/keyword balance`,
        expectedImprovement: 'Potentially better matching',
      });
    }
  }

  return recommendations;
}

// ============================================
// Plan Management
// ============================================

/**
 * Deactivate a plan
 */
async function deactivatePlan(planId: string): Promise<boolean> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('query_plans')
    .update({ is_active: false })
    .eq('id', planId);

  return !error;
}

/**
 * Update plan config
 */
export async function updatePlanConfig(
  planId: string,
  config: Partial<QueryPlan['planConfig']>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();

  // Get current config
  const { data: current, error: fetchError } = await supabase
    .from('query_plans')
    .select('plan_config')
    .eq('id', planId)
    .single();

  if (fetchError || !current) {
    return { success: false, error: 'Plan not found' };
  }

  // Merge configs
  const mergedConfig = { ...current.plan_config, ...config };

  const { error } = await supabase
    .from('query_plans')
    .update({ plan_config: mergedConfig })
    .eq('id', planId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// ============================================
// Performance Analytics
// ============================================

/**
 * Get performance summary for plans
 */
export async function getPlanPerformance(
  userId: string,
  options: {
    collectionId?: string;
    days?: number;
  } = {}
): Promise<PlanPerformanceSummary[]> {
  const { collectionId, days = 30 } = options;
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc('get_plan_performance_summary', {
    p_user_id: userId,
    p_collection_id: collectionId || null,
    p_days: days,
  });

  if (error || !data) {
    return [];
  }

  return data.map((row: {
    plan_id: string;
    plan_name: string;
    total_uses: number;
    avg_latency_ms: number;
    avg_relevance: number;
    success_rate: number;
    intent_distribution: Record<string, number>;
  }) => ({
    planId: row.plan_id,
    planName: row.plan_name,
    totalUses: row.total_uses,
    avgLatencyMs: row.avg_latency_ms,
    avgRelevance: row.avg_relevance,
    successRate: row.success_rate,
    intentDistribution: row.intent_distribution || {},
  }));
}

/**
 * Get recent selection history
 */
export async function getSelectionHistory(
  userId: string,
  options: {
    planId?: string;
    limit?: number;
    includeFeatures?: boolean;
  } = {}
): Promise<Array<{
  id: string;
  planId?: string;
  queryText: string;
  intent?: string;
  latencyMs?: number;
  relevanceScore?: number;
  satisfied?: boolean;
  createdAt: string;
}>> {
  const { planId, limit = 50, includeFeatures = false } = options;
  const supabase = createServerClient();

  let selectFields = 'id, plan_id, query_text, detected_intent, latency_ms, relevance_score, user_satisfied, created_at';
  if (includeFeatures) {
    selectFields += ', query_features';
  }

  let queryBuilder = supabase
    .from('plan_selections')
    .select(selectFields)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (planId) {
    queryBuilder = queryBuilder.eq('plan_id', planId);
  }

  const { data, error } = await queryBuilder;

  if (error || !data) {
    return [];
  }

  return (data as unknown as PlanSelectionRow[]).map((row: PlanSelectionRow) => ({
    id: row.id,
    planId: row.plan_id || undefined,
    queryText: row.query_text,
    intent: row.detected_intent || undefined,
    latencyMs: row.latency_ms || undefined,
    relevanceScore: row.relevance_score || undefined,
    satisfied: row.user_satisfied ?? undefined,
    createdAt: row.created_at,
  }));
}

// ============================================
// Utility Functions
// ============================================

/**
 * Calculate similarity between two plan configs
 */
function calculateConfigSimilarity(
  config1: Record<string, unknown>,
  config2: Record<string, unknown>
): number {
  const keys = new Set([...Object.keys(config1), ...Object.keys(config2)]);
  let matches = 0;
  let total = 0;

  for (const key of keys) {
    const val1 = config1[key];
    const val2 = config2[key];

    if (val1 === undefined || val2 === undefined) {
      continue;
    }

    total++;

    if (typeof val1 === 'number' && typeof val2 === 'number') {
      // For numbers, consider them similar if within 20%
      const ratio = Math.min(val1, val2) / Math.max(val1, val2);
      if (ratio >= 0.8) {
        matches++;
      } else {
        matches += ratio; // Partial credit
      }
    } else if (val1 === val2) {
      matches++;
    }
  }

  return total > 0 ? matches / total : 0;
}
