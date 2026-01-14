/**
 * Policy Updater for Network Learning
 *
 * Generates and applies policy updates based on aggregated insights.
 * Integrates with A/B testing for gradual rollout.
 */

import { createServerClient } from '@/lib/supabase';
import { randomUUID } from 'crypto';
import { getInsights, analyzeTrends } from '../aggregation/aggregator';
import type {
  PolicyUpdate,
  PolicyUpdateRecord,
  AggregatedInsight,
  NetworkLearningConfig,
  AggregationPeriod,
} from '../types';
import { DEFAULT_NETWORK_LEARNING_CONFIG } from '../types';

// ============================================
// Policy Generation
// ============================================

export interface PolicyRecommendation {
  targetPolicy: string;
  changes: Record<string, unknown>;
  rationale: string;
  confidence: number;
  basedOnInsights: string[];
}

/**
 * Generate policy recommendations from insights
 */
export async function generatePolicyRecommendations(
  period: AggregationPeriod = 'weekly',
  config: NetworkLearningConfig = DEFAULT_NETWORK_LEARNING_CONFIG
): Promise<PolicyRecommendation[]> {
  const recommendations: PolicyRecommendation[] = [];

  // Get recent insights
  const insights = await getInsights({ period, limit: 50 });

  if (insights.length === 0) {
    return recommendations;
  }

  // Analyze trends for context
  const trends = await analyzeTrends(period);

  // Generate recommendations based on patterns
  const latencyRecs = analyzeLatencyPatterns(insights, trends, config);
  const pathRecs = analyzePlanPathPatterns(insights, config);
  const feedbackRecs = analyzeFeedbackPatterns(insights, trends, config);

  recommendations.push(...latencyRecs, ...pathRecs, ...feedbackRecs);

  // Filter by confidence threshold
  return recommendations.filter((r) => r.confidence >= config.minConfidence);
}

/**
 * Analyze latency patterns and recommend optimizations
 */
function analyzeLatencyPatterns(
  insights: AggregatedInsight[],
  trends: Awaited<ReturnType<typeof analyzeTrends>>,
  _config: NetworkLearningConfig
): PolicyRecommendation[] {
  const recommendations: PolicyRecommendation[] = [];

  // Find clusters with high latency
  const highLatencyClusters = insights.filter((i) => i.avgLatencyMs > 1000);

  if (highLatencyClusters.length > 0) {
    // Check if these clusters have consistent patterns
    const avgLatency =
      highLatencyClusters.reduce((sum, c) => sum + c.avgLatencyMs, 0) /
      highLatencyClusters.length;

    if (avgLatency > 1500) {
      recommendations.push({
        targetPolicy: 'planner.latency_budget',
        changes: {
          max_latency_ms: Math.min(avgLatency * 1.2, 3000),
          enable_caching: true,
          cache_ttl_seconds: 300,
        },
        rationale: `${highLatencyClusters.length} query clusters have avg latency > 1000ms. Recommend increasing budget and enabling caching.`,
        confidence: calculateConfidence(highLatencyClusters),
        basedOnInsights: highLatencyClusters.map((c) => c.id),
      });
    }
  }

  // Check for degrading trends
  const degradingClusters = trends.filter((t) => t.latencyTrend === 'degrading');

  if (degradingClusters.length >= 3) {
    recommendations.push({
      targetPolicy: 'planner.performance_alert',
      changes: {
        alert_threshold_percent: 10,
        enable_auto_scaling: true,
      },
      rationale: `${degradingClusters.length} clusters showing degrading latency trends. Recommend enabling performance alerts.`,
      confidence: 0.7 + (degradingClusters.length / 10) * 0.2,
      basedOnInsights: degradingClusters.map((t) => t.currentPeriod.id),
    });
  }

  return recommendations;
}

/**
 * Analyze plan path patterns and recommend optimizations
 */
function analyzePlanPathPatterns(
  insights: AggregatedInsight[],
  _config: NetworkLearningConfig
): PolicyRecommendation[] {
  const recommendations: PolicyRecommendation[] = [];

  // Aggregate path usage across all clusters
  const pathUsage: Record<string, { count: number; clusters: string[] }> = {};

  for (const insight of insights) {
    for (const pathInfo of insight.topPlanPaths) {
      const pathKey = pathInfo.path.join('->');
      if (!pathUsage[pathKey]) {
        pathUsage[pathKey] = { count: 0, clusters: [] };
      }
      pathUsage[pathKey].count += pathInfo.count;
      pathUsage[pathKey].clusters.push(insight.queryCluster);
    }
  }

  // Find most common paths
  const sortedPaths = Object.entries(pathUsage)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  if (sortedPaths.length > 0) {
    const topPath = sortedPaths[0];
    const topPathSteps = topPath[0].split('->');

    // Check if caching is being used effectively
    const hasCaching = topPathSteps.includes('cache_check');
    const hasRerank = topPathSteps.includes('rerank');

    if (!hasCaching && topPath[1].count > 100) {
      recommendations.push({
        targetPolicy: 'planner.default_path',
        changes: {
          enable_cache_check: true,
          cache_check_position: 'before_retrieve',
        },
        rationale: `Most common path (${topPath[1].count} uses) lacks caching. Recommend enabling cache checks.`,
        confidence: Math.min(0.85, 0.6 + (topPath[1].count / 500) * 0.25),
        basedOnInsights: insights.slice(0, 10).map((i) => i.id),
      });
    }

    if (!hasRerank && topPath[1].count > 100) {
      recommendations.push({
        targetPolicy: 'planner.rerank_config',
        changes: {
          enable_rerank: true,
          rerank_top_k: 10,
        },
        rationale: `High-traffic path lacks reranking. Recommend enabling for improved relevance.`,
        confidence: 0.75,
        basedOnInsights: insights.slice(0, 10).map((i) => i.id),
      });
    }
  }

  return recommendations;
}

