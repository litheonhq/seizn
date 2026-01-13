/**
 * POST /api/canary/action
 *
 * Perform actions on canary deployment (promote, rollback, cancel).
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
  getDeployment,
  promoteDeployment,
  rollbackDeployment,
  cancelDeployment,
  type DeploymentActionRequest,
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
    let body: DeploymentActionRequest;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON body');
    }

    // Validate required fields
    if (!body.deploymentId) {
      return ValidationErrors.missingField('deploymentId');
    }
    if (!body.action || !['promote', 'rollback', 'cancel'].includes(body.action)) {
      return ValidationErrors.invalidBody('Invalid action. Must be promote, rollback, or cancel');
    }

    // Verify ownership
    const deployment = getDeployment(body.deploymentId);
    if (!deployment) {
      return NextResponse.json(
        { error: 'Deployment not found' },
        { status: 404 }
      );
    }
    if (deployment.userId !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized: deployment does not belong to user' },
        { status: 403 }
      );
    }

    // Execute action
    let result;
    switch (body.action) {
      case 'promote':
        result = promoteDeployment(body.deploymentId);
        break;
      case 'rollback':
        result = rollbackDeployment(body.deploymentId, 'manual_trigger', body.reason);
        break;
      case 'cancel':
        result = cancelDeployment(body.deploymentId);
        break;
      default:
        return ValidationErrors.invalidBody('Invalid action');
    }

    // Log the request
    await logRequest(
      { userId, keyId, endpoint: '/api/canary/action', method: 'POST', startTime },
      result.success ? 200 : 400
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.message, deployment: result.deployment },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: result.message,
        deployment: result.deployment,
        report: 'report' in result ? result.report : undefined,
      },
      { status: 200, headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Canary action error:', error);
    return ServerErrors.internal('Failed to execute canary action');
  }
}
