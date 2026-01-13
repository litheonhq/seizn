/**
 * POST /api/canary/deploy
 *
 * Start a canary deployment for RAG pipeline configuration.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import {
  startDeployment,
  type StartDeploymentRequest,
  type StartDeploymentResponse,
} from '@/lib/fall/canary';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Parse request body
    let body: StartDeploymentRequest;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON body');
    }

    // Validate required fields
    if (!body.baselineVersion?.name) {
      return ValidationErrors.missingField('baselineVersion.name');
    }
    if (!body.canaryVersion?.name) {
      return ValidationErrors.missingField('canaryVersion.name');
    }

    // Start deployment
    const deployment = startDeployment(userId, body);

    // Build response
    const response: StartDeploymentResponse = {
      deployment,
      message: `Canary deployment started at ${deployment.currentStage}`,
    };

    // Log the request
    await logRequest(
      { userId, keyId, endpoint: '/api/canary/deploy', method: 'POST', startTime },
      200
    );

    return NextResponse.json(response, {
      status: 200,
      headers: rateLimitHeaders,
    });
  } catch (error) {
    console.error('Canary deploy error:', error);
    return ServerErrors.internal('Failed to start canary deployment');
  }
}
