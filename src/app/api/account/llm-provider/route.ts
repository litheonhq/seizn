import { NextRequest } from 'next/server';
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

export const runtime = 'nodejs';

function normalizeProviderInput(value: unknown): AuthorLlmProvider | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === '' || normalized === 'default' || normalized === 'inherit') {
    return null;
  }
  if (normalized === 'anthropic' || normalized === 'openai') {
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
    const body = await readJsonBody(request);
    const next = normalizeProviderInput(body.provider);
    if (next === undefined) {
      throw new AuthorUiValidationError(
        "provider must be 'anthropic', 'openai', or null/'default' to clear",
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
