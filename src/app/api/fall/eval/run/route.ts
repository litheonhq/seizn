import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { runEval, runPostEvalRegressionCheck } from '@/lib/fall/eval';

// POST /api/fall/eval/run
// Body:
// {
//   "dataset_id": "uuid",
//   "collection_id": "uuid",
//   "autopilot"?: boolean,
//   "override"?: Partial<RetrievalConfig>,
//   "limit_cases"?: number,
//   "enable_faithfulness"?: boolean,     // Enable LLM-as-judge faithfulness scoring (costly)
//   "check_regression"?: boolean,        // Run regression check after eval
//   "slack_webhook_url"?: string         // Slack webhook for regression alerts
// }
export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, plan } = authResult;
    const body = await request.json();

    const datasetId = body?.dataset_id;
    const collectionId = body?.collection_id;

    if (!datasetId || typeof datasetId !== 'string') {
      return NextResponse.json({ error: 'dataset_id (string) is required' }, { status: 400 });
    }
    if (!collectionId || typeof collectionId !== 'string') {
      return NextResponse.json({ error: 'collection_id (string) is required' }, { status: 400 });
    }

    const result = await runEval({
      userId,
      datasetId,
      plan,
      collectionId,
      autopilot: body?.autopilot ?? true,
      override: body?.override ?? undefined,
      limitCases: body?.limit_cases ?? 50,
      enableFaithfulness: body?.enable_faithfulness ?? false,
    });

    // Run regression check if requested
    let regressionResult = null;
    if (body?.check_regression) {
      regressionResult = await runPostEvalRegressionCheck({
        userId,
        datasetId,
        runId: result.runId,
        config: body?.slack_webhook_url
          ? { slackWebhookUrl: body.slack_webhook_url }
          : undefined,
      });
    }

    return NextResponse.json(
      {
        success: true,
        ...result,
        regression: regressionResult,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Fall eval run error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
