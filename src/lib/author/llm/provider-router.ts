import { generateAuthorAnthropic } from './anthropic-client';
import { generateAuthorOpenAi } from './openai-client';
import { getUserAuthorLlmProvider } from './user-provider-pref';
import {
  AuthorLlmError,
  type AuthorLlmProvider,
  type AuthorLlmRequest,
  type AuthorLlmResponse,
} from './types';

const VALID_PROVIDERS: ReadonlySet<AuthorLlmProvider> = new Set(['anthropic', 'openai']);

export function resolveAuthorLlmProvider(
  override: AuthorLlmProvider | undefined,
  env: NodeJS.ProcessEnv = process.env,
  userPreference?: AuthorLlmProvider | null,
): AuthorLlmProvider {
  if (override && VALID_PROVIDERS.has(override)) {
    return override;
  }
  if (userPreference && VALID_PROVIDERS.has(userPreference)) {
    return userPreference;
  }
  const raw = env.AUTHOR_LLM_PROVIDER?.trim().toLowerCase();
  if (raw === 'openai' || raw === 'anthropic') {
    return raw;
  }
  return 'anthropic';
}

/**
 * Single entry point for the Author LLM stack. Picks the provider based on
 * (in priority order):
 *   1. request.provider explicit override
 *   2. profiles.author_llm_provider (per-user dashboard preference)
 *   3. AUTHOR_LLM_PROVIDER env
 *   4. 'anthropic' default
 *
 * Always sets effort = AUTHOR_LLM_EFFORT (default xhigh).
 *
 * Both providers expose the same AuthorLlmRequest / AuthorLlmResponse shape,
 * so callers don't need to know which provider answered — only the
 * `response.provider` field tells.
 */
export async function generateAuthorLlm<TJson = unknown>(
  request: AuthorLlmRequest,
): Promise<AuthorLlmResponse<TJson>> {
  // Per-user preference is only consulted when the caller didn't pin a
  // provider — keeps the lookup off the hot path for hard-coded internals.
  const userPreference = request.provider
    ? null
    : await getUserAuthorLlmProvider(request.userId);
  const provider = resolveAuthorLlmProvider(request.provider, process.env, userPreference);
  switch (provider) {
    case 'anthropic':
      return generateAuthorAnthropic<TJson>(request);
    case 'openai':
      return generateAuthorOpenAi<TJson>(request);
    default:
      throw new AuthorLlmError(
        'LLM_NOT_CONFIGURED',
        `Unsupported author LLM provider: ${provider}`,
      );
  }
}
