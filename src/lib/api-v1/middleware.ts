import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  ApiKeyError,
  InvalidApiKeyError,
  RateLimitExceededError,
  checkRateLimit,
  checkScope,
  enforceQuota,
  recordUsage,
  validateBearer,
  type ApiKeyTool,
  type RedisLike,
  type SupabaseLike,
  type ValidatedApiKey,
} from '@/lib/api-keys';
import { createTrack2RedisFromEnv } from '@/lib/api-keys/redis-config';
import { AuthorUiNotFoundError, AuthorUiValidationError } from '@/lib/author/ui/service';
import { TRACK_2_DISABLED_PROBLEM, isTrack2ApiEnabled } from '@/lib/feature-flags/track-2';

export type ApiV1Context = {
  requestId: string;
  apiKey: ValidatedApiKey;
  llm?: {
    provider: string;
    key: string;
    model: string | null;
  };
};

export type ApiV1HandlerResult = {
  body: unknown;
  status?: number;
  headers?: HeadersInit;
};

export type ApiV1Handler = (context: ApiV1Context) => Promise<ApiV1HandlerResult | unknown>;

type ApiV1Options = {
  scope?: string;
  costUnits: number;
  tool: ApiKeyTool;
  projectId?: string | null;
  requiresLlmKey?: boolean;
  idempotent?: boolean;
  supabase?: SupabaseLike;
  redis?: RedisLike;
};

type CachedApiV1Response = {
  body: unknown;
  status: number;
};

const IDEMPOTENCY_TTL_MS = 86_400_000; // 24h, matches the Redis `ex: 86_400` (s) on the same path

type CachedEntry = { value: CachedApiV1Response; expiresAt: number };

const idempotencyMemory = new Map<string, CachedEntry>();

export function __resetApiV1IdempotencyForTests(): void {
  idempotencyMemory.clear();
}

