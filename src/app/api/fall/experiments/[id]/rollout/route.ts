import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { executeRollout, analyzeWinner } from '@/lib/fall/experiments';
import type { RolloutStage } from '@/lib/fall/experiments';

/**
 * POST /api/fall/experiments/[id]/rollout
 *
 * Execute gradual rollout to the next stage or a specific stage.
 *
 * Body:
 * {
 *   "winner_arm_id": string,      // Required: arm to promote
 *   "target_stage"?: string       // Optional: "10%" | "50%" | "100%"
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
    const body = await request.json();

    const winnerArmId = body?.winner_arm_id;
    if (!winnerArmId || typeof winnerArmId !== 'string') {
      return NextResponse.json(
        { error: 'winner_arm_id (string) is required' },
        { status: 400 }
      );
    }

    const targetStage = body?.target_stage as RolloutStage | undefined;
    if (targetStage && !['10%', '50%', '100%', 'completed'].includes(targetStage)) {
      return NextResponse.json(
        { error: 'target_stage must be one of: 10%, 50%, 100%, completed' },
        { status: 400 }
      );
    }

    const result = await executeRollout({
      experimentId,
      winnerArmId,
      targetStage,
      userId,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      experiment_id: result.experimentId,
      winner_arm_id: result.winnerArmId,
      stage: result.stage,
      weights: result.weights,
      message: result.message,
    });
  } catch (err) {
    console.error('Rollout error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/fall/experiments/[id]/rollout
 *
 * Get current rollout status and history.
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

    // Get current winner analysis
    const analysis = await analyzeWinner(experimentId);

    // Determine current stage from winner analysis
    let currentStage: RolloutStage = 'candidate';
    if (analysis.winner) {
      // Check actual weights to determine stage
      const winnerCandidate = analysis.allCandidates.find(
        (c) => c.armId === analysis.winner?.armId
      );
      // Note: We'd need to query actual weights from DB for accurate stage
      // This is a simplified version based on analysis
      currentStage = analysis.hasWinner ? 'candidate' : 'candidate';
    }

    return NextResponse.json({
      success: true,
      experiment_id: experimentId,
      current_stage: currentStage,
      has_winner: analysis.hasWinner,
      can_rollout: analysis.canDeclareWinner,
      winner: analysis.winner
        ? {
            arm_id: analysis.winner.armId,
            arm_name: analysis.winner.armName,
            uplift: analysis.winner.uplift,
          }
        : null,
      next_stages: getNextStages(currentStage),
      recommendation: analysis.recommendation,
    });
  } catch (err) {
    console.error('Rollout status error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function getNextStages(current: RolloutStage): RolloutStage[] {
  switch (current) {
    case 'candidate':
      return ['10%', '50%', '100%'];
    case '10%':
      return ['50%', '100%'];
    case '50%':
      return ['100%'];
    case '100%':
    case 'completed':
      return [];
    default:
      return ['10%', '50%', '100%'];
  }
}
