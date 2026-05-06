import { getUserAuthorLlmProvider } from './user-provider-pref';
import type { AuthorLlmProvider } from './types';

const VALID_PROVIDERS: ReadonlySet<AuthorLlmProvider> = new Set(['anthropic', 'openai']);

function readEnvProvider(env: NodeJS.ProcessEnv = process.env): AuthorLlmProvider | null {
  const raw = env.AUTHOR_LLM_PROVIDER?.trim().toLowerCase();
  return raw === 'openai' || raw === 'anthropic' ? raw : null;
}

/**
 * Single source of truth for "what provider is active for this user right now".
 *
 * Resolution priority (highest first):
 *   1. `override` argument — caller has an explicit choice (e.g., the LLM
 *      request itself carries `request.provider`)
 *   2. per-user dashboard preference (`profiles.author_llm_provider`)
 *   3. `AUTHOR_LLM_PROVIDER` env var (deployment-wide default)
 *   4. `'anthropic'` hard fallback
 *
 * Audit M3 (2026-05-07): before this helper, two call sites read the env var
 * with diverging logic — `provider-router` honored user pref + env, while
 * `byok-resolver.getAuthorByokStatus` only read env. Result: a user who
 * picked OpenAI in the dashboard saw "Anthropic configured" in the BYOK
 * panel because the panel was reading the env, not their preference.
 *
 * Both call sites now go through this function so the answer is always the
 * same regardless of where in the codebase you ask.
 */
export async function getActiveAuthorProvider(
  userId: string,
  override?: AuthorLlmProvider | null,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AuthorLlmProvider> {
  if (override && VALID_PROVIDERS.has(override)) {
    return override;
  }
  const userPref = await getUserAuthorLlmProvider(userId);
  if (userPref && VALID_PROVIDERS.has(userPref)) {
    return userPref;
  }
  return readEnvProvider(env) ?? 'anthropic';
}

/**
 * Synchronous variant for code paths that already have the user-pref value
 * (e.g., the request handler looked it up earlier and wants to stay on the
 * hot path without a second DB hit). Behaviour is identical otherwise.
 */
export function getActiveAuthorProviderSync(
  override: AuthorLlmProvider | undefined | null,
  userPref: AuthorLlmProvider | null,
  env: NodeJS.ProcessEnv = process.env,
): AuthorLlmProvider {
  if (override && VALID_PROVIDERS.has(override)) {
    return override;
  }
  if (userPref && VALID_PROVIDERS.has(userPref)) {
    return userPref;
  }
  return readEnvProvider(env) ?? 'anthropic';
}
