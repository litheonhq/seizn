import { generateAuthorAnthropic } from './anthropic-client';
import { generateAuthorOpenAi } from './openai-client';
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
): AuthorLlmProvider {
  if (override && VALID_PROVIDERS.has(override)) {
    return override;
  }
  const raw = env.AUTHOR_LLM_PROVIDER?.trim().toLowerCase();
  if (raw === 'openai' || raw === 'anthropic') {
    return raw;
  }
  return 'anthropic';
}

/**
 * Single entry point for the Author LLM stack. Picks the provider based on
 * (in priority order): the request override → AUTHOR_LLM_PROVIDER env →
 * Anthropic default. Always sets effort = AUTHOR_LLM_EFFORT (default xhigh).
 *
 * Both providers expose the same AuthorLlmRequest / AuthorLlmResponse shape,
 * so callers don't need to know which provider answered — only the
 * `response.provider` field tells.
 */
export async function generateAuthorLlm<TJson = unknown>(
  request: AuthorLlmRequest,
): Promise<AuthorLlmResponse<TJson>> {
  const provider = resolveAuthorLlmProvider(request.provider);
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
