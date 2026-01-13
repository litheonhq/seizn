import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { analyzeWinner, autoPromoteWinner } from '@/lib/fall/experiments';
import type { GuardrailConfig } from '@/lib/fall/experiments';

/**
 * GET /api/fall/experiments/[id]/winner
 *
 * Analyze experiment to detect statistical winner.
 *
 * Query params:
 * - min_sample?: number (default: 100)
 * - significance?: number (default: 0.05)
 * - min_uplift?: number (default: 0.05)
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
      significanceLevel: parseFloat(url.searchParams.get('significance') ?? '0.05'),
      minUplift: parseFloat(url.searchParams.get('min_uplift') ?? '0.05'),
    };

    const analysis = await analyzeWinner(experimentId, config);

    return NextResponse.json({
      success: true,
      experiment_id: experimentId,
      has_winner: analysis.hasWinner,
      can_declare_winner: analysis.canDeclareWinner,
      recommendation: analysis.recommendation,
      winner: analysis.winner
        ? {
            arm_id: analysis.winner.armId,
            arm_name: analysis.winner.armName,
            success_rate: analysis.winner.successRate,
            trials: analysis.winner.trials,
            uplift: analysis.winner.uplift,
            confidence: analysis.winner.confidence,
            p_value: analysis.winner.pValue,
          }
        : null,
      control: analysis.control
        ? {
            arm_id: analysis.control.armId,
            arm_name: analysis.control.armName,
            success_rate: analysis.control.successRate,
            trials: analysis.control.trials,
          }
        : null,
      all_arms: analysis.allCandidates.map((c) => ({
        arm_id: c.armId,
        arm_name: c.armName,
        success_rate: c.successRate,
        trials: c.trials,
        uplift: c.uplift,
        confidence: c.confidence,
        p_value: c.pValue,
      })),
      blockers: analysis.blockers,
    });
  } catch (err) {
    console.error('Winner analysis error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/fall/experiments/[id]/winner
 *
 * Auto-promote winner if guardrails pass.
 *
 * Body:
 * {
 *   "auto_rollout"?: boolean (default: true)
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

    const result = await autoPromoteWinner({
      experimentId,
      userId,
      config: body,
    });

    if (!result.promoted) {
      return NextResponse.json(
        {
          success: false,
          promoted: false,
          reason: result.analysis.canDeclareWinner
            ? 'Rollout failed'
            : 'Cannot declare winner yet',
          recommendation: result.analysis.recommendation,
          blockers: result.analysis.blockers,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      promoted: true,
      winner: result.analysis.winner
        ? {
            arm_id: result.analysis.winner.armId,
            arm_name: result.analysis.winner.armName,
            uplift: result.analysis.winner.uplift,
          }
        : null,
      rollout: result.rollout
        ? {
            stage: result.rollout.stage,
            weights: result.rollout.weights,
          }
        : null,
    });
  } catch (err) {
    console.error('Auto-promote error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
