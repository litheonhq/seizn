/**
 * Context API
 *
 * Returns ready-to-inject context string for LLM prompts.
 * Zep/Memobase style API for easy integration.
 *
 * Supports both session auth (dashboard) and API key auth (MCP/SDK).
 *
 * GET /api/context?format=detailed&includeProfile=true
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { getSessionUser } from '@/lib/api/request-user';
import { createServerClient } from '@/lib/supabase';
import { createContextService, type ContextFormat, type ContextOptions } from '@/lib/spring/memory-v4/context-service';
import { boundedInt } from '@/lib/parse-params';
import { logServerError } from '@/lib/server/logger';

function parseTierBudget(raw: string | null): number | undefined {
  if (raw == null || raw.trim().length === 0) {
    return undefined;
  }

  return boundedInt(raw, 0, 0, 100);
}

/**
 * Resolve userId from session (dashboard) or API key (MCP/SDK).
 * API key auth is tried first; falls back to session auth.
 */
async function resolveUserId(
  request: NextRequest
): Promise<{ userId: string; headers?: Record<string, string> } | NextResponse> {
  // Try API key auth first (for MCP / SDK callers)
  const apiAuth = await authenticateRequest(request, { skipUsageCheck: false });
  if (!isAuthError(apiAuth)) {
    return { userId: apiAuth.userId, headers: apiAuth.rateLimitHeaders };
  }

  // Fall back to session auth (dashboard users)
  const sessionUser = await getSessionUser();
  if (sessionUser?.id) {
    return { userId: sessionUser.id };
  }

  // Neither worked → return the API key error (more informative)
  return authErrorResponse(apiAuth.authError);
}

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveUserId(request);
    if (resolved instanceof NextResponse) return resolved;
    const { userId, headers: authHeaders } = resolved;

    const { searchParams } = new URL(request.url);

    // Parse options from query params
    const options: ContextOptions = {
      format: (searchParams.get('format') as ContextFormat) ?? 'detailed',
      maxTokens: searchParams.get('maxTokens') ? boundedInt(searchParams.get('maxTokens'), 4096, 100, 32000) : undefined,
      includeProfile: searchParams.get('includeProfile') !== 'false',
      includeRecentMessages: searchParams.get('includeRecentMessages') !== 'false',
      recentMessageCount: searchParams.get('recentMessageCount')
        ? boundedInt(searchParams.get('recentMessageCount'), 20, 1, 100)
        : undefined,
      includeFacts: searchParams.get('includeFacts') !== 'false',
      includeGraph: searchParams.get('includeGraph') === 'true',
      tierStrategy: searchParams.get('tierStrategy') as ContextOptions['tierStrategy'] ?? undefined,
      query: searchParams.get('query') ?? undefined,
      types: searchParams.get('types')?.split(',').filter(Boolean),
      tags: searchParams.get('tags')?.split(',').filter(Boolean),
      categories: searchParams.get('categories')?.split(',').filter(Boolean),
    };

    // Parse tier budgets if provided
    const hotBudget = searchParams.get('tierBudget.hot');
    const warmBudget = searchParams.get('tierBudget.warm');
    const coldBudget = searchParams.get('tierBudget.cold');

    if (hotBudget || warmBudget || coldBudget) {
      options.tierBudgets = {
        hot: parseTierBudget(hotBudget),
        warm: parseTierBudget(warmBudget),
        cold: parseTierBudget(coldBudget),
      };
    }

    const supabase = createServerClient();
    const contextService = createContextService(supabase);

    const contextResponse = await contextService.getContext(userId, options);

    const response = NextResponse.json(contextResponse);

    // Attach rate-limit / deprecation headers from API key auth
    if (authHeaders) {
      Object.entries(authHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    }

    return response;
  } catch (error) {
    logServerError('Context API error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get context' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/context
 *
 * Alternative with JSON body for complex options.
 * Supports both session auth (dashboard) and API key auth (MCP/SDK).
 */
export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveUserId(request);
    if (resolved instanceof NextResponse) return resolved;
    const { userId, headers: authHeaders } = resolved;

    const options = (await request.json()) as ContextOptions;

    const supabase = createServerClient();
    const contextService = createContextService(supabase);

    const contextResponse = await contextService.getContext(userId, options);

    const response = NextResponse.json(contextResponse);

    if (authHeaders) {
      Object.entries(authHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    }

    return response;
  } catch (error) {
    logServerError('Context API error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get context' },
      { status: 500 }
    );
  }
}
