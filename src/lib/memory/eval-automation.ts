import { createServerClient } from '@/lib/supabase';

interface MemoryFeedbackSignalRow {
  reward: number | null;
  namespace: string | null;
}

interface RouterStatsSignalRow {
  namespace: string | null;
  total_queries: number | null;
  total_zero_results: number | null;
}

export interface MemoryQualitySignalSummary {
  lookbackHours: number;
  feedbackCount: number;
  negativeFeedbackCount: number;
  negativeFeedbackRatio: number;
  routerQueryCount: number;
  routerZeroResultCount: number;
  routerZeroResultRatio: number;
}

export interface ScheduledMemoryEvalReport {
  enabled: boolean;
  skipped: boolean;
  reason?: string;
  triggerCreated: boolean;
  triggerId?: string;
  summary: MemoryQualitySignalSummary;
  reasons: string[];
}

const DEFAULT_LOOKBACK_HOURS = 6;
const DEFAULT_COOLDOWN_HOURS = 6;
const DEFAULT_MIN_FEEDBACK_EVENTS = 20;
const DEFAULT_NEGATIVE_RATIO_THRESHOLD = 0.35;
const DEFAULT_MIN_ROUTER_SAMPLES = 30;
const DEFAULT_ZERO_RESULT_RATIO_THRESHOLD = 0.4;

function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function isMissingTableError(
  error: { code?: string | null; message?: string | null } | null | undefined,
  tableName: string
): boolean {
  if (!error) return false;
  const code = error.code || '';
  const message = (error.message || '').toLowerCase();
  return code === '42P01' || message.includes(tableName.toLowerCase());
}

export function assessMemoryQualitySignals(params: {
  feedbackRows: MemoryFeedbackSignalRow[];
  routerRows: RouterStatsSignalRow[];
  minFeedbackEvents: number;
  negativeRatioThreshold: number;
  minRouterSamples: number;
  zeroResultRatioThreshold: number;
  lookbackHours: number;
}): { summary: MemoryQualitySignalSummary; reasons: string[] } {
  const feedbackCount = params.feedbackRows.length;
  const negativeFeedbackCount = params.feedbackRows.filter((row) => (row.reward ?? 0) < 0).length;
  const negativeFeedbackRatio =
    feedbackCount > 0 ? negativeFeedbackCount / feedbackCount : 0;

  const routerQueryCount = params.routerRows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.total_queries || 0)),
    0
  );
  const routerZeroResultCount = params.routerRows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.total_zero_results || 0)),
    0
  );
  const routerZeroResultRatio =
    routerQueryCount > 0 ? routerZeroResultCount / routerQueryCount : 0;

  const reasons: string[] = [];
  if (
    feedbackCount >= params.minFeedbackEvents &&
    negativeFeedbackRatio >= params.negativeRatioThreshold
  ) {
    reasons.push('negative_feedback_ratio');
  }

  if (
    routerQueryCount >= params.minRouterSamples &&
    routerZeroResultRatio >= params.zeroResultRatioThreshold
  ) {
    reasons.push('router_zero_result_ratio');
  }

  return {
    summary: {
      lookbackHours: params.lookbackHours,
      feedbackCount,
      negativeFeedbackCount,
      negativeFeedbackRatio: round4(negativeFeedbackRatio),
      routerQueryCount,
      routerZeroResultCount,
      routerZeroResultRatio: round4(routerZeroResultRatio),
    },
    reasons,
  };
}

