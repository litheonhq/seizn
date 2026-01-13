/**
 * Seizn Autopilot Retrieval - Executor
 *
 * Orchestrates the complete autopilot workflow:
 * 1. Load/create config
 * 2. Build bandit state from DB
 * 3. Select strategy
 * 4. Record decision
 * 5. Update stats after execution
 */

import { createServerClient } from '@/lib/supabase';
import type {
  Strategy,
  AutopilotConfig,
  AutopilotConfigInput,
  BanditState,
  StrategySelection,
  StrategyOutcome,
  AutopilotDecision,
  RewardComponents,
  StrategyStatsSummary,
  RecentDecision,
  AutopilotRetrievalConfigRow,
  AutopilotStrategyStatsRow,
  AutopilotRetrievalDecisionRow,
} from './types';
import { rowToConfig, rowToArmStats } from './types';
import { ALL_STRATEGIES, DEFAULT_STRATEGY_WEIGHTS } from './types';
import { selectStrategy, buildBanditState, createInitialBanditState, classifyQuery } from './bandit';
import { calculateRewardFromOutcome } from './reward';
import { updateBanditState, updateWeightsGradient, normalizeWeights } from './learner';

// ===========================================
// Config Management
// ===========================================

/**
 * Get or create autopilot config for a user
 */
export async function getOrCreateConfig(
  userId: string,
  collectionId?: string | null
): Promise<AutopilotConfig> {
  const supabase = createServerClient();

  // First, try to get existing config
  let query = supabase
    .from('autopilot_retrieval_configs')
    .select('*')
    .eq('user_id', userId);

  if (collectionId) {
    query = query.eq('collection_id', collectionId);
  } else {
    query = query.is('collection_id', null);
  }

  const { data: existing, error: fetchError } = await query.single();

  if (existing && !fetchError) {
    return rowToConfig(existing as AutopilotRetrievalConfigRow);
  }

  // Create new config
  const { data: newConfig, error: createError } = await supabase
    .from('autopilot_retrieval_configs')
    .insert({
      user_id: userId,
      collection_id: collectionId || null,
    })
    .select()
    .single();

  if (createError) {
    throw new Error(`Failed to create autopilot config: ${createError.message}`);
  }

  // Initialize strategy stats
  const configId = (newConfig as AutopilotRetrievalConfigRow).id;
  const statsInserts = ALL_STRATEGIES.map(s => ({
    config_id: configId,
    strategy: s,
  }));

  await supabase.from('autopilot_strategy_stats').insert(statsInserts);

  return rowToConfig(newConfig as AutopilotRetrievalConfigRow);
}

/**
 * Update autopilot config
 */
