/**
 * Winner Detection & Gradual Rollout
 *
 * Provides statistical winner detection and safe gradual rollout.
 */
import { createServerClient } from '@/lib/supabase';
import type {
  WinnerAnalysis,
  WinnerCandidate,
  RolloutResult,
  RolloutStage,
  GuardrailConfig,
} from './types';
import { DEFAULT_GUARDRAIL_CONFIG } from './types';
import { runGuardrails } from './guardrails';

/**
 * Z-test for two proportions (one-tailed).
 * Returns p-value for H1: p1 > p2
 */
function twoProportionZTest(
  successes1: number,
  trials1: number,
  successes2: number,
  trials2: number
): { zScore: number; pValue: number } {
  if (trials1 === 0 || trials2 === 0) {
    return { zScore: 0, pValue: 1 };
  }

  const p1 = successes1 / trials1;
  const p2 = successes2 / trials2;
  const pPooled = (successes1 + successes2) / (trials1 + trials2);

  if (pPooled === 0 || pPooled === 1) {
    return { zScore: 0, pValue: 1 };
  }

  const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / trials1 + 1 / trials2));
  if (se === 0) {
    return { zScore: 0, pValue: 1 };
  }

  const z = (p1 - p2) / se;

  // Standard normal CDF approximation
  const pValue = 1 - normalCDF(z);

  return { zScore: z, pValue };
}

/**
 * Standard normal CDF approximation (Abramowitz and Stegun)
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);

  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

  return 0.5 * (1.0 + sign * y);
}

interface ArmOutcomeStats {
  armId: string;
  armName: string;
  successes: number;
  trials: number;
  successRate: number;
}

/**
 * Fetch outcome statistics for all arms in an experiment
 */
async function getArmStats(experimentId: string): Promise<ArmOutcomeStats[]> {
  const supabase = createServerClient();

  const { data: arms, error: armsErr } = await supabase
    .from('fall_experiment_arms')
    .select('id, name')
    .eq('experiment_id', experimentId);

  if (armsErr) throw armsErr;
  if (!arms || arms.length === 0) return [];

  const { data: outcomes, error: outErr } = await supabase
    .from('fall_outcomes')
    .select('arm_id, event_type, value')
    .eq('experiment_id', experimentId);

  if (outErr) throw outErr;

  const statsMap = new Map<string, { successes: number; trials: number }>();
  for (const arm of arms) {
    statsMap.set(arm.id, { successes: 0, trials: 0 });
  }

  for (const o of outcomes ?? []) {
    const armId = String(o.arm_id);
    const rec = statsMap.get(armId);
    if (!rec) continue;

    rec.trials += 1;
    const eventType = String(o.event_type ?? '');
    const value = Number(o.value ?? 1);
    const isSuccess =
      ['accept', 'thumb_up'].includes(eventType) || (eventType === 'click' && value > 0);
    if (isSuccess) rec.successes += 1;
  }

  return arms.map((arm) => {
    const stats = statsMap.get(arm.id)!;
    return {
      armId: arm.id,
      armName: arm.name,
      successes: stats.successes,
      trials: stats.trials,
      successRate: stats.trials > 0 ? stats.successes / stats.trials : 0,
    };
  });
}

/**
 * Analyze experiment to detect if there's a statistical winner.
 * Control is assumed to be the first arm (or arm named "control").
 */