export async function handleApiV1(
  request: NextRequest,
  options: ApiV1Options,
  handler: ApiV1Handler
): Promise<NextResponse> {
  const requestId = `req_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const startedAt = Date.now();
  let outboundStatus = 0;

  try {
    if (!isTrack2ApiEnabled()) {
      outboundStatus = TRACK_2_DISABLED_PROBLEM.status;
      return new NextResponse(
        JSON.stringify({
          ...TRACK_2_DISABLED_PROBLEM,
          instance: new URL(request.url).pathname,
        }),
        {
          status: TRACK_2_DISABLED_PROBLEM.status,
          headers: {
            ...corsHeaders(),
            'Content-Type': 'application/problem+json',
            'X-Request-Id': requestId,
            'Seizn-Api-Version': '1.0',
          },
        },
      );
    }

    const token = parseBearerToken(request);
    const apiKey = await validateBearer(token, { supabase: options.supabase });

    if (options.scope) {
      await checkScope(apiKey.scopes, options.scope, {
        apiKeyId: apiKey.apiKeyId,
        userId: apiKey.userId,
        orgId: apiKey.orgId,
        supabase: options.supabase,
      });
    }

    await checkRateLimit(apiKey.apiKeyId, apiKey.rateLimitPerMinute, {
      userId: apiKey.userId,
      orgId: apiKey.orgId,
      supabase: options.supabase,
      redis: options.redis,
    });

    if (options.costUnits > 0) {
      await enforceQuota(apiKey.apiKeyId, apiKey.monthlyQuota, apiKey.monthlyQuotaPeriod, {
        userId: apiKey.userId,
        orgId: apiKey.orgId,
        supabase: options.supabase,
        redis: options.redis,
      });
    }

    const llm = options.requiresLlmKey ? readLlmKey(request) : undefined;
    const idempotencyKey = options.idempotent ? request.headers.get('idempotency-key') : null;
    const cacheKey = idempotencyKey
      ? `track2:idempotency:${apiKey.apiKeyId}:${request.method}:${new URL(request.url).pathname}:${idempotencyKey}`
      : null;
    const redis = cacheKey ? options.redis ?? createTrack2RedisFromEnv() : null;
    const cached = cacheKey ? await readIdempotency(cacheKey, redis) : null;
    if (cached) {
      outboundStatus = cached.status;
      return decorateApiV1Response(requestId, cached.body, cached.status, {
        'Idempotency-Replayed': 'true',
      });
    }

    const result = normalizeHandlerResult(await handler({ requestId, apiKey, llm }));

    if (options.costUnits > 0) {
      await recordUsage({
        apiKeyId: apiKey.apiKeyId,
        tool: options.tool,
        projectId: options.projectId ?? null,
        costUnits: options.costUnits,
        llmProvider: llm?.provider ?? null,
        llmModel: llm?.model ?? null,
        llmCostUsdMilli: llm ? 1 : 0,
        supabase: options.supabase,
        redis: options.redis,
      });
    }

    if (cacheKey) {
      await writeIdempotency(cacheKey, {
        body: result.body,
        status: result.status,
      }, redis);
    }

    outboundStatus = result.status;
    return decorateApiV1Response(requestId, result.body, result.status, result.headers);
  } catch (error) {
    if (
      !(error instanceof ApiKeyError) &&
      !(error instanceof RateLimitExceededError) &&
      !(error instanceof AuthorUiNotFoundError) &&
      !(error instanceof AuthorUiValidationError) &&
      !(error instanceof ApiV1ProblemError)
    ) {
      console.error('[api-v1 unhandled]', {
        requestId,
        url: request.url,
        method: request.method,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    const response = problemResponse(error, request, requestId);
    outboundStatus = response.status;
    return response;
  } finally {
    const latencyMs = Date.now() - startedAt;
    console.log('[track-2-metric]', {
      requestId,
      tool: options.tool,
      method: request.method,
      pathname: new URL(request.url).pathname,
      status: outboundStatus,
      latencyMs,
      costUnits: options.costUnits,
    });
  }
}

export function handleApiV1Options(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

export function apiV1Result(body: unknown, status = 200, headers?: HeadersInit): ApiV1HandlerResult {
  return { body, status, headers };
}

function parseBearerToken(request: NextRequest): string {
  const header = request.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new InvalidApiKeyError('API key required. Use Authorization: Bearer <api-key>');
  }
  return match[1].trim();
}

function readLlmKey(request: NextRequest): ApiV1Context['llm'] {
  const provider = request.headers.get('x-llm-provider')?.trim();
  const key = request.headers.get('x-llm-key')?.trim();
  const model = request.headers.get('x-llm-model')?.trim() || null;

  if (!provider || !key) {
    throw new ApiV1ProblemError({
      code: 'precondition_required',
      status: 402,
      title: 'BYOK header required',
      detail: 'Add X-LLM-Provider and X-LLM-Key, or use Studio Managed.',
    });
  }

  return { provider, key, model };
}

function normalizeHandlerResult(result: ApiV1HandlerResult | unknown): Required<ApiV1HandlerResult> {
  if (
    result &&
    typeof result === 'object' &&
    'body' in result &&
    ('status' in result || 'headers' in result)
  ) {
    const shaped = result as ApiV1HandlerResult;
    return {
      body: shaped.body,
      status: shaped.status ?? 200,
      headers: shaped.headers ?? {},
    };
  }

  return {
    body: result,
    status: 200,
    headers: {},
  };
}

async function readIdempotency(
  cacheKey: string,
  redis: RedisLike | null
): Promise<CachedApiV1Response | null> {
  if (redis) {
    return redis.get<CachedApiV1Response>(cacheKey);
  }

  const entry = idempotencyMemory.get(cacheKey);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt < Date.now()) {
    idempotencyMemory.delete(cacheKey);
    return null;
  }
  return entry.value;
}

async function writeIdempotency(
  cacheKey: string,
  value: CachedApiV1Response,
  redis: RedisLike | null
): Promise<void> {
  if (redis) {
    await redis.set(cacheKey, value, { ex: 86_400 });
    return;
  }

  idempotencyMemory.set(cacheKey, { value, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
}

function decorateApiV1Response(
  requestId: string,
  body: unknown,
  status = 200,
  headers?: HeadersInit
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      ...corsHeaders(),
      'X-Request-Id': requestId,
      'Seizn-Api-Version': '1.0',
      ...(headers ?? {}),
    },
  });
}

function problemResponse(error: unknown, request: NextRequest, requestId: string): NextResponse {
  const problem = toProblem(error, request);
  const headers: Record<string, string> = {
    ...corsHeaders(),
    'Content-Type': 'application/problem+json',
    'X-Request-Id': requestId,
    'Seizn-Api-Version': '1.0',
  };

  if (error instanceof RateLimitExceededError) {
    headers['Retry-After'] = String(error.retryAfterSeconds);
  }

  return NextResponse.json(problem, {
    status: problem.status,
    headers,
  });
}

function toProblem(error: unknown, request: NextRequest) {
  if (error instanceof ApiV1ProblemError) {
    return error.toProblem(request);
  }

  if (error instanceof ApiKeyError) {
    return {
      type: `https://seizn.com/errors/${error.code.replaceAll('_', '-')}`,
      title: titleFor(error.code),
      status: error.status,
      code: error.code,
      detail: error.message,
      instance: new URL(request.url).pathname,
    };
  }

  if (error instanceof AuthorUiNotFoundError) {
    return {
      type: 'https://seizn.com/errors/not-found',
      title: 'Not found',
      status: 404,
      code: 'not_found',
      detail: error.message,
      instance: new URL(request.url).pathname,
    };
  }

  if (error instanceof AuthorUiValidationError) {
    return {
      type: 'https://seizn.com/errors/validation-error',
      title: 'Validation error',
      status: 400,
      code: 'validation_error',
      detail: error.message,
      instance: new URL(request.url).pathname,
    };
  }

  const detail = error instanceof Error ? error.message : 'Internal server error';
  return {
    type: 'https://seizn.com/errors/internal-server-error',
    title: 'Internal server error',
    status: 500,
    code: 'internal_server_error',
    detail,
    instance: new URL(request.url).pathname,
  };
}

function titleFor(code: string): string {
  switch (code) {
    case 'invalid_api_key':
      return 'Invalid API key';
    case 'scope_denied':
      return 'Scope denied';
    case 'rate_limited':
      return 'Rate limit exceeded';
    case 'quota_exceeded':
      return 'Quota exceeded';
    default:
      return 'API error';
  }
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': [
      'authorization',
      'content-type',
      'idempotency-key',
      'x-llm-provider',
      'x-llm-key',
      'x-llm-model',
    ].join(','),
  };
}

class ApiV1ProblemError extends Error {
  constructor(
    private readonly problem: {
      code: string;
      status: number;
      title: string;
      detail: string;
    }
  ) {
    super(problem.detail);
    this.name = 'ApiV1ProblemError';
  }

  toProblem(request: NextRequest) {
    return {
      type: `https://seizn.com/errors/${this.problem.code.replaceAll('_', '-')}`,
      ...this.problem,
      instance: new URL(request.url).pathname,
    };
  }
}
