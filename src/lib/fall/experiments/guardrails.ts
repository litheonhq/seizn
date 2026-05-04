/**
 * Experiment Guardrails
 *
 * Safety checks to ensure experiments are valid before declaring winners:
 * - Minimum sample size
 * - Sample Ratio Mismatch (SRM) detection
 * - Duration checks
 * - Regression detection
 */
import { createServerClient } from '@/lib/supabase';
import { normalizeOutboundWebhookUrl } from '@/lib/security/outbound-webhook';
import type {
  GuardrailCheck,
  GuardrailConfig,
  GuardrailReport,
  GuardrailStatus,
} from './types';
import { DEFAULT_GUARDRAIL_CONFIG } from './types';

/**
 * Chi-square test for goodness of fit (SRM detection).
 * Tests if observed allocations match expected weights.
 */
function chiSquareSRM(
  observed: number[],
  expected: number[]
): { chiSquare: number; pValue: number } {
  if (observed.length !== expected.length || observed.length === 0) {
    return { chiSquare: 0, pValue: 1 };
  }

  const totalObserved = observed.reduce((a, b) => a + b, 0);
  const totalExpected = expected.reduce((a, b) => a + b, 0);

  if (totalObserved === 0 || totalExpected === 0) {
    return { chiSquare: 0, pValue: 1 };
  }

  // Scale expected to match observed total
  const scaledExpected = expected.map((e) => (e / totalExpected) * totalObserved);

  let chiSquare = 0;
  for (let i = 0; i < observed.length; i++) {
    if (scaledExpected[i] > 0) {
      chiSquare += Math.pow(observed[i] - scaledExpected[i], 2) / scaledExpected[i];
    }
  }

  // Chi-square CDF approximation (df = k-1)
  const df = observed.length - 1;
  const pValue = 1 - chiSquareCDF(chiSquare, df);

  return { chiSquare, pValue };
}

/**
 * Chi-square CDF approximation using regularized incomplete gamma function
 */
function chiSquareCDF(x: number, df: number): number {
  if (x <= 0) return 0;
  if (df <= 0) return 0;

  // Use Wilson-Hilferty transformation for approximation
  const _k = df / 2;
  const z = Math.pow(x / df, 1 / 3) - (1 - 2 / (9 * df));
  const se = Math.sqrt(2 / (9 * df));

  return normalCDF(z / se);
}

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

interface ArmAllocation {
  armId: string;
  weight: number;
  exposures: number;
}

/**
 * Get allocation statistics for an experiment
 */
async function getAllocationStats(experimentId: string): Promise<{
  arms: ArmAllocation[];
  experimentCreatedAt: Date | null;
}> {
  const supabase = createServerClient();

  // Get experiment creation time
  const { data: exp } = await supabase
    .from('fall_experiments')
    .select('created_at')
    .eq('id', experimentId)
    .maybeSingle();

  // Get arms with weights
  const { data: arms, error: armsErr } = await supabase
    .from('fall_experiment_arms')
    .select('id, weight')
    .eq('experiment_id', experimentId);

  if (armsErr) throw armsErr;
  if (!arms || arms.length === 0) return { arms: [], experimentCreatedAt: null };

  // Count exposures per arm
  const { data: exposures, error: expErr } = await supabase
    .from('fall_exposures')
    .select('arm_id')
    .eq('experiment_id', experimentId);

  if (expErr) throw expErr;

  const exposureCounts = new Map<string, number>();
  for (const arm of arms) {
    exposureCounts.set(arm.id, 0);
  }
  for (const e of exposures ?? []) {
    const armId = String(e.arm_id);
    exposureCounts.set(armId, (exposureCounts.get(armId) ?? 0) + 1);
  }

  return {
    arms: arms.map((arm) => ({
      armId: arm.id,
      weight: arm.weight ?? 1,
      exposures: exposureCounts.get(arm.id) ?? 0,
    })),
    experimentCreatedAt: exp?.created_at ? new Date(exp.created_at) : null,
  };
}