export async function analyzeWinner(
  experimentId: string,
  config: Partial<GuardrailConfig> = {}
): Promise<WinnerAnalysis> {
  const cfg = { ...DEFAULT_GUARDRAIL_CONFIG, ...config };
  const stats = await getArmStats(experimentId);

  if (stats.length < 2) {
    return {
      experimentId,
      hasWinner: false,
      winner: null,
      control: null,
      allCandidates: [],
      canDeclareWinner: false,
      blockers: ['Need at least 2 arms for comparison'],
      recommendation: 'stop',
    };
  }

  // Identify control (first arm or named "control")
  const controlStats =
    stats.find((s) => s.armName.toLowerCase() === 'control') ?? stats[0];
  const treatmentStats = stats.filter((s) => s.armId !== controlStats.armId);

  // Run guardrails first
  const guardrailReport = await runGuardrails(experimentId, cfg);
  const blockers = guardrailReport.alerts;

  // Build candidates with uplift and p-values
  const controlCandidate: WinnerCandidate = {
    armId: controlStats.armId,
    armName: controlStats.armName,
    successRate: controlStats.successRate,
    trials: controlStats.trials,
    uplift: 0,
    confidence: 0,
    pValue: 1,
  };

  const allCandidates: WinnerCandidate[] = [controlCandidate];

  for (const treatment of treatmentStats) {
    const { pValue, zScore: _zScore } = twoProportionZTest(
      treatment.successes,
      treatment.trials,
      controlStats.successes,
      controlStats.trials
    );

    const uplift =
      controlStats.successRate > 0
        ? (treatment.successRate - controlStats.successRate) / controlStats.successRate
        : treatment.successRate > 0
          ? 1
          : 0;

    allCandidates.push({
      armId: treatment.armId,
      armName: treatment.armName,
      successRate: treatment.successRate,
      trials: treatment.trials,
      uplift,
      confidence: Math.max(0, 1 - pValue),
      pValue,
    });
  }

  // Determine winner
  const significantWinners = allCandidates.filter(
    (c) =>
      c.armId !== controlStats.armId &&
      c.pValue < cfg.significanceLevel &&
      c.uplift >= cfg.minUplift
  );

  const hasWinner = significantWinners.length > 0;
  const winner = hasWinner
    ? significantWinners.sort((a, b) => b.uplift - a.uplift)[0]
    : null;

  // Can we declare winner?
  const canDeclareWinner = hasWinner && guardrailReport.canProceed;

  // Recommendation
  let recommendation: WinnerAnalysis['recommendation'] = 'wait';
  if (!guardrailReport.canProceed) {
    recommendation = guardrailReport.overallStatus === 'fail' ? 'stop' : 'wait';
  } else if (hasWinner) {
    recommendation = 'rollout';
  } else {
    // Check if we have enough samples but no winner
    const allHaveEnoughSamples = stats.every((s) => s.trials >= cfg.minSampleSize);
    if (allHaveEnoughSamples) {
      recommendation = 'inconclusive';
    }
  }

  return {
    experimentId,
    hasWinner,
    winner,
    control: controlCandidate,
    allCandidates,
    canDeclareWinner,
    blockers,
    recommendation,
  };
}

/**
 * Get the next rollout stage
 */
function getNextStage(current: RolloutStage | undefined): RolloutStage {
  switch (current) {
    case undefined:
    case 'candidate':
      return '10%';
    case '10%':
      return '50%';
    case '50%':
      return '100%';
    case '100%':
      return 'completed';
    default:
      return 'completed';
  }
}

/**
 * Calculate weights for a given rollout stage
 */
function calculateRolloutWeights(
  winnerArmId: string,
  allArmIds: string[],
  stage: RolloutStage
): Record<string, number> {
  const weights: Record<string, number> = {};
  const otherArms = allArmIds.filter((id) => id !== winnerArmId);

  let winnerWeight: number;
  switch (stage) {
    case 'candidate':
      // Equal weights
      winnerWeight = 1;
      break;
    case '10%':
      winnerWeight = 10;
      break;
    case '50%':
      winnerWeight = 50;
      break;
    case '100%':
    case 'completed':
      winnerWeight = 100;
      break;
    default:
      winnerWeight = 1;
  }

  weights[winnerArmId] = winnerWeight;

  // Distribute remaining weight among other arms
  const remainingWeight = 100 - winnerWeight;
  const perOtherArm = otherArms.length > 0 ? remainingWeight / otherArms.length : 0;

  for (const armId of otherArms) {
    weights[armId] = Math.max(0, perOtherArm);
  }

  return weights;
}

/**
 * Execute gradual rollout to the next stage.
 * Updates arm weights in the database.
 */
