import { NextRequest, NextResponse } from 'next/server';
import {
  AuthorUiValidationError,
  readJsonBody,
  withAuthorUiService,
} from '@/lib/author/ui';
import {
  AuthorLlmError,
  getUserAuthorLlmProvider,
  setUserAuthorLlmProvider,
} from '@/lib/author/llm';
import type { AuthorLlmProvider } from '@/lib/author/llm';
import { checkCustomRateLimitAsync, getRateLimitHeaders } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const PROVIDER_TOGGLE_LIMIT_PER_MIN = 30;
const PROVIDER_TOGGLE_WINDOW_MS = 60 * 1000;

function normalizeProviderInput(value: unknown): AuthorLlmProvider | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === '' || normalized === 'default' || normalized === 'inherit') {
    return null;
  }
  // R26 — 'google' added so users can pick Gemini as their default provider.
  // Pre-fix the route 400'd on Google input even though the type system + DB
  // CHECK both already admit it (after migration 20260507001 + 20260508013).
  if (
    normalized === 'anthropic' ||
    normalized === 'openai' ||
    normalized === 'google'
  ) {
    return normalized;
  }
  return undefined;
}

export async function GET(request: NextRequest) {
  return withAuthorUiService(request, async (_service, userId) => {
    const provider = await getUserAuthorLlmProvider(userId);
    return {
      provider, // 'anthropic' | 'openai' | null (null = inherit env default)
      env_default: process.env.AUTHOR_LLM_PROVIDER?.trim().toLowerCase() ?? 'anthropic',
    };
  });
}

export async function POST(request: NextRequest) {
  return withAuthorUiService(request, async (_service, userId) => {
    // Defense-in-depth: cap toggle frequency to PROVIDER_TOGGLE_LIMIT_PER_MIN
    // per user. CSRF + auth already gate this to logged-in users only, so the
    // blast radius is one user's profiles row, but a malicious script could
    // still saturate write IOPS without this limit.
    const rate = await checkCustomRateLimitAsync(
      `author-llm-provider:${userId}`,
      PROVIDER_TOGGLE_LIMIT_PER_MIN,
      PROVIDER_TOGGLE_WINDOW_MS,
    );
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'rate_limited', limit: rate.limit, reset_at: rate.resetAt },
        { status: 429, headers: getRateLimitHeaders(rate) },
      );
    }

    const body = await readJsonBody(request);
    const next = normalizeProviderInput(body.provider);
    if (next === undefined) {
      throw new AuthorUiValidationError(
        "provider must be 'anthropic', 'openai', 'google', or null/'default' to clear",
      );
    }
    try {
      await setUserAuthorLlmProvider(userId, next);
      return { provider: next };
    } catch (error) {
      if (error instanceof AuthorLlmError && error.status === 400) {
        throw new AuthorUiValidationError(error.message);
      }
      throw error;
    }
  });
}
