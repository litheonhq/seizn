import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { runGuardrails, monitorExperiment } from '@/lib/fall/experiments';
import type { GuardrailConfig } from '@/lib/fall/experiments';

/**
 * GET /api/fall/experiments/[id]/guardrails
 *
 * Run guardrail checks for an experiment.
 *
 * Query params:
 * - min_sample?: number (default: 100)
 * - min_duration_hours?: number (default: 24)
 * - max_duration_days?: number (default: 30)
 * - srm_threshold?: number (default: 0.01)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { id: experimentId } = await params;
    const url = new URL(request.url);

    const config: Partial<GuardrailConfig> = {
      minSampleSize: parseInt(url.searchParams.get('min_sample') ?? '100'),
      minDurationHours: parseInt(url.searchParams.get('min_duration_hours') ?? '24'),
      maxDurationDays: parseInt(url.searchParams.get('max_duration_days') ?? '30'),
      srmThreshold: parseFloat(url.searchParams.get('srm_threshold') ?? '0.01'),
    };

    const report = await runGuardrails(experimentId, config);

    return NextResponse.json({
      success: true,
      experiment_id: experimentId,
      overall_status: report.overallStatus,
      can_proceed: report.canProceed,
      checks: report.checks.map((check) => ({
        type: check.type,
        status: check.status,
        message: check.message,
        details: check.details,
      })),
      alerts: report.alerts,
    });
  } catch (err) {
    console.error('Guardrails check error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/fall/experiments/[id]/guardrails
 *
 * Monitor experiment and optionally auto-stop on failure.
 *
 * Body:
 * {
 *   "enable_auto_stop"?: boolean,
 *   "webhook_url"?: string,
 *   "config"?: Partial<GuardrailConfig>
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { id: experimentId } = await params;
    const body = await request.json().catch(() => ({}));

    const config: Partial<GuardrailConfig> = {
      ...body.config,
      enableAutoStop: body.enable_auto_stop ?? false,
      webhookUrl: body.webhook_url,
    };

    const { report, stopped, alertSent } = await monitorExperiment(
      experimentId,
      userId,
      config
    );

    return NextResponse.json({
      success: true,
      experiment_id: experimentId,
      overall_status: report.overallStatus,
      can_proceed: report.canProceed,
      checks: report.checks.map((check) => ({
        type: check.type,
        status: check.status,
        message: check.message,
        details: check.details,
      })),
      alerts: report.alerts,
      experiment_stopped: stopped,
      alert_sent: alertSent,
    });
  } catch (err) {
    console.error('Guardrails monitor error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