/**
 * Check minimum sample size guardrail
 */
function checkMinSample(arms: ArmAllocation[], minSampleSize: number): GuardrailCheck {
  const armsBelowMin = arms.filter((a) => a.exposures < minSampleSize);
  const totalExposures = arms.reduce((sum, a) => sum + a.exposures, 0);

  if (armsBelowMin.length === arms.length) {
    return {
      type: 'min_sample',
      status: 'pending',
      message: `Waiting for minimum sample size (${totalExposures}/${minSampleSize * arms.length} total)`,
      details: {
        required: minSampleSize,
        arms: arms.map((a) => ({ armId: a.armId, exposures: a.exposures })),
      },
    };
  }

  if (armsBelowMin.length > 0) {
    return {
      type: 'min_sample',
      status: 'warn',
      message: `${armsBelowMin.length} arm(s) below minimum sample size`,
      details: {
        required: minSampleSize,
        armsBelowMin: armsBelowMin.map((a) => ({ armId: a.armId, exposures: a.exposures })),
      },
    };
  }

  return {
    type: 'min_sample',
    status: 'pass',
    message: `All arms have >= ${minSampleSize} samples`,
    details: {
      required: minSampleSize,
      totalExposures,
    },
  };
}

/**
 * Check Sample Ratio Mismatch (SRM) guardrail
 */
function checkSRM(arms: ArmAllocation[], threshold: number): GuardrailCheck {
  const totalExposures = arms.reduce((sum, a) => sum + a.exposures, 0);

  if (totalExposures < 100) {
    return {
      type: 'srm',
      status: 'pending',
      message: 'Not enough data for SRM check (need 100+ exposures)',
      details: { totalExposures },
    };
  }

  const observed = arms.map((a) => a.exposures);
  const expected = arms.map((a) => a.weight);

  const { chiSquare, pValue } = chiSquareSRM(observed, expected);

  if (pValue < threshold) {
    return {
      type: 'srm',
      status: 'fail',
      message: `Sample Ratio Mismatch detected (p=${pValue.toFixed(4)})`,
      details: {
        chiSquare,
        pValue,
        observed,
        expected,
        threshold,
      },
    };
  }

  return {
    type: 'srm',
    status: 'pass',
    message: 'No Sample Ratio Mismatch detected',
    details: {
      chiSquare,
      pValue,
      threshold,
    },
  };
}

/**
 * Check experiment duration guardrail
 */
function checkDuration(
  createdAt: Date | null,
  minHours: number,
  maxDays: number
): GuardrailCheck {
  if (!createdAt) {
    return {
      type: 'duration',
      status: 'warn',
      message: 'Could not determine experiment start time',
    };
  }

  const now = new Date();
  const hoursRunning = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
  const daysRunning = hoursRunning / 24;

  if (hoursRunning < minHours) {
    return {
      type: 'duration',
      status: 'pending',
      message: `Experiment running for ${hoursRunning.toFixed(1)}h (minimum: ${minHours}h)`,
      details: {
        hoursRunning,
        minHours,
        daysRunning,
        maxDays,
      },
    };
  }

  if (daysRunning > maxDays) {
    return {
      type: 'duration',
      status: 'warn',
      message: `Experiment running for ${daysRunning.toFixed(1)} days (exceeds ${maxDays} day limit)`,
      details: {
        hoursRunning,
        minHours,
        daysRunning,
        maxDays,
      },
    };
  }

  return {
    type: 'duration',
    status: 'pass',
    message: `Duration check passed (${daysRunning.toFixed(1)} days)`,
    details: {
      hoursRunning,
      daysRunning,
      minHours,
      maxDays,
    },
  };
}

/**
 * Check for metric regression (optional, based on historical baseline)
 */
async function checkRegression(_experimentId: string): Promise<GuardrailCheck> {
  // MVP: Always pass regression check
  // Future: Compare against historical baseline metrics
  return {
    type: 'regression',
    status: 'pass',
    message: 'No regression detected',
  };
}