/**
 * Analyze feedback patterns and recommend improvements
 */
function analyzeFeedbackPatterns(
  insights: AggregatedInsight[],
  trends: Awaited<ReturnType<typeof analyzeTrends>>,
  _config: NetworkLearningConfig
): PolicyRecommendation[] {
  const recommendations: PolicyRecommendation[] = [];

  // Filter insights with feedback data
  const withFeedback = insights.filter((i) => i.avgFeedbackScore !== undefined);

  if (withFeedback.length === 0) {
    return recommendations;
  }

  // Find low-performing clusters
  const lowPerforming = withFeedback.filter(
    (i) => i.avgFeedbackScore !== undefined && i.avgFeedbackScore < 3.0
  );

  if (lowPerforming.length >= 3) {
    // Analyze common patterns in low-performing clusters
    const commonPaths = findCommonPaths(lowPerforming);

    recommendations.push({
      targetPolicy: 'planner.quality_threshold',
      changes: {
        min_feedback_score: 3.0,
        enable_quality_monitoring: true,
        alert_on_low_feedback: true,
      },
      rationale: `${lowPerforming.length} clusters have feedback < 3.0. Common paths: ${commonPaths.slice(0, 2).join(', ')}`,
      confidence: calculateConfidence(lowPerforming),
      basedOnInsights: lowPerforming.map((c) => c.id),
    });
  }

  // Check for improving trends (positive signal)
  const improvingClusters = trends.filter((t) => t.feedbackTrend === 'improving');

  if (improvingClusters.length >= 3) {
    // Identify what's working
    const improvingInsights = improvingClusters
      .map((t) => t.currentPeriod)
      .filter(Boolean);

    const successPaths = findCommonPaths(improvingInsights);

    if (successPaths.length > 0) {
      recommendations.push({
        targetPolicy: 'planner.preferred_paths',
        changes: {
          preferred_path_patterns: successPaths.slice(0, 3),
          prefer_weight: 1.2,
        },
        rationale: `${improvingClusters.length} clusters showing improvement. Recommend promoting successful patterns.`,
        confidence: 0.8,
        basedOnInsights: improvingInsights.map((i) => i.id),
      });
    }
  }

  return recommendations;
}

/**
 * Find common plan paths across insights
 */
function findCommonPaths(insights: AggregatedInsight[]): string[] {
  const pathCounts: Record<string, number> = {};

  for (const insight of insights) {
    for (const pathInfo of insight.topPlanPaths) {
      const pathKey = pathInfo.path.join('->');
      pathCounts[pathKey] = (pathCounts[pathKey] ?? 0) + pathInfo.count;
    }
  }

  return Object.entries(pathCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([path]) => path);
}

/**
 * Calculate confidence based on sample sizes
 */
function calculateConfidence(insights: AggregatedInsight[]): number {
  const totalSamples = insights.reduce((sum, i) => sum + i.sampleCount, 0);

  // Base confidence + sample size bonus
  const baseConfidence = 0.6;
  const sampleBonus = Math.min(0.3, (totalSamples / 1000) * 0.3);

  return Math.min(0.95, baseConfidence + sampleBonus);
}

// ============================================
// Policy Update Management
// ============================================

/**
 * Create a policy update record
 */
export async function createPolicyUpdate(
  recommendation: PolicyRecommendation
): Promise<PolicyUpdate> {
  const supabase = createServerClient();

  const record = {
    id: `pu_${randomUUID().replace(/-/g, '')}`,
    target_policy: recommendation.targetPolicy,
    changes: recommendation.changes,
    based_on_insights: recommendation.basedOnInsights,
    confidence: recommendation.confidence,
    status: 'pending' as const,
    applied_at: null,
  };

  const { data, error } = await supabase
    .from('network_learning_policy_updates')
    .insert(record)
    .select()
    .single();

  if (error) {
    console.error('Failed to create policy update:', error);
    throw error;
  }

  return recordToPolicyUpdate(data as PolicyUpdateRecord);
}