export async function runScheduledMemoryQualityEvalCheck(): Promise<ScheduledMemoryEvalReport> {
  const enabled = process.env.MEMORY_AUTO_EVAL_ENABLED !== 'false';
  const lookbackHours = Math.max(1, Math.floor(toNumber(process.env.MEMORY_AUTO_EVAL_LOOKBACK_HOURS, DEFAULT_LOOKBACK_HOURS)));
  const cooldownHours = Math.max(1, Math.floor(toNumber(process.env.MEMORY_AUTO_EVAL_COOLDOWN_HOURS, DEFAULT_COOLDOWN_HOURS)));
  const minFeedbackEvents = Math.max(1, Math.floor(toNumber(process.env.MEMORY_AUTO_EVAL_MIN_FEEDBACK_EVENTS, DEFAULT_MIN_FEEDBACK_EVENTS)));
  const negativeRatioThreshold = clamp(toNumber(process.env.MEMORY_AUTO_EVAL_NEGATIVE_RATIO_THRESHOLD, DEFAULT_NEGATIVE_RATIO_THRESHOLD), 0.1, 0.95);
  const minRouterSamples = Math.max(1, Math.floor(toNumber(process.env.MEMORY_AUTO_EVAL_MIN_ROUTER_SAMPLES, DEFAULT_MIN_ROUTER_SAMPLES)));
  const zeroResultRatioThreshold = clamp(toNumber(process.env.MEMORY_AUTO_EVAL_ZERO_RESULT_RATIO_THRESHOLD, DEFAULT_ZERO_RESULT_RATIO_THRESHOLD), 0.1, 0.95);

  const emptySummary: MemoryQualitySignalSummary = {
    lookbackHours,
    feedbackCount: 0,
    negativeFeedbackCount: 0,
    negativeFeedbackRatio: 0,
    routerQueryCount: 0,
    routerZeroResultCount: 0,
    routerZeroResultRatio: 0,
  };

  if (!enabled) {
    return {
      enabled: false,
      skipped: true,
      reason: 'disabled',
      triggerCreated: false,
      summary: emptySummary,
      reasons: [],
    };
  }

  const supabase = createServerClient();
  const lookbackSinceIso = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  const [feedbackResult, routerResult] = await Promise.all([
    supabase
      .from('memory_feedback_events')
      .select('reward, namespace')
      .gte('created_at', lookbackSinceIso)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('memory_router_strategy_stats')
      .select('namespace, total_queries, total_zero_results')
      .gte('updated_at', lookbackSinceIso)
      .limit(500),
  ]);

  if (feedbackResult.error && isMissingTableError(feedbackResult.error, 'memory_feedback_events')) {
    return {
      enabled: true,
      skipped: true,
      reason: 'schema_missing_feedback',
      triggerCreated: false,
      summary: emptySummary,
      reasons: [],
    };
  }
  if (routerResult.error && isMissingTableError(routerResult.error, 'memory_router_strategy_stats')) {
    return {
      enabled: true,
      skipped: true,
      reason: 'schema_missing_router_stats',
      triggerCreated: false,
      summary: emptySummary,
      reasons: [],
    };
  }
  if (feedbackResult.error) throw feedbackResult.error;
  if (routerResult.error) throw routerResult.error;

  const assessed = assessMemoryQualitySignals({
    feedbackRows: (feedbackResult.data || []) as MemoryFeedbackSignalRow[],
    routerRows: (routerResult.data || []) as RouterStatsSignalRow[],
    minFeedbackEvents,
    negativeRatioThreshold,
    minRouterSamples,
    zeroResultRatioThreshold,
    lookbackHours,
  });

  if (assessed.reasons.length === 0) {
    return {
      enabled: true,
      skipped: true,
      reason: 'no_degradation_signal',
      triggerCreated: false,
      summary: assessed.summary,
      reasons: [],
    };
  }

  const cooldownSinceIso = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString();
  const recentTriggerResult = await supabase
    .from('auto_eval_triggers')
    .select('id, metadata, created_at')
    .eq('type', 'model_config_changed')
    .eq('source', 'model_config')
    .gte('created_at', cooldownSinceIso)
    .order('created_at', { ascending: false })
    .limit(20);

  if (recentTriggerResult.error && !isMissingTableError(recentTriggerResult.error, 'auto_eval_triggers')) {
    throw recentTriggerResult.error;
  }

  const hasRecentMemoryQualityTrigger = (recentTriggerResult.data || []).some((row) => {
    if (!row || typeof row !== 'object') return false;
    const metadata = (row as { metadata?: unknown }).metadata;
    if (!metadata || typeof metadata !== 'object') return false;
    return (metadata as Record<string, unknown>).subtype === 'memory_quality_auto';
  });

  if (hasRecentMemoryQualityTrigger) {
    return {
      enabled: true,
      skipped: true,
      reason: 'cooldown_active',
      triggerCreated: false,
      summary: assessed.summary,
      reasons: assessed.reasons,
    };
  }

  const insertResult = await supabase
    .from('auto_eval_triggers')
    .insert({
      type: 'model_config_changed',
      source: 'model_config',
      organization_id: null,
      user_id: null,
      metadata: {
        subtype: 'memory_quality_auto',
        reasons: assessed.reasons,
        summary: assessed.summary,
        emittedAt: new Date().toISOString(),
      },
      processed: false,
    })
    .select('id')
    .single();

  if (insertResult.error) {
    if (isMissingTableError(insertResult.error, 'auto_eval_triggers')) {
      return {
        enabled: true,
        skipped: true,
        reason: 'schema_missing_auto_eval_triggers',
        triggerCreated: false,
        summary: assessed.summary,
        reasons: assessed.reasons,
      };
    }
    throw insertResult.error;
  }

  return {
    enabled: true,
    skipped: false,
    triggerCreated: true,
    triggerId: insertResult.data?.id,
    summary: assessed.summary,
    reasons: assessed.reasons,
  };
}