export async function executeRollout(params: {
  experimentId: string;
  winnerArmId: string;
  targetStage?: RolloutStage;
  userId: string;
}): Promise<RolloutResult> {
  const supabase = createServerClient();

  // Verify experiment ownership and status
  const { data: exp, error: expErr } = await supabase
    .from('fall_experiments')
    .select('id, user_id, status')
    .eq('id', params.experimentId)
    .eq('user_id', params.userId)
    .maybeSingle();

  if (expErr) throw expErr;
  if (!exp) {
    return {
      success: false,
      experimentId: params.experimentId,
      winnerArmId: params.winnerArmId,
      stage: 'candidate',
      weights: {},
      message: 'Experiment not found or not owned by user',
    };
  }

  // Get all arms
  const { data: arms, error: armsErr } = await supabase
    .from('fall_experiment_arms')
    .select('id, name, weight')
    .eq('experiment_id', params.experimentId);

  if (armsErr) throw armsErr;
  if (!arms || arms.length === 0) {
    return {
      success: false,
      experimentId: params.experimentId,
      winnerArmId: params.winnerArmId,
      stage: 'candidate',
      weights: {},
      message: 'No arms found',
    };
  }

  // Verify winner arm exists
  const winnerArm = arms.find((a) => a.id === params.winnerArmId);
  if (!winnerArm) {
    return {
      success: false,
      experimentId: params.experimentId,
      winnerArmId: params.winnerArmId,
      stage: 'candidate',
      weights: {},
      message: 'Winner arm not found',
    };
  }

  // Determine current stage from winner weight
  let currentStage: RolloutStage | undefined;
  const winnerWeight = winnerArm.weight ?? 1;
  if (winnerWeight >= 100) currentStage = '100%';
  else if (winnerWeight >= 50) currentStage = '50%';
  else if (winnerWeight >= 10) currentStage = '10%';
  else currentStage = 'candidate';

  const targetStage = params.targetStage ?? getNextStage(currentStage);

  // Calculate new weights
  const allArmIds = arms.map((a) => a.id);
  const newWeights = calculateRolloutWeights(params.winnerArmId, allArmIds, targetStage);

  // Update arm weights
  const updates = Object.entries(newWeights).map(([armId, weight]) =>
    supabase
      .from('fall_experiment_arms')
      .update({ weight })
      .eq('id', armId)
  );

  const results = await Promise.all(updates);
  const hasError = results.some((r) => r.error);

  if (hasError) {
    return {
      success: false,
      experimentId: params.experimentId,
      winnerArmId: params.winnerArmId,
      stage: targetStage,
      weights: newWeights,
      message: 'Failed to update arm weights',
    };
  }

  // If 100%, optionally stop the experiment
  if (targetStage === '100%' || targetStage === 'completed') {
    await supabase
      .from('fall_experiments')
      .update({ status: 'stopped' })
      .eq('id', params.experimentId);
  }

  // Log rollout event
  await supabase.from('fall_rollout_history').insert({
    experiment_id: params.experimentId,
    winner_arm_id: params.winnerArmId,
    stage: targetStage,
    weights: newWeights,
    executed_by: params.userId,
  });

  return {
    success: true,
    experimentId: params.experimentId,
    winnerArmId: params.winnerArmId,
    stage: targetStage,
    weights: newWeights,
    message: `Rollout to ${targetStage} completed successfully`,
  };
}

/**
 * Auto-promote winner if guardrails pass and winner is detected.
 * Useful for automated experiment management.
 */
export async function autoPromoteWinner(params: {
  experimentId: string;
  userId: string;
  config?: Partial<GuardrailConfig>;
}): Promise<{ promoted: boolean; analysis: WinnerAnalysis; rollout?: RolloutResult }> {
  const analysis = await analyzeWinner(params.experimentId, params.config);

  if (!analysis.canDeclareWinner || !analysis.winner) {
    return { promoted: false, analysis };
  }

  const rollout = await executeRollout({
    experimentId: params.experimentId,
    winnerArmId: analysis.winner.armId,
    userId: params.userId,
  });

  return {
    promoted: rollout.success,
    analysis,
    rollout,
  };
}
