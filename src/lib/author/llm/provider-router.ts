import { generateAuthorAnthropic } from './anthropic-client';
import { getActiveAuthorProvider, getActiveAuthorProviderSync } from './active-provider';
import { generateAuthorGemini } from './gemini-client';
import { generateAuthorOpenAi } from './openai-client';
import { getManagedEntitlements } from '@/lib/author/billing/managed-entitlements';
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
  const primary = await getActiveAuthorProvider(request.userId, request.provider);

  try {
    return await invokeProvider<TJson>(primary, request);
  } catch (error) {
    if (!shouldFailover(error)) throw error;
    // Charter Managed perk: on rate-limit or 5xx from the primary provider,
    // walk the secondary chain. Only fires when the user has a Managed
    // entitlement. We never failover when the request explicitly named a
    // provider — that signals the caller wants that exact provider's
    // behavior (schema-strict JSON, etc.).
    if (request.provider) throw error;
    if (!(await isMultiProviderFailoverEnabled(request.userId))) throw error;
    // R25 M1 — walk ALL other providers in priority order, not just one.
    // Pre-fix: anthropic+google user (no openai key) would fail anthropic
    // → fallback to openai → LLM_NOT_CONFIGURED → router throws original
    // anthropic error. Now: anthropic → openai (no key) → google (works).
    const fallbackChain = otherProviders(primary);
    let lastInformativeError: unknown = error;
    for (const secondary of fallbackChain) {
      console.warn(
        `[author-llm] failover ${primary} → ${secondary} for user ${request.userId}: ${describeError(lastInformativeError)}`,
      );
      try {
        // Round 5 audit fix: shallow-spread `request` so any caller-supplied
        // effort/model/maxTokens survives the failover; only the provider
        // field gets overridden.
        return await invokeProvider<TJson>(secondary, { ...request, provider: secondary });
      } catch (failoverError) {
        console.error(
          `[author-llm] failover ${primary} → ${secondary} also failed for user ${request.userId}: ${describeError(failoverError)}`,
        );
        // Round 5 audit fix carried forward: LLM_NOT_CONFIGURED on a
        // secondary doesn't update lastInformativeError — keep walking
        // the chain so users with only 2-of-3 providers still benefit.
        if (
          failoverError instanceof AuthorLlmError &&
          failoverError.code === 'LLM_NOT_CONFIGURED'
        ) {
          continue;
        }
        // An informative failure (rate limit, validation, schema) becomes
        // the new "last error" — we'll surface it if no later secondary
        // succeeds.
        lastInformativeError = failoverError;
      }
    }
    // All secondaries exhausted. Surface the most informative error we
    // saw — either the original primary failure (if every secondary just
    // returned LLM_NOT_CONFIGURED) or the last secondary's actual fault.
    throw lastInformativeError;
  }
}

function invokeProvider<TJson>(
  provider: AuthorLlmProvider,
  request: AuthorLlmRequest,
): Promise<AuthorLlmResponse<TJson>> {
  switch (provider) {
    case 'anthropic':
      return generateAuthorAnthropic<TJson>(request);
    case 'openai':
      return generateAuthorOpenAi<TJson>(request);
    case 'google':
      return generateAuthorGemini<TJson>(request);
    default:
      throw new AuthorLlmError(
        'LLM_NOT_CONFIGURED',
        `Unsupported author LLM provider: ${provider}`,
      );
  }
}

// R25 M1 — 3-way failover chain (was single-secondary). Walk in priority
// order so users with any 2-of-3 providers configured still get failover.
// Priority chosen by literary-prose quality:
//   anthropic → openai → google
//   openai    → anthropic → google
//   google    → anthropic → openai
// First in each chain is the closest-capability secondary; the third is
// the catch-all that exists for the "I have keys for X+Z but not Y" case.
function otherProviders(p: AuthorLlmProvider): readonly AuthorLlmProvider[] {
  if (p === 'anthropic') return ['openai', 'google'];
  if (p === 'openai') return ['anthropic', 'google'];
  if (p === 'google') return ['anthropic', 'openai'];
  return [];
}

function shouldFailover(error: unknown): boolean {
  if (error instanceof AuthorLlmError) {
    if (error.code === 'RATE_LIMITED') return true;
    if (typeof error.status === 'number' && error.status >= 500 && error.status < 600) return true;
    return false;
  }
  // Defensive: a non-AuthorLlmError reaching this layer means the client
  // didn't wrap it. We never failover on unknown errors — they could be
  // schema/validation issues that would also fail on the secondary.
  return false;
}

function describeError(error: unknown): string {
  if (error instanceof AuthorLlmError) {
    return `${error.code}${error.status ? ` (${error.status})` : ''}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function isMultiProviderFailoverEnabled(userId: string): Promise<boolean> {
  // CLAUDE.md: "모든 Managed 공통: Multi-provider Auto-failover".
  // Any active Managed entitlement row → failover enabled. BYOK-only tiers
  // (Enterprise) get the perk too because requiresUserApiKey just means
  // they supply their own LLM key — but we still proxy and can still
  // failover if they registered keys for both providers. The byok-resolver
  // will throw BYOK_REQUIRED on the secondary if no key exists, which is
  // not a failover-eligible error per shouldFailover() — so we'll surface
  // the original error instead. Net: safe to enable for all Managed.
  try {
    const entitlements = await getManagedEntitlements(userId);
    return entitlements !== null;
  } catch {
    return false;
  }
}