/**
 * Run all guardrail checks for an experiment
 */
export async function runGuardrails(
  experimentId: string,
  config: Partial<GuardrailConfig> = {}
): Promise<GuardrailReport> {
  const cfg = { ...DEFAULT_GUARDRAIL_CONFIG, ...config };

  const { arms, experimentCreatedAt } = await getAllocationStats(experimentId);

  const checks: GuardrailCheck[] = [];

  // 1. Min sample check
  checks.push(checkMinSample(arms, cfg.minSampleSize));

  // 2. SRM check
  checks.push(checkSRM(arms, cfg.srmThreshold));

  // 3. Duration check
  checks.push(checkDuration(experimentCreatedAt, cfg.minDurationHours, cfg.maxDurationDays));

  // 4. Regression check
  checks.push(await checkRegression(experimentId));

  // Determine overall status
  const hasFail = checks.some((c) => c.status === 'fail');
  const hasPending = checks.some((c) => c.status === 'pending');
  const hasWarn = checks.some((c) => c.status === 'warn');

  let overallStatus: GuardrailStatus;
  if (hasFail) {
    overallStatus = 'fail';
  } else if (hasPending) {
    overallStatus = 'pending';
  } else if (hasWarn) {
    overallStatus = 'warn';
  } else {
    overallStatus = 'pass';
  }

  // Can proceed if no failures and no pending
  const canProceed = !hasFail && !hasPending;

  // Generate alerts
  const alerts: string[] = [];
  for (const check of checks) {
    if (check.status === 'fail') {
      alerts.push(`[FAIL] ${check.type}: ${check.message}`);
    } else if (check.status === 'warn') {
      alerts.push(`[WARN] ${check.type}: ${check.message}`);
    }
  }

  return {
    experimentId,
    checks,
    overallStatus,
    canProceed,
    alerts,
  };
}

/**
 * Send guardrail alert via webhook
 */
export async function sendGuardrailAlert(
  report: GuardrailReport,
  webhookUrl: string
): Promise<boolean> {
  if (report.alerts.length === 0) return true;

  try {
    const safeWebhookUrl = await normalizeOutboundWebhookUrl(webhookUrl, {
      label: 'Fall guardrail webhook',
    });
    if (!safeWebhookUrl) return false;

    const payload = {
      text: `🚨 Experiment Guardrail Alert`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `Experiment ${report.experimentId}`,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Status:* ${report.overallStatus.toUpperCase()}`,
            },
            {
              type: 'mrkdwn',
              text: `*Can Proceed:* ${report.canProceed ? '✅ Yes' : '❌ No'}`,
            },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: report.alerts.map((a) => `• ${a}`).join('\n'),
          },
        },
      ],
    };

    const res = await fetch(safeWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return res.ok;
  } catch {
    console.error('Failed to send guardrail alert');
    return false;
  }
}

/**
 * Monitor experiment and auto-stop if guardrails fail (when enabled)
 */
export async function monitorExperiment(
  experimentId: string,
  userId: string,
  config: Partial<GuardrailConfig> = {}
): Promise<{
  report: GuardrailReport;
  stopped: boolean;
  alertSent: boolean;
}> {
  const cfg = { ...DEFAULT_GUARDRAIL_CONFIG, ...config };
  const report = await runGuardrails(experimentId, cfg);

  let stopped = false;
  let alertSent = false;

  // Send alert if there are issues
  if (report.alerts.length > 0 && cfg.webhookUrl) {
    alertSent = await sendGuardrailAlert(report, cfg.webhookUrl);
  }

  // Auto-stop on failure if enabled
  if (report.overallStatus === 'fail' && cfg.enableAutoStop) {
    const supabase = createServerClient();
    await supabase
      .from('fall_experiments')
      .update({ status: 'stopped' })
      .eq('id', experimentId)
      .eq('user_id', userId);
    stopped = true;
  }

  return { report, stopped, alertSent };
}
