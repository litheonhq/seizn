import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import {
  processTrigger,
  createTriggerFromFeedback,
  createTriggerFromEval,
} from '@/lib/sentry';
import type { TriggerInput } from '@/lib/sentry/types';

/**
 * POST /api/sentry/trigger
 * Manually trigger incident creation/update
 *
 * Body:
 * - source: 'manual' | 'user_feedback' | 'eval_failure'
 * - trace_id: string (required)
 * - trace: { query_text?, collection_id?, faithfulness?, latency_ms?, error? }
 * - feedback?: { type: 'thumb_down' | 'wrong_answer' | 'irrelevant' | 'outdated', comment? }
 * - eval?: { faithfulness?, relevance?, passed: boolean, reason? }
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const body = await request.json();

    // Validate required fields
    if (!body.trace_id) {
      return NextResponse.json(
        { success: false, error: 'trace_id is required' },
        { status: 400 }
      );
    }

    const source = body.source ?? 'manual';
    let triggerInput: TriggerInput;

    // Build trigger input based on source
    if (source === 'user_feedback' && body.feedback) {
      triggerInput = createTriggerFromFeedback(
        userId,
        body.trace_id,
        body.feedback,
        body.trace
      );
    } else if (source === 'eval_failure' && body.eval) {
      triggerInput = createTriggerFromEval(
        userId,
        body.trace_id,
        body.eval,
        body.trace
      );
    } else {
      // Manual or auto_detect
      triggerInput = {
        userId,
        traceId: body.trace_id,
        source: source as TriggerInput['source'],
        trace: {
          queryText: body.trace?.query_text,
          queryHash: body.trace?.query_hash,
          collectionId: body.trace?.collection_id,
          plannerPath: body.trace?.planner_path,
          topDocIds: body.trace?.top_doc_ids,
          faithfulness: body.trace?.faithfulness,
          latencyMs: body.trace?.latency_ms,
          error: body.trace?.error,
          response: body.trace?.response,
        },
        feedback: body.feedback,
      };
    }

    // Process trigger
    const result = await processTrigger(triggerInput);

    if (!result.triggered) {
      return NextResponse.json({
        success: false,
        triggered: false,
        reason: result.skipReason,
      });
    }

    return NextResponse.json({
      success: true,
      triggered: true,
      incident_id: result.incidentId,
      is_new: result.isNew,
      rca: result.rca ? {
        error_type: result.rca.errorType,
        candidates: result.rca.candidates.map(c => ({
          cause: c.cause,
          confidence: c.confidence,
          fix_suggestion: c.fixSuggestion,
          category: c.category,
        })),
      } : undefined,
    });
  } catch (err) {
    console.error('Trigger incident error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
