import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  authErrorResponse,
  isAuthError,
  logRequest,
} from '@/lib/api-auth';
import { handleAuthorEvalJobRequest } from '@/lib/author/memory-v3';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ENDPOINT = '/api/author/memory-v3/eval';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const authResult = await authenticateRequest(request);

  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const response = NextResponse.json(
      {
        success: false,
        error: {
          code: 'AUTHOR_MEMORY_V3_INVALID_JSON',
          message: 'Invalid JSON request body',
        },
      },
      { status: 400 }
    );
    await logRequest({
      userId: authResult.userId,
      keyId: authResult.keyId,
      endpoint: ENDPOINT,
      method: 'POST',
      startTime,
    }, 400);
    return withAuthHeaders(response, authResult.rateLimitHeaders);
  }

  const result = await handleAuthorEvalJobRequest(body);
  const response = NextResponse.json(result.body, { status: result.status });

  await logRequest({
    userId: authResult.userId,
    keyId: authResult.keyId,
    endpoint: ENDPOINT,
    method: 'POST',
    startTime,
  }, result.status);

  return withAuthHeaders(response, authResult.rateLimitHeaders);
}

function withAuthHeaders(
  response: NextResponse,
  headers: Record<string, string> | undefined
): NextResponse {
  for (const [key, value] of Object.entries(headers ?? {})) {
    response.headers.set(key, value);
  }

  return response;
}
