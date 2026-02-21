import type { SupabaseClient } from '@supabase/supabase-js';
import type { RouterDecision, SearchMode } from './auto-router';

export type RouterStrategy = Exclude<SearchMode, 'auto'>;

interface RouterLearningRow {
  id: string;
  user_id: string;
  namespace: string;
  query_bucket: string;
  strategy: RouterStrategy;
  total_queries: number;
  total_successes: number;
  total_zero_results: number;
  avg_latency_ms: number;
  avg_result_count: number;
  total_feedback_count: number;
  avg_feedback_reward: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RouterLearningDecision {
  strategy: RouterStrategy;
  learningApplied: boolean;
  reason: string;
  queryBucket: string;
  statsAvailable: boolean;
  sampleCount: number;
  scoreDelta: number;
  scores: Partial<Record<RouterStrategy, number>>;
}

interface RouterOutcomeInput {
  userId: string;
  namespace: string;
  query: string;
  strategy: RouterStrategy;
  latencyMs: number;
  resultCount: number;
  topScore?: number;
}

interface RouterFeedbackInput {
  userId: string;
  namespace: string;
  query: string;
  strategy: RouterStrategy;
  reward: number;
}

const ALL_STRATEGIES: RouterStrategy[] = ['slot', 'keyword', 'hybrid', 'vector'];
const MAX_ACCEPTED_LATENCY_MS = 1800;
const MIN_SAMPLES_TO_OVERRIDE = 8;
const MIN_DELTA_TO_OVERRIDE = 0.08;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function isMissingRouterStatsError(
  error: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  if (!error) return false;
  const code = error.code || '';
  const message = (error.message || '').toLowerCase();
  return code === '42P01' || message.includes('memory_router_strategy_stats');
}

export function classifyQueryBucket(query: string): string {
  const normalized = query.trim().toLowerCase();
  const length = normalized.length;
  const wordCount = normalized.length > 0 ? normalized.split(/\s+/).length : 0;

  if (wordCount <= 2 || length <= 18) {
    return 'short';
  }
  if (wordCount >= 10 || length >= 80) {
    return 'long';
  }
  if (/[?]|^(what|why|how|when|where|who|which)\b/.test(normalized)) {
    return 'question';
  }
  return 'medium';
}

function scoreStrategyRow(
  row: RouterLearningRow,
  fallbackStrategy: RouterStrategy
): number {
  const total = Math.max(1, toNumber(row.total_queries, 0));
  const successRate = clamp(toNumber(row.total_successes, 0) / total, 0, 1);
  const zeroRate = clamp(toNumber(row.total_zero_results, 0) / total, 0, 1);
  const latencyScore = 1 - clamp(toNumber(row.avg_latency_ms, MAX_ACCEPTED_LATENCY_MS) / MAX_ACCEPTED_LATENCY_MS, 0, 1);
  const resultCountScore = clamp(toNumber(row.avg_result_count, 0) / 6, 0, 1);
  const feedbackScore = clamp((toNumber(row.avg_feedback_reward, 0) + 1) / 2, 0, 1);
  const sampleWeight = clamp(total / 30, 0, 1);

  const learnedScore =
    successRate * 0.45 +
    (1 - zeroRate) * 0.2 +
    latencyScore * 0.15 +
    resultCountScore * 0.1 +
    feedbackScore * 0.1;

  const fallbackBias = row.strategy === fallbackStrategy ? 0.04 : 0;
  const conservativePrior = row.strategy === fallbackStrategy ? 0.62 : 0.5;
  return sampleWeight * learnedScore + (1 - sampleWeight) * conservativePrior + fallbackBias;
}

export async function applyRouterLearning(
  supabase: SupabaseClient,
  userId: string,
  namespace: string,
  query: string,
  ruleDecision: Pick<RouterDecision, 'strategy' | 'confidence'>
): Promise<RouterLearningDecision> {
  const fallbackStrategy = ruleDecision.strategy as RouterStrategy;
  const queryBucket = classifyQueryBucket(query);

  const { data, error } = await supabase
    .from('memory_router_strategy_stats')
    .select('*')
    .eq('user_id', userId)
    .eq('namespace', namespace)
    .eq('query_bucket', queryBucket);

  if (error) {
    if (isMissingRouterStatsError(error)) {
      return {
        strategy: fallbackStrategy,
        learningApplied: false,
        reason: 'schema_missing',
        queryBucket,
        statsAvailable: false,
        sampleCount: 0,
        scoreDelta: 0,
        scores: {},
      };
    }
    throw error;
  }

  const rows = (data || []) as RouterLearningRow[];
  if (rows.length === 0) {
    return {
      strategy: fallbackStrategy,
      learningApplied: false,
      reason: 'cold_start_no_stats',
      queryBucket,
      statsAvailable: true,
      sampleCount: 0,
      scoreDelta: 0,
      scores: {},
    };
  }

  const byStrategy = new Map<RouterStrategy, RouterLearningRow>();
  for (const row of rows) {
    if (ALL_STRATEGIES.includes(row.strategy)) {
      byStrategy.set(row.strategy, row);
    }
  }

  const scores: Partial<Record<RouterStrategy, number>> = {};
  let selected = fallbackStrategy;
  let selectedScore = -Infinity;
  let selectedSamples = 0;

  for (const strategy of ALL_STRATEGIES) {
    const row = byStrategy.get(strategy);
    if (!row) continue;
    const strategyScore = scoreStrategyRow(row, fallbackStrategy);
    scores[strategy] = round4(strategyScore);
    if (strategyScore > selectedScore) {
      selected = strategy;
      selectedScore = strategyScore;
      selectedSamples = toNumber(row.total_queries, 0);
    }
  }

  const fallbackScore = scores[fallbackStrategy] ?? 0;
  const scoreDelta = round4(selectedScore - fallbackScore);
  const shouldOverride =
    selected !== fallbackStrategy &&
    selectedSamples >= MIN_SAMPLES_TO_OVERRIDE &&
    scoreDelta >= MIN_DELTA_TO_OVERRIDE;

  return {
    strategy: shouldOverride ? selected : fallbackStrategy,
    learningApplied: shouldOverride,
    reason: shouldOverride
      ? 'learned_strategy_override'
      : selected === fallbackStrategy
        ? 'rule_strategy_still_best'
        : selectedSamples < MIN_SAMPLES_TO_OVERRIDE
          ? 'insufficient_samples_for_override'
          : 'score_delta_too_small',
    queryBucket,
    statsAvailable: true,
    sampleCount: selectedSamples,
    scoreDelta,
    scores,
  };
}

function estimateImplicitReward(resultCount: number, topScore?: number): number {
  if (resultCount <= 0) return -0.7;
  if (typeof topScore === 'number' && Number.isFinite(topScore)) {
    return clamp(topScore * 2 - 1, -1, 1);
  }
  if (resultCount >= 8) return 0.3;
  if (resultCount >= 3) return 0.15;
  return -0.1;
}

async function updateStatsRow(
  supabase: SupabaseClient,
  row: RouterLearningRow,
  updates: {
    latencyMs: number;
    resultCount: number;
    successful: boolean;
    reward: number;
  }
): Promise<void> {
  const nextTotalQueries = toNumber(row.total_queries, 0) + 1;
  const nextTotalSuccesses = toNumber(row.total_successes, 0) + (updates.successful ? 1 : 0);
  const nextTotalZeroResults = toNumber(row.total_zero_results, 0) + (updates.resultCount === 0 ? 1 : 0);
  const nextFeedbackCount = toNumber(row.total_feedback_count, 0) + 1;

  const nextAvgLatency =
    (toNumber(row.avg_latency_ms, 0) * toNumber(row.total_queries, 0) + updates.latencyMs) /
    nextTotalQueries;
  const nextAvgResultCount =
    (toNumber(row.avg_result_count, 0) * toNumber(row.total_queries, 0) + updates.resultCount) /
    nextTotalQueries;
  const nextAvgFeedback =
    (toNumber(row.avg_feedback_reward, 0) * toNumber(row.total_feedback_count, 0) + updates.reward) /
    nextFeedbackCount;

  const { error } = await supabase
    .from('memory_router_strategy_stats')
    .update({
      total_queries: nextTotalQueries,
      total_successes: nextTotalSuccesses,
      total_zero_results: nextTotalZeroResults,
      avg_latency_ms: round4(nextAvgLatency),
      avg_result_count: round4(nextAvgResultCount),
      total_feedback_count: nextFeedbackCount,
      avg_feedback_reward: round4(nextAvgFeedback),
      last_used_at: new Date().toISOString(),
    })
    .eq('id', row.id);

  if (error) throw error;
}

export async function recordRouterOutcome(
  supabase: SupabaseClient,
  input: RouterOutcomeInput
): Promise<void> {
  const queryBucket = classifyQueryBucket(input.query);
  const successful = input.resultCount > 0;
  const reward = estimateImplicitReward(input.resultCount, input.topScore);

  const { data, error } = await supabase
    .from('memory_router_strategy_stats')
    .select('*')
    .eq('user_id', input.userId)
    .eq('namespace', input.namespace)
    .eq('query_bucket', queryBucket)
    .eq('strategy', input.strategy)
    .maybeSingle();

  if (error) {
    if (isMissingRouterStatsError(error)) return;
    throw error;
  }

  if (!data) {
    const insertPayload = {
      user_id: input.userId,
      namespace: input.namespace,
      query_bucket: queryBucket,
      strategy: input.strategy,
      total_queries: 1,
      total_successes: successful ? 1 : 0,
      total_zero_results: input.resultCount === 0 ? 1 : 0,
      avg_latency_ms: round4(Math.max(0, input.latencyMs)),
      avg_result_count: round4(Math.max(0, input.resultCount)),
      total_feedback_count: 1,
      avg_feedback_reward: round4(reward),
      last_used_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase
      .from('memory_router_strategy_stats')
      .insert(insertPayload);

    if (insertError && !isMissingRouterStatsError(insertError)) {
      if (insertError.code === '23505') {
        // Concurrent insert race: retry through update path on next call.
        return;
      }
      throw insertError;
    }
    return;
  }

  await updateStatsRow(supabase, data as RouterLearningRow, {
    latencyMs: Math.max(0, input.latencyMs),
    resultCount: Math.max(0, input.resultCount),
    successful,
    reward,
  });
}

export async function recordRouterFeedbackReward(
  supabase: SupabaseClient,
  input: RouterFeedbackInput
): Promise<void> {
  const queryBucket = classifyQueryBucket(input.query);
  const normalizedReward = clamp(input.reward, -1, 1);

  const { data, error } = await supabase
    .from('memory_router_strategy_stats')
    .select('id, total_feedback_count, avg_feedback_reward')
    .eq('user_id', input.userId)
    .eq('namespace', input.namespace)
    .eq('query_bucket', queryBucket)
    .eq('strategy', input.strategy)
    .maybeSingle();

  if (error) {
    if (isMissingRouterStatsError(error)) return;
    throw error;
  }

  if (!data) return;

  const currentCount = toNumber((data as RouterLearningRow).total_feedback_count, 0);
  const nextCount = currentCount + 1;
  const nextAvg =
    (toNumber((data as RouterLearningRow).avg_feedback_reward, 0) * currentCount + normalizedReward) /
    nextCount;

  const { error: updateError } = await supabase
    .from('memory_router_strategy_stats')
    .update({
      total_feedback_count: nextCount,
      avg_feedback_reward: round4(nextAvg),
      last_used_at: new Date().toISOString(),
    })
    .eq('id', (data as RouterLearningRow).id);

  if (updateError && !isMissingRouterStatsError(updateError)) {
    throw updateError;
  }
}
