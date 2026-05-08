import {
  createServerClient,
  hasServerSupabaseServiceRoleConfig,
} from '@/lib/supabase';
import { AuthorLlmError, type AuthorLlmProvider } from './types';

interface ProfilesProviderPrefClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{ data?: { author_llm_provider?: string | null } | null; error?: { message?: string } | null }>;
      };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{ error?: { message?: string } | null }>;
    };
  };
}

const VALID_PROVIDERS: ReadonlySet<AuthorLlmProvider> = new Set([
  'anthropic',
  'google',
  'openai',
]);

function normalize(value: string | null | undefined): AuthorLlmProvider | null {
  const candidate = value?.trim().toLowerCase();
  return candidate && VALID_PROVIDERS.has(candidate as AuthorLlmProvider)
    ? (candidate as AuthorLlmProvider)
    : null;
}

/**
 * Resolves the per-user Author LLM provider preference from `profiles`.
 * Returns null on any of: missing supabase service role config, profile not
 * found, NULL column value, or unrecognized value. Any error is swallowed
 * (logged elsewhere); the router's env / default fallback covers it.
 */
export async function getUserAuthorLlmProvider(
  userId: string,
  client?: ProfilesProviderPrefClient,
): Promise<AuthorLlmProvider | null> {
  if (!hasServerSupabaseServiceRoleConfig()) {
    return null;
  }
  const supabase = (client ?? createServerClient()) as ProfilesProviderPrefClient;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('author_llm_provider')
      .eq('id', userId)
      .maybeSingle();
    return normalize(data?.author_llm_provider ?? null);
  } catch {
    return null;
  }
}

/**
 * Saves the user's preferred provider (or NULL to clear / inherit env default).
 */
export async function setUserAuthorLlmProvider(
  userId: string,
  provider: AuthorLlmProvider | null,
  client?: ProfilesProviderPrefClient,
): Promise<void> {
  if (!hasServerSupabaseServiceRoleConfig()) {
    if (process.env.NODE_ENV === 'production') {
      throw new AuthorLlmError(
        'LLM_NOT_CONFIGURED',
        'Supabase service-role configuration is required to persist provider preference',
      );
    }
    return;
  }
  if (provider !== null && !VALID_PROVIDERS.has(provider)) {
    throw new AuthorLlmError(
      'LLM_NOT_CONFIGURED',
      `Invalid author LLM provider: ${provider}`,
      400,
    );
  }
  const supabase = (client ?? createServerClient()) as ProfilesProviderPrefClient;
  const { error } = await supabase
    .from('profiles')
    .update({ author_llm_provider: provider })
    .eq('id', userId);
  if (error) {
    throw new AuthorLlmError(
      'LLM_NOT_CONFIGURED',
      `Failed to save provider preference: ${error.message ?? 'unknown error'}`,
      500,
    );
  }
}
