/**
 * Eval -> Policy Closed Loop
 *
 * Connects automatic evaluation runs to network-learning policy updates.
 * Flow:
 * 1) Evaluate health gate from eval summary
 * 2) Generate policy recommendations from aggregated insights
 * 3) Create deduplicated policy updates
 * 4) Optionally auto-approve and auto-apply safe recommendations
 */

import type { EvalRun, EvalRunSummary } from '@/lib/eval/types';
import type { AggregationPeriod, PolicyUpdate } from '../types';
import {
  approvePolicyUpdate,
  applyPolicyUpdate,
  createPolicyUpdate,
  generatePolicyRecommendations,
  getPolicyUpdates,
  type PolicyRecommendation,
} from './policy-updater';

export interface EvalPolicyClosedLoopConfig {
  enabled: boolean;
  period: AggregationPeriod;
  maxRecommendationsPerRun: number;
  minCreateConfidence: number;
  minApproveConfidence: number;
  minAutoApplyConfidence: number;
  autoApprove: boolean;
  autoApply: boolean;
  requirePassingEvalForGeneration: boolean;
  requirePassingEvalForAutoApply: boolean;
}

export interface EvalPolicyClosedLoopResult {
  skipped: boolean;
  skipReason?: string;
  generatedRecommendations: number;
  consideredRecommendations: number;
  createdUpdates: number;
  duplicateUpdates: number;
  approvedUpdates: number;
  appliedUpdates: number;
  failures: Array<{ targetPolicy: string; error: string }>;
  updates: PolicyUpdate[];
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseNumberEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePeriodEnv(value: string | undefined, fallback: AggregationPeriod): AggregationPeriod {
  if (!value) return fallback;
  if (value === 'daily' || value === 'weekly' || value === 'monthly') {
    return value;
  }
  return fallback;
}

function getDefaultConfig(): EvalPolicyClosedLoopConfig {
  return {
    enabled: parseBooleanEnv(process.env.NETWORK_LEARNING_CLOSED_LOOP_ENABLED, true),
    period: parsePeriodEnv(process.env.NETWORK_LEARNING_CLOSED_LOOP_PERIOD, 'weekly'),
    maxRecommendationsPerRun: Math.max(
      1,
      Math.floor(parseNumberEnv(process.env.NETWORK_LEARNING_CLOSED_LOOP_MAX_RECS, 5))
    ),
    minCreateConfidence: parseNumberEnv(process.env.NETWORK_LEARNING_CLOSED_LOOP_MIN_CREATE_CONF, 0.8),
    minApproveConfidence: parseNumberEnv(process.env.NETWORK_LEARNING_CLOSED_LOOP_MIN_APPROVE_CONF, 0.85),
    minAutoApplyConfidence: parseNumberEnv(process.env.NETWORK_LEARNING_CLOSED_LOOP_MIN_AUTO_APPLY_CONF, 0.9),
    autoApprove: parseBooleanEnv(process.env.NETWORK_LEARNING_CLOSED_LOOP_AUTO_APPROVE, true),
    autoApply: parseBooleanEnv(process.env.NETWORK_LEARNING_CLOSED_LOOP_AUTO_APPLY, false),
    requirePassingEvalForGeneration: parseBooleanEnv(
      process.env.NETWORK_LEARNING_CLOSED_LOOP_REQUIRE_PASS_FOR_GENERATE,
      false
    ),
    requirePassingEvalForAutoApply: parseBooleanEnv(
      process.env.NETWORK_LEARNING_CLOSED_LOOP_REQUIRE_PASS_FOR_APPLY,
      true
    ),
  };
}

function isEvalRunPassing(summary: EvalRunSummary | undefined): boolean {
  if (!summary) return false;
  if (summary.criticalIssues > 0) return false;
  if (summary.highIssues > 0) return false;
  if (summary.failed > 0) return false;
  if (summary.errors > 0) return false;
  return true;
}

function normalizeForComparison(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForComparison(item));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normalizeForComparison((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(normalizeForComparison(value));
}

function isDuplicateUpdate(
  existing: PolicyUpdate[],
  recommendation: PolicyRecommendation
): boolean {
  const target = recommendation.targetPolicy;
  const changes = stableSerialize(recommendation.changes);
  return existing.some(
    (update) =>
      update.targetPolicy === target &&
      stableSerialize(update.changes) === changes &&
      update.status !== 'rejected'
  );
}

export async function runEvalPolicyClosedLoop(
  evalRun: EvalRun,
  overrides: Partial<EvalPolicyClosedLoopConfig> = {}
): Promise<EvalPolicyClosedLoopResult> {
  const config: EvalPolicyClosedLoopConfig = {
    ...getDefaultConfig(),
    ...overrides,
  };

  const emptyResult: EvalPolicyClosedLoopResult = {
    skipped: false,
    generatedRecommendations: 0,
    consideredRecommendations: 0,
    createdUpdates: 0,
    duplicateUpdates: 0,
    approvedUpdates: 0,
    appliedUpdates: 0,
    failures: [],
    updates: [],
  };

  if (!config.enabled) {
    return {
      ...emptyResult,
      skipped: true,
      skipReason: 'closed_loop_disabled',
    };
  }

  const evalPassing = isEvalRunPassing(evalRun.summary);
  if (config.requirePassingEvalForGeneration && !evalPassing) {
    return {
      ...emptyResult,
      skipped: true,
      skipReason: 'eval_not_passing',
    };
  }

  const recommendations = await generatePolicyRecommendations(config.period);
  const filteredRecommendations = recommendations
    .filter((rec) => rec.confidence >= config.minCreateConfidence)
    .slice(0, config.maxRecommendationsPerRun);

  const [pending, approved, applied] = await Promise.all([
    getPolicyUpdates({ status: 'pending', limit: 100 }),
    getPolicyUpdates({ status: 'approved', limit: 100 }),
    getPolicyUpdates({ status: 'applied', limit: 100 }),
  ]);

  const dedupPool: PolicyUpdate[] = [...pending, ...approved, ...applied];
  const createdUpdates: PolicyUpdate[] = [];

  let duplicateUpdates = 0;
  let approvedUpdates = 0;
  let appliedUpdates = 0;
  const failures: Array<{ targetPolicy: string; error: string }> = [];

  for (const recommendation of filteredRecommendations) {
    if (isDuplicateUpdate(dedupPool, recommendation)) {
      duplicateUpdates++;
      continue;
    }

    try {
      let current = await createPolicyUpdate(recommendation);
      dedupPool.push(current);
      createdUpdates.push(current);

      const shouldApprove =
        config.autoApprove &&
        recommendation.confidence >= config.minApproveConfidence;

      if (shouldApprove) {
        current = await approvePolicyUpdate(current.id);
        approvedUpdates++;
      }

      const shouldApply =
        config.autoApply &&
        recommendation.confidence >= config.minAutoApplyConfidence &&
        (!config.requirePassingEvalForAutoApply || evalPassing);

      if (shouldApply) {
        // Ensure update is approved before applying.
        if (current.status !== 'approved') {
          current = await approvePolicyUpdate(current.id);
          approvedUpdates++;
        }
        const appliedResult = await applyPolicyUpdate(current.id);
        current = appliedResult.update;
        if (appliedResult.applied) {
          appliedUpdates++;
        }
      }
    } catch (error) {
      failures.push({
        targetPolicy: recommendation.targetPolicy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return {
    skipped: false,
    generatedRecommendations: recommendations.length,
    consideredRecommendations: filteredRecommendations.length,
    createdUpdates: createdUpdates.length,
    duplicateUpdates,
    approvedUpdates,
    appliedUpdates,
    failures,
    updates: createdUpdates,
  };
}