export async function updateConfig(
  configId: string,
  updates: AutopilotConfigInput
): Promise<AutopilotConfig> {
  const supabase = createServerClient();

  const updateData: Partial<AutopilotRetrievalConfigRow> = {};

  if (updates.enabled !== undefined) updateData.enabled = updates.enabled;
  if (updates.mode !== undefined) updateData.mode = updates.mode;
  if (updates.maxLatencyMs !== undefined) updateData.max_latency_ms = updates.maxLatencyMs;
  if (updates.maxCostPerQuery !== undefined) updateData.max_cost_per_query = updates.maxCostPerQuery;
  if (updates.minRelevanceThreshold !== undefined) updateData.min_relevance_threshold = updates.minRelevanceThreshold;
  if (updates.explorationRate !== undefined) updateData.exploration_rate = updates.explorationRate;
  if (updates.learningRate !== undefined) updateData.learning_rate = updates.learningRate;
  if (updates.minSamplesBeforeLearning !== undefined) updateData.min_samples_before_learning = updates.minSamplesBeforeLearning;
  if (updates.useThompsonSampling !== undefined) updateData.use_thompson_sampling = updates.useThompsonSampling;
  if (updates.decayFactor !== undefined) updateData.decay_factor = updates.decayFactor;

  const { data, error } = await supabase
    .from('autopilot_retrieval_configs')
    .update(updateData)
    .eq('id', configId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update config: ${error.message}`);
  }

  return rowToConfig(data as AutopilotRetrievalConfigRow);
}

/**
 * Delete autopilot config
 */
export async function deleteConfig(configId: string): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('autopilot_retrieval_configs')
    .delete()
    .eq('id', configId);

  if (error) {
    throw new Error(`Failed to delete config: ${error.message}`);
  }
}

// ===========================================
// Bandit State Loading
// ===========================================

/**
 * Load bandit state from database
 */
export async function loadBanditState(configId: string): Promise<BanditState> {
  const supabase = createServerClient();

  // Load config
  const { data: configRow, error: configError } = await supabase
    .from('autopilot_retrieval_configs')
    .select('strategy_weights')
    .eq('id', configId)
    .single();

  if (configError || !configRow) {
    return createInitialBanditState(configId);
  }

  // Load stats
  const { data: statsRows, error: statsError } = await supabase
    .from('autopilot_strategy_stats')
    .select('*')
    .eq('config_id', configId);

  if (statsError || !statsRows || statsRows.length === 0) {
    return createInitialBanditState(configId);
  }

  const armStats = (statsRows as AutopilotStrategyStatsRow[]).map(rowToArmStats);

  return buildBanditState(
    configId,
    (configRow as { strategy_weights: typeof DEFAULT_STRATEGY_WEIGHTS }).strategy_weights,
    armStats
  );
}

// ===========================================
// Decision Making
// ===========================================

/**
 * Make autopilot decision for a query
 */
export async function makeDecision(
  userId: string,
  query: string,
  collectionId?: string | null,
  traceId?: string | null
): Promise<{
  selection: StrategySelection;
  decisionId: string;
  config: AutopilotConfig;
}> {
  // Get config
  const config = await getOrCreateConfig(userId, collectionId);

  // If autopilot is disabled, return default
  if (!config.enabled) {
    return {
      selection: {
        strategy: 'hybrid',
        isExploration: false,
        reason: 'Autopilot disabled',
        confidence: 1,
      },
      decisionId: '',
      config,
    };
  }

  // Load bandit state
  const state = await loadBanditState(config.id);

  // Make selection
  const selection = selectStrategy(config, state, query);

  // Record decision
  const supabase = createServerClient();
  const queryType = classifyQuery(query);

  const { data: decision, error } = await supabase
    .from('autopilot_retrieval_decisions')
    .insert({
      config_id: config.id,
      trace_id: traceId || null,
      query_text: query,
      query_length: query.length,
      query_type: queryType,
      chosen_strategy: selection.strategy,
      strategy_params: selection.params || null,
      decision_reason: selection.reason,
      was_exploration: selection.isExploration,
      pre_decision_weights: config.strategyWeights,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to record decision:', error);
    // Continue without recording
    return { selection, decisionId: '', config };
  }

  return {
    selection,
    decisionId: (decision as { id: string }).id,
    config,
  };
}

// ===========================================
// Outcome Recording
// ===========================================

/**
 * Record outcome after strategy execution
 */
export async function recordOutcome(
  decisionId: string,
  outcome: StrategyOutcome
): Promise<{ reward: number; components: RewardComponents }> {
  const supabase = createServerClient();

  // Get decision to find config
  const { data: decision, error: fetchError } = await supabase
    .from('autopilot_retrieval_decisions')
    .select('config_id, chosen_strategy')
    .eq('id', decisionId)
    .single();

  if (fetchError || !decision) {
    throw new Error(`Decision not found: ${decisionId}`);
  }

  const { config_id: configId, chosen_strategy: strategy } = decision as {
    config_id: string;
    chosen_strategy: Strategy;
  };

  // Get config for constraints
  const { data: configRow } = await supabase
    .from('autopilot_retrieval_configs')
    .select('max_latency_ms, max_cost_per_query, min_relevance_threshold, learning_rate, decay_factor')
    .eq('id', configId)
    .single();

  const constraints = configRow
    ? {
        maxLatencyMs: (configRow as AutopilotRetrievalConfigRow).max_latency_ms,
        maxCostPerQuery: (configRow as AutopilotRetrievalConfigRow).max_cost_per_query,
        minRelevanceThreshold: (configRow as AutopilotRetrievalConfigRow).min_relevance_threshold,
      }
    : undefined;

  // Calculate reward
  const { reward, components } = calculateRewardFromOutcome(outcome, constraints);

  // Update decision with outcome
  const { error: updateError } = await supabase
    .from('autopilot_retrieval_decisions')
    .update({
      latency_ms: outcome.latencyMs,
      relevance_score: outcome.relevanceScore,
      cost: outcome.cost,
      result_count: outcome.resultCount,
      reward,
      reward_components: components,
      user_feedback: outcome.userFeedback || null,
      feedback_at: outcome.userFeedback ? new Date().toISOString() : null,
    })
    .eq('id', decisionId);

  if (updateError) {
    console.error('Failed to update decision with outcome:', updateError);
  }

  // Update strategy stats
  await updateStrategyStats(configId, strategy, outcome, reward);

  // Update weights if enough samples
  await maybeUpdateWeights(configId, strategy, reward, configRow as AutopilotRetrievalConfigRow | null);

  return { reward, components };
}

/**
 * Update strategy statistics
 */
async function updateStrategyStats(
  configId: string,
  strategy: Strategy,
  outcome: StrategyOutcome,
  reward: number
): Promise<void> {
  const supabase = createServerClient();

  // Call the stored procedure
  const { error } = await supabase.rpc('update_autopilot_strategy_stats', {
    p_config_id: configId,
    p_strategy: strategy,
    p_latency_ms: outcome.latencyMs,
    p_relevance: outcome.relevanceScore,
    p_cost: outcome.cost,
    p_reward: reward,
  });

  if (error) {
    console.error('Failed to update strategy stats:', error);
  }
}

/**
 * Update weights if we have enough samples
 */
async function maybeUpdateWeights(
  configId: string,
  strategy: Strategy,
  reward: number,
  configRow: AutopilotRetrievalConfigRow | null
): Promise<void> {
  const supabase = createServerClient();

  // Get current state
  const { data: statsRows } = await supabase
    .from('autopilot_strategy_stats')
    .select('total_uses')
    .eq('config_id', configId);

  const totalUses = (statsRows || []).reduce(
    (sum, row) => sum + (row as { total_uses: number }).total_uses,
    0
  );

  const minSamples = configRow?.min_samples_before_learning || 100;

  if (totalUses < minSamples) {
    return; // Not enough samples yet
  }

  // Get current weights
  const { data: config } = await supabase
    .from('autopilot_retrieval_configs')
    .select('strategy_weights')
    .eq('id', configId)
    .single();

  if (!config) return;

  const currentWeights = (config as { strategy_weights: typeof DEFAULT_STRATEGY_WEIGHTS }).strategy_weights;
  const learningRate = configRow?.learning_rate || 0.05;

  // Update weights
  const newWeights = updateWeightsGradient(currentWeights, strategy, reward, learningRate);

  // Save new weights
  await supabase.rpc('update_autopilot_strategy_weights', {
    p_config_id: configId,
    p_new_weights: newWeights,
  });
}

// ===========================================
// Feedback Recording
// ===========================================

/**
 * Record user feedback for a decision
 */
export async function recordFeedback(
  decisionId: string,
  feedback: 'positive' | 'negative' | 'neutral'
): Promise<boolean> {
  const supabase = createServerClient();

  const { error } = await supabase.rpc('record_autopilot_feedback', {
    p_decision_id: decisionId,
    p_feedback: feedback,
  });

  if (error) {
    console.error('Failed to record feedback:', error);
    return false;
  }

  // Re-calculate reward with feedback
  const { data: decision } = await supabase
    .from('autopilot_retrieval_decisions')
    .select('config_id, chosen_strategy, latency_ms, relevance_score, cost, result_count')
    .eq('id', decisionId)
    .single();

  if (decision) {
    const decisionRow = decision as AutopilotRetrievalDecisionRow;
    if (
      decisionRow.latency_ms !== null &&
      decisionRow.relevance_score !== null &&
      decisionRow.cost !== null &&
      decisionRow.result_count !== null
    ) {
      await recordOutcome(decisionId, {
        latencyMs: decisionRow.latency_ms,
        relevanceScore: decisionRow.relevance_score,
        cost: decisionRow.cost,
        resultCount: decisionRow.result_count,
        userFeedback: feedback,
      });
    }
  }

  return true;
}

// ===========================================
// Stats & Analytics
// ===========================================

/**
 * Get strategy stats summary for UI
 */
export async function getStatsSummary(
  userId: string,
  collectionId?: string | null
): Promise<StrategyStatsSummary | null> {
  const supabase = createServerClient();

  // Get config
  let configQuery = supabase
    .from('autopilot_retrieval_configs')
    .select('id, exploration_rate, updated_at')
    .eq('user_id', userId);

  if (collectionId) {
    configQuery = configQuery.eq('collection_id', collectionId);
  } else {
    configQuery = configQuery.is('collection_id', null);
  }

  const { data: config, error: configError } = await configQuery.single();

  if (configError || !config) {
    return null;
  }

  const configId = (config as { id: string; exploration_rate: number; updated_at: string }).id;

  // Get stats
  const { data: statsRows, error: statsError } = await supabase
    .from('autopilot_strategy_stats')
    .select('*')
    .eq('config_id', configId);

  if (statsError || !statsRows) {
    return null;
  }

  const strategies = (statsRows as AutopilotStrategyStatsRow[]).map(row => {
    // Determine trend
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (row.recent_uses >= 10) {
      const delta = row.recent_avg_reward - row.avg_reward;
      if (delta > 0.05) trend = 'improving';
      else if (delta < -0.05) trend = 'declining';
    }

    return {
      strategy: row.strategy,
      totalUses: row.total_uses,
      successRate: row.success_rate,
      avgReward: row.avg_reward,
      avgLatencyMs: row.avg_latency_ms,
      avgRelevance: row.avg_relevance,
      trend,
    };
  });

  const totalDecisions = strategies.reduce((sum, s) => sum + s.totalUses, 0);

  return {
    configId,
    strategies,
    totalDecisions,
    explorationRate: (config as { exploration_rate: number }).exploration_rate,
    lastUpdated: (config as { updated_at: string }).updated_at,
  };
}

/**
 * Get recent decisions for decision log
 */
export async function getRecentDecisions(
  userId: string,
  collectionId?: string | null,
  limit: number = 50
): Promise<RecentDecision[]> {
  const supabase = createServerClient();

  // Get config ID
  let configQuery = supabase
    .from('autopilot_retrieval_configs')
    .select('id')
    .eq('user_id', userId);

  if (collectionId) {
    configQuery = configQuery.eq('collection_id', collectionId);
  } else {
    configQuery = configQuery.is('collection_id', null);
  }

  const { data: config } = await configQuery.single();

  if (!config) {
    return [];
  }

  const configId = (config as { id: string }).id;

  // Get decisions
  const { data: decisions, error } = await supabase
    .from('autopilot_retrieval_decisions')
    .select('id, created_at, query_text, chosen_strategy, was_exploration, latency_ms, relevance_score, reward, user_feedback')
    .eq('config_id', configId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !decisions) {
    return [];
  }

  return (decisions as AutopilotRetrievalDecisionRow[]).map(d => ({
    id: d.id,
    createdAt: d.created_at,
    queryText: d.query_text.substring(0, 100) + (d.query_text.length > 100 ? '...' : ''),
    chosenStrategy: d.chosen_strategy,
    wasExploration: d.was_exploration,
    latencyMs: d.latency_ms ?? undefined,
    relevanceScore: d.relevance_score ?? undefined,
    reward: d.reward ?? undefined,
    userFeedback: d.user_feedback,
  }));
}

/**
 * Reset autopilot learning (start fresh)
 */
export async function resetLearning(configId: string): Promise<void> {
  const supabase = createServerClient();

  // Reset strategy stats
  const { error: statsError } = await supabase
    .from('autopilot_strategy_stats')
    .update({
      total_uses: 0,
      total_successes: 0,
      avg_latency_ms: 0,
      avg_relevance: 0,
      avg_cost: 0,
      avg_reward: 0,
      success_rate: 0,
      recent_uses: 0,
      recent_avg_relevance: 0,
      recent_avg_reward: 0,
      recent_success_rate: 0,
      beta_alpha: 1,
      beta_beta: 1,
      ucb_value: 0,
    })
    .eq('config_id', configId);

  if (statsError) {
    throw new Error(`Failed to reset stats: ${statsError.message}`);
  }

  // Reset weights to default
  const { error: weightError } = await supabase
    .from('autopilot_retrieval_configs')
    .update({ strategy_weights: DEFAULT_STRATEGY_WEIGHTS })
    .eq('id', configId);

  if (weightError) {
    throw new Error(`Failed to reset weights: ${weightError.message}`);
  }

  // Optionally delete old decisions (or keep for history)
  // Uncomment if you want to clear decision history:
  // await supabase.from('autopilot_retrieval_decisions').delete().eq('config_id', configId);
}
