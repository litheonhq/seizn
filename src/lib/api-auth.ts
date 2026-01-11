import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from './supabase';
import { hashApiKey } from './api-key';
import { checkUsageLimits, logApiUsage, updateApiKeyLastUsed } from './usage';
import { checkRateLimit, getRateLimitHeaders } from './rate-limit';
import { logAuthFailure, logSuspiciousActivity } from './audit';

interface AuthResult {
  userId: string;
  keyId: string;
  plan: string;
  rateLimitHeaders?: Record<string, string>;
}

interface AuthError {
  error: string;
  status: number;
  headers?: Record<string, string>;
}

type AuthResponse = AuthResult | { authError: AuthError };

/**
 * Authenticate API request and check usage limits
 */
export async function authenticateRequest(
  request: NextRequest,
  options?: { skipUsageCheck?: boolean }
): Promise<AuthResponse> {
  const apiKey = request.headers.get('x-api-key');

  if (!apiKey) {
    // Log auth failure (no key provided)
    logAuthFailure(request, 'no_api_key_provided').catch(console.error);
    return {
      authError: {
        error: 'API key required. Pass your API key in the x-api-key header.',
        status: 401,
      },
    };
  }

  const supabase = createServerClient();
  const keyHash = hashApiKey(apiKey);

  // Verify API key and get user_id
  const { data: keyData, error: keyError } = await supabase
    .from('api_keys')
    .select('id, user_id, expires_at')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .single();

  if (keyError || !keyData) {
    // Log auth failure with key prefix for investigation
    logAuthFailure(request, 'invalid_api_key', apiKey).catch(console.error);
    return {
      authError: {
        error: 'Invalid or inactive API key',
        status: 401,
      },
    };
  }

  // Check if key has expired
  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    logAuthFailure(request, 'expired_api_key', apiKey).catch(console.error);
    return {
      authError: {
        error: 'API key has expired. Please generate a new key.',
        status: 401,
      },
    };
  }

  // Check usage limits unless skipped
  if (!options?.skipUsageCheck) {
    const usageCheck = await checkUsageLimits(keyData.user_id);

    if (!usageCheck.allowed) {
      return {
        authError: {
          error: usageCheck.reason || 'Usage limit exceeded',
          status: 429,
        },
      };
    }
  }

  // Get user plan
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', keyData.user_id)
    .single();

  const plan = profile?.plan || 'free';

  // Check rate limit (per-minute burst protection)
  const rateLimitResult = checkRateLimit(keyData.user_id, plan);
  const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);

  if (!rateLimitResult.allowed) {
    // Log rate limit violation as suspicious activity
    logSuspiciousActivity(request, keyData.user_id, 'rate_limit', {
      plan,
      remaining: rateLimitResult.remaining,
      limit: rateLimitResult.limit,
    }).catch(console.error);
    return {
      authError: {
        error: 'Rate limit exceeded. Please slow down your requests.',
        status: 429,
        headers: rateLimitHeaders,
      },
    };
  }

  return {
    userId: keyData.user_id,
    keyId: keyData.id,
    plan,
    rateLimitHeaders,
  };
}

/**
 * Check if auth result is an error
 */
export function isAuthError(result: AuthResponse): result is { authError: AuthError } {
  return 'authError' in result;
}

/**
 * Create error response from auth error
 */
export function authErrorResponse(authError: AuthError): NextResponse {
  const response = NextResponse.json(
    { error: authError.error },
    { status: authError.status }
  );

  // Add rate limit headers if present
  if (authError.headers) {
    Object.entries(authError.headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }

  return response;
}

interface RequestContext {
  userId: string;
  keyId: string;
  endpoint: string;
  method: string;
  startTime: number;
}

/**
 * Log the API request after completion
 */
export async function logRequest(
  ctx: RequestContext,
  statusCode: number,
  tokenUsage?: { input?: number; output?: number; embedding?: number }
): Promise<void> {
  const latencyMs = Date.now() - ctx.startTime;

  await Promise.all([
    logApiUsage({
      userId: ctx.userId,
      apiKeyId: ctx.keyId,
      endpoint: ctx.endpoint,
      method: ctx.method,
      statusCode,
      latencyMs,
      inputTokens: tokenUsage?.input,
      outputTokens: tokenUsage?.output,
      embeddingTokens: tokenUsage?.embedding,
    }),
    updateApiKeyLastUsed(ctx.keyId),
  ]);
}
