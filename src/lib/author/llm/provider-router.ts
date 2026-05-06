import { generateAuthorAnthropic } from './anthropic-client';
import { getActiveAuthorProvider, getActiveAuthorProviderSync } from './active-provider';
import { generateAuthorOpenAi } from './openai-client';
import {
  AuthorLlmError,
  type AuthorLlmProvider,
  type AuthorLlmRequest,
  type AuthorLlmResponse,
} from './types';

/**
 * Synchronous resolver — kept for callers that already have the user-pref
 * value in hand and want to avoid the async DB hit in `getActiveAuthorProvider`.
 * The full priority chain (override → user-pref → env → default) lives in
 * `active-provider.ts` so this and the async path can never disagree.
 */
export function resolveAuthorLlmProvider(
  override: AuthorLlmProvider | undefined,
  env: NodeJS.ProcessEnv = process.env,
  userPreference?: AuthorLlmProvider | null,
): AuthorLlmProvider {
  return getActiveAuthorProviderSync(override, userPreference ?? null, env);
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
  // Single source of truth: getActiveAuthorProvider runs the full priority
  // chain (request override → user pref → env → default) and skips the DB
  // lookup when override exists. BYOK status panel uses the same helper, so
  // the two surfaces can never disagree about which provider is "active".
  const provider = await getActiveAuthorProvider(request.userId, request.provider);
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