/**
 * Get pending policy updates
 */
export async function getPendingUpdates(): Promise<PolicyUpdate[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('network_learning_policy_updates')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to get pending updates:', error);
    throw error;
  }

  return (data ?? []).map(recordToPolicyUpdate);
}

/**
 * Get all policy updates with optional filtering
 */
export async function getPolicyUpdates(options: {
  status?: 'pending' | 'approved' | 'applied' | 'rejected';
  limit?: number;
}): Promise<PolicyUpdate[]> {
  const supabase = createServerClient();
  const { status, limit = 50 } = options;

  let query = supabase
    .from('network_learning_policy_updates')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to get policy updates:', error);
    throw error;
  }

  return (data ?? []).map(recordToPolicyUpdate);
}

/**
 * Approve a policy update
 */
export async function approvePolicyUpdate(updateId: string): Promise<PolicyUpdate> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('network_learning_policy_updates')
    .update({
      status: 'approved',
      updated_at: new Date().toISOString(),
    })
    .eq('id', updateId)
    .eq('status', 'pending')
    .select()
    .single();

  if (error) {
    console.error('Failed to approve policy update:', error);
    throw error;
  }

  return recordToPolicyUpdate(data as PolicyUpdateRecord);
}

/**
 * Reject a policy update
 */
export async function rejectPolicyUpdate(updateId: string): Promise<PolicyUpdate> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('network_learning_policy_updates')
    .update({
      status: 'rejected',
      updated_at: new Date().toISOString(),
    })
    .eq('id', updateId)
    .eq('status', 'pending')
    .select()
    .single();

  if (error) {
    console.error('Failed to reject policy update:', error);
    throw error;
  }

  return recordToPolicyUpdate(data as PolicyUpdateRecord);
}

/**
 * Apply a policy update
 * This marks the update as applied and returns the changes to be applied
 */
export async function applyPolicyUpdate(
  updateId: string,
  _config: NetworkLearningConfig = DEFAULT_NETWORK_LEARNING_CONFIG
): Promise<{ update: PolicyUpdate; applied: boolean }> {
  const supabase = createServerClient();

  // Get the update
  const { data: updateData, error: fetchError } = await supabase
    .from('network_learning_policy_updates')
    .select('*')
    .eq('id', updateId)
    .single();

  if (fetchError || !updateData) {
    throw new Error('Policy update not found');
  }

  const record = updateData as PolicyUpdateRecord;

  if (record.status !== 'approved') {
    throw new Error('Policy update must be approved before applying');
  }

  // Mark as applied
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('network_learning_policy_updates')
    .update({
      status: 'applied',
      applied_at: now,
      updated_at: now,
    })
    .eq('id', updateId)
    .select()
    .single();

  if (error) {
    console.error('Failed to apply policy update:', error);
    throw error;
  }

  return {
    update: recordToPolicyUpdate(data as PolicyUpdateRecord),
    applied: true,
  };
}

// ============================================
// A/B Test Integration
// ============================================

export interface ABTestConfig {
  experimentName: string;
  controlConfig: Record<string, unknown>;
  treatmentConfig: Record<string, unknown>;
  trafficPercentage: number;
}

/**
 * Create an A/B test for a policy update
 * Returns experiment configuration for integration with fall/experiments
 */
export function createABTestConfig(update: PolicyUpdate): ABTestConfig {
  return {
    experimentName: `network_learning_${update.targetPolicy}_${Date.now()}`,
    controlConfig: {}, // Current config (baseline)
    treatmentConfig: update.changes,
    trafficPercentage: 10, // Start with 10% traffic
  };
}

// ============================================
// Helper Functions
// ============================================

function recordToPolicyUpdate(record: PolicyUpdateRecord): PolicyUpdate {
  return {
    id: record.id,
    targetPolicy: record.target_policy,
    changes: record.changes,
    basedOnInsights: record.based_on_insights,
    confidence: record.confidence,
    appliedAt: record.applied_at ?? undefined,
  };
}

// ============================================
// Scheduled Policy Generation
// ============================================

/**
 * Run scheduled policy recommendation generation
 */
export async function runScheduledPolicyGeneration(
  period: AggregationPeriod = 'weekly',
  config: NetworkLearningConfig = DEFAULT_NETWORK_LEARNING_CONFIG
): Promise<{ updatesCreated: number; errors: string[] }> {
  const errors: string[] = [];
  let updatesCreated = 0;

  try {
    const recommendations = await generatePolicyRecommendations(period, config);

    for (const rec of recommendations) {
      try {
        await createPolicyUpdate(rec);
        updatesCreated++;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to create update for ${rec.targetPolicy}: ${message}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`Policy generation failed: ${message}`);
    console.error('Scheduled policy generation failed:', error);
  }

  return { updatesCreated, errors };
}
