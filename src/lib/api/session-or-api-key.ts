import { NextRequest, NextResponse } from 'next/server';

import {
  authenticateRequest,
  authErrorResponse,
  extractApiKey,
  isAuthError,
} from '@/lib/api-auth';
import { getSessionUser } from '@/lib/api/request-user';
import { verifyCsrfToken } from '@/lib/csrf';

type SessionOrApiKeyAuth =
  | {
      ok: true;
      userId: string;
      authType: 'api-key' | 'session';
      rateLimitHeaders?: Record<string, string>;
    }
  | {
      ok: false;
      response: NextResponse;
    };

interface SessionOrApiKeyOptions {
  csrfForSession?: boolean;
  skipUsageCheck?: boolean;
}

export async function authenticateSessionOrApiKey(
  request: NextRequest,
  options: SessionOrApiKeyOptions = {},
): Promise<SessionOrApiKeyAuth> {
  const { apiKey } = extractApiKey(request);

  if (apiKey) {
    const authResult = await authenticateRequest(request, {
      skipUsageCheck: options.skipUsageCheck,
    });
    if (isAuthError(authResult)) {
      return { ok: false, response: authErrorResponse(authResult.authError) };
    }

    return {
      ok: true,
      userId: authResult.userId,
      authType: 'api-key',
      rateLimitHeaders: authResult.rateLimitHeaders,
    };
  }

  if (options.csrfForSession) {
    const csrfError = verifyCsrfToken(request);
    if (csrfError) {
      return { ok: false, response: csrfError };
    }
  }

  const user = await getSessionUser();
  if (!user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    };
  }

  return {
    ok: true,
    userId: user.id,
    authType: 'session',
  };
}
