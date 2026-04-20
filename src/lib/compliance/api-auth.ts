import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  authErrorResponse,
  isAuthError,
  logRequest,
} from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import { resolveComplianceOrganizationId } from './organization';

export interface ComplianceApiActor {
  userId: string;
  keyId: string;
  organizationId: string;
  plan: string;
  rateLimitHeaders?: Record<string, string>;
}

export async function requireComplianceApiActor(
  request: NextRequest,
  startTime: number
): Promise<ComplianceApiActor | { error: NextResponse }> {
  const authResult = await authenticateRequest(request, { skipUsageCheck: false });
  if (isAuthError(authResult)) {
    return { error: authErrorResponse(authResult.authError) };
  }

  const supabase = createServerClient();
  const organizationId = await resolveComplianceOrganizationId(supabase, {
    userId: authResult.userId,
    keyId: authResult.keyId,
  });

  if (!organizationId) {
    await logRequest(
      {
        userId: authResult.userId,
        keyId: authResult.keyId,
        endpoint: request.nextUrl.pathname,
        method: request.method,
        startTime,
      },
      403
    );

    return {
      error: NextResponse.json(
        {
          success: false,
          error: {
            code: 'compliance/organization_required',
            message: 'Compliance endpoints require an organization-scoped API key.',
          },
          meta: { version: 'v1' },
        },
        { status: 403 }
      ),
    };
  }

  return {
    userId: authResult.userId,
    keyId: authResult.keyId,
    organizationId,
    plan: authResult.plan,
    rateLimitHeaders: authResult.rateLimitHeaders,
  };
}

export function withComplianceHeaders(
  response: NextResponse,
  headers?: Record<string, string>
): NextResponse {
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
  }
  return response;
}
