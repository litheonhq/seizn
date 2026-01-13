import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from './supabase';
import { hashApiKey } from './api-key';
import { checkUsageLimits, logApiUsage, updateApiKeyLastUsed } from './usage';
import { checkRateLimit, getRateLimitHeaders } from './rate-limit';
import { logAuthFailure, logSuspiciousActivity } from './audit';
import {
  ErrorCodes,
} from './api-error';
// Re-export for external use
export { AuthErrors, RateLimitErrors, type ApiErrorResponse } from './api-error';

interface AuthResult {
  userId: string;
  keyId: string;
  plan: string;
  rateLimitHeaders?: Record<string, string>;
}

interface AuthError {
  code: string;
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
        code: ErrorCodes.AUTH_MISSING_KEY,
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
        code: ErrorCodes.AUTH_INVALID_KEY,
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
        code: ErrorCodes.AUTH_EXPIRED_KEY,
        error: 'API key has expired. Please generate a new key from the dashboard.',
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
          code: ErrorCodes.QUOTA_EXCEEDED,
          error: usageCheck.reason || 'Usage limit exceeded. Upgrade your plan for higher limits.',
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
        code: ErrorCodes.RATE_LIMIT_EXCEEDED,
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
 * Hints for auth errors
 */
const AuthHints: Record<string, string> = {
  [ErrorCodes.AUTH_MISSING_KEY]: 'Add x-api-key header to your request',
  [ErrorCodes.AUTH_INVALID_KEY]: 'Check API key in Dashboard → API Keys',
  [ErrorCodes.AUTH_EXPIRED_KEY]: 'Generate new API key in Dashboard',
  [ErrorCodes.RATE_LIMIT_EXCEEDED]: 'Implement exponential backoff (1s→2s→4s)',
  [ErrorCodes.QUOTA_EXCEEDED]: 'Upgrade plan or wait for quota reset',
};

/**
 * Create error response from auth error
 */
export function authErrorResponse(authError: AuthError): NextResponse {
  const traceId = `trc_${crypto.randomUUID().replace(/-/g, '').substring(0, 24)}`;
  const hint = AuthHints[authError.code] || 'Contact support with trace_id';

  // Determine docs URL based on error type
  const docsUrl = authError.code.startsWith('RATE_') || authError.code.startsWith('QUOTA_')
    ? 'https://seizn.com/docs#rate-limits'
    : 'https://seizn.com/docs#authentication';

  const response = NextResponse.json(
    {
      error: {
        error_code: authError.code,
        message: authError.error,
        trace_id: traceId,
        hint: hint,
        docs_url: docsUrl,
      },
    },
    { status: authError.status }
  );

  // Add trace ID header for observability
  response.headers.set('X-Trace-ID', traceId);

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

export interface ValidateApiKeyResult {
  success: true;
  userId: string;
  keyId: string;
  plan: string;
  orgId?: string;
}

/**
 * Validate API key and return user info (simplified helper)
 * Returns { success: true, ... } on success, or null on failure
 */
export async function validateApiKey(
  request: NextRequest
): Promise<ValidateApiKeyResult | null> {
  const result = await authenticateRequest(request, { skipUsageCheck: true });

  if (isAuthError(result)) {
    return null;
  }

  // Try to get orgId from profile
  const supabase = createServerClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', result.userId)
    .single();

  return {
    success: true,
    userId: result.userId,
    keyId: result.keyId,
    plan: result.plan,
    orgId: profile?.organization_id ?? undefined,
  };
}
