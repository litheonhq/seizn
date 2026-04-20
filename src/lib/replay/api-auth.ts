import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  authErrorResponse,
  isAuthError,
} from '@/lib/api-auth';
import { resolveReplayOrganizationId } from './snapshot';

export interface ReplayRouteAuth {
  userId: string;
  apiKeyId: string;
  organizationId: string;
  rateLimitHeaders?: Record<string, string>;
}

export async function requireReplayRouteAuth(
  request: NextRequest
): Promise<ReplayRouteAuth | { error: NextResponse }> {
  const authResult = await authenticateRequest(request, { skipUsageCheck: true });
  if (isAuthError(authResult)) {
    return { error: authErrorResponse(authResult.authError) };
  }

  const organizationId = await resolveReplayOrganizationId(authResult.userId, authResult.keyId);
  if (!organizationId) {
    return {
      error: NextResponse.json(
        {
          success: false,
          error: {
            code: 'replay_organization_required',
            message: 'Replay snapshots require an organization-scoped API key or profile.',
          },
        },
        { status: 403 }
      ),
    };
  }

  return {
    userId: authResult.userId,
    apiKeyId: authResult.keyId,
    organizationId,
    rateLimitHeaders: authResult.rateLimitHeaders,
  };
}

export function withReplayHeaders(
  response: NextResponse,
  headers?: Record<string, string>
): NextResponse {
  if (!headers) return response;
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}
