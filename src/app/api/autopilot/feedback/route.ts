/**
 * Autopilot Retrieval Feedback API
 *
 * POST - Record user feedback for a decision
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { recordFeedback, recordOutcome } from '@/lib/autopilot-retrieval';
import type { StrategyOutcome } from '@/lib/autopilot-retrieval';
import { logServerError } from '@/lib/server/logger';

/**
 * POST /api/autopilot/feedback
 *
 * Record user feedback or outcome for a decision.
 *
 * Body (feedback only):
 * {
 *   "decision_id": string,        // Required: the decision to provide feedback for
 *   "feedback": "positive" | "negative" | "neutral"  // Required
 * }
 *
 * Body (full outcome):
 * {
 *   "decision_id": string,
 *   "outcome": {
 *     "latency_ms": number,
 *     "relevance_score": number,
 *     "cost": number,
 *     "result_count": number,
 *     "user_feedback"?: "positive" | "negative" | "neutral"
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const body = await request.json();

    // Validate decision_id
    const decisionId = body?.decision_id;
    if (!decisionId || typeof decisionId !== 'string') {
      return NextResponse.json(
        { error: 'decision_id (string) is required' },
        { status: 400 }
      );
    }

    // Check if it's a full outcome or just feedback
    if (body?.outcome) {
      // Full outcome recording
      const outcome = body.outcome as Partial<StrategyOutcome>;

      if (
        typeof outcome.latencyMs !== 'number' ||
        typeof outcome.relevanceScore !== 'number' ||
        typeof outcome.cost !== 'number' ||
        typeof outcome.resultCount !== 'number'
      ) {
        return NextResponse.json(
          {
            error:
              'outcome requires latency_ms, relevance_score, cost, and result_count',
          },
          { status: 400 }
        );
      }

      // Validate ranges
      if (outcome.latencyMs < 0) {
        return NextResponse.json(
          { error: 'latency_ms must be non-negative' },
          { status: 400 }
        );
      }

      if (outcome.relevanceScore < 0 || outcome.relevanceScore > 1) {
        return NextResponse.json(
          { error: 'relevance_score must be between 0 and 1' },
          { status: 400 }
        );
      }

      if (outcome.cost < 0) {
        return NextResponse.json(
          { error: 'cost must be non-negative' },
          { status: 400 }
        );
      }

      if (outcome.resultCount < 0) {
        return NextResponse.json(
          { error: 'result_count must be non-negative' },
          { status: 400 }
        );
      }

      // Validate feedback if provided
      if (
        outcome.userFeedback &&
        !['positive', 'negative', 'neutral'].includes(outcome.userFeedback)
      ) {
        return NextResponse.json(
          { error: 'user_feedback must be positive, negative, or neutral' },
          { status: 400 }
        );
      }

      const result = await recordOutcome(decisionId, {
        latencyMs: outcome.latencyMs,
        relevanceScore: outcome.relevanceScore,
        cost: outcome.cost,
        resultCount: outcome.resultCount,
        userFeedback: outcome.userFeedback,
      });

      return NextResponse.json({
        success: true,
        reward: result.reward,
        reward_components: result.components,
        interpretation: interpretReward(result.reward),
      });
    } else if (body?.feedback) {
      // Feedback only
      const feedback = body.feedback;

      if (!['positive', 'negative', 'neutral'].includes(feedback)) {
        return NextResponse.json(
          { error: 'feedback must be positive, negative, or neutral' },
          { status: 400 }
        );
      }

      const success = await recordFeedback(decisionId, feedback);

      if (!success) {
        return NextResponse.json(
          { error: 'Failed to record feedback. Decision may not exist.' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `Feedback "${feedback}" recorded successfully`,
      });
    } else {
      return NextResponse.json(
        { error: 'Either feedback or outcome is required' },
        { status: 400 }
      );
    }
  } catch (err) {
    logServerError('Autopilot feedback POST error', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Helper function to interpret reward score
 */
function interpretReward(reward: number): {
  rating: string;
  description: string;
} {
  if (reward >= 0.9) {
    return { rating: 'excellent', description: 'Outstanding performance' };
  }
  if (reward >= 0.7) {
    return { rating: 'good', description: 'Above average performance' };
  }
  if (reward >= 0.5) {
    return { rating: 'fair', description: 'Acceptable performance' };
  }
  if (reward >= 0.3) {
    return { rating: 'poor', description: 'Below expectations' };
  }
  return { rating: 'bad', description: 'Significant issues detected' };
}
