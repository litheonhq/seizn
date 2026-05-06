import {
  encryptApiKey,
  generateKeyHint,
  validateKeyFormat,
} from '@/lib/byok/encryption';
import {
  getUserProviderKey,
  recordKeyUsage,
  type Provider,
  type ProviderKey,
} from '@/lib/byok/provider-client';
import {
  createServerClient,
  hasServerSupabaseServiceRoleConfig,
} from '@/lib/supabase';
import { getActiveAuthorProvider } from './active-provider';
import {
  AuthorLlmError,
  type AuthorByokStatus,
  type ResolvedAuthorProviderKey,
} from './types';

type AuthorByokProvider = Extract<Provider, 'anthropic' | 'openai'>;

const AUTHOR_BYOK_PROVIDER: AuthorByokProvider = 'anthropic';
const AUTHOR_BYOK_OPENAI_PROVIDER: AuthorByokProvider = 'openai';

interface ProviderKeyLookup {
  (userId: string, provider: Provider): Promise<ProviderKey | null>;
}

interface ProviderKeyUsageRecorder {
  (keyId: string, costUsd?: number): Promise<void>;
}

interface ProviderKeyClient {
  from: (table: string) => ProviderKeyTable;
}

interface ProviderKeyTable {
  select?: (columns: string) => ProviderKeySelectBuilder;
  update?: (values: Record<string, unknown>) => ProviderKeyFilterBuilder;
  insert?: (values: Record<string, unknown>) => ProviderKeyInsertBuilder;
}

interface ProviderKeySelectBuilder {
  eq: (column: string, value: string | boolean) => ProviderKeySelectBuilder;
  order: (column: string, options?: { ascending?: boolean }) => ProviderKeySelectBuilder;
  limit: (count: number) => ProviderKeySingleBuilder;
  single: () => Promise<ProviderKeySingleResult>;
}

interface ProviderKeySingleBuilder {
  single: () => Promise<ProviderKeySingleResult>;
}

interface ProviderKeyFilterBuilder {
  eq: (column: string, value: string | boolean) => ProviderKeyFilterBuilder;
  then: PromiseLike<ProviderKeyWriteResult>['then'];
}

interface ProviderKeyInsertBuilder {
  select: (columns: string) => ProviderKeyInsertSelectBuilder;
}

interface ProviderKeyInsertSelectBuilder {
  single: () => Promise<ProviderKeySingleResult>;
}

interface ProviderKeySingleResult {
  data?: ProviderKeyRow | null;
  error?: { code?: string; message?: string } | null;
}

interface ProviderKeyWriteResult {
  error?: { code?: string; message?: string } | null;
}

interface ProviderKeyRow {
  id: string;
  provider: Provider;
  key_hint?: string | null;
  is_active?: boolean | null;
  is_default?: boolean | null;
  created_at?: string | null;
}

interface ResolveAuthorProviderKeyDeps {
  lookupProviderKey?: ProviderKeyLookup;
  nodeEnv?: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Provider-agnostic key resolver. Picks the user's BYOK key for the requested
 * provider when present, otherwise falls back to the managed env key. Both
 * `resolveAuthorAnthropicKey` and `resolveAuthorOpenAiKey` are now thin
 * wrappers around this single implementation so future env-fallback or BYOK
 * lookup changes land in one place.
 */
export async function resolveAuthorProviderKey(
  provider: AuthorByokProvider,
  input: { userId: string; projectId?: string },
  deps: ResolveAuthorProviderKeyDeps = {},
): Promise<ResolvedAuthorProviderKey> {
  const lookupProviderKey = deps.lookupProviderKey ?? getUserProviderKey;
  const userKey = await lookupProviderKey(input.userId, provider);
  if (userKey) {
    return {
      apiKey: userKey.apiKey,
      source: 'byok',
      byok: true,
      providerKeyId: userKey.id,
    };
  }

  const env = deps.env ?? process.env;
  const managedKey = readManagedKey(provider, env);
  if (!managedKey) {
    throw new AuthorLlmError(
      'LLM_NOT_CONFIGURED',
      `Managed ${providerLabel(provider)} key is not configured for Author Memory v3`,
    );
  }

  return {
    apiKey: managedKey,
    source: 'managed',
    byok: false,
  };
}

export function resolveAuthorAnthropicKey(
  input: { userId: string; projectId?: string },
  deps: ResolveAuthorProviderKeyDeps = {},
): Promise<ResolvedAuthorProviderKey> {
  return resolveAuthorProviderKey(AUTHOR_BYOK_PROVIDER, input, deps);
}

export function resolveAuthorOpenAiKey(
  input: { userId: string; projectId?: string },
  deps: ResolveAuthorProviderKeyDeps = {},
): Promise<ResolvedAuthorProviderKey> {
  return resolveAuthorProviderKey(AUTHOR_BYOK_OPENAI_PROVIDER, input, deps);
}

export async function recordAuthorByokUsage(
  resolved: ResolvedAuthorProviderKey,
  costUsd = 0,
  recorder: ProviderKeyUsageRecorder = recordKeyUsage
): Promise<void> {
  if (!resolved.providerKeyId) return;
  await recorder(resolved.providerKeyId, costUsd);
}

export async function getAuthorByokStatus(
  userId: string,
  client?: ProviderKeyClient,
  options: { provider?: 'anthropic' | 'openai' } = {},
): Promise<AuthorByokStatus> {
  if (!hasServerSupabaseServiceRoleConfig()) {
    return { enabled: false, provider: null, status: 'missing' };
  }

  // Single source of truth for "active provider for this user" lives in
  // active-provider.ts. Honors per-user dashboard preference + env. The
  // explicit `options.provider` override still wins for callers that want
  // to peek a specific provider's status (e.g., DELETE flow checking the
  // OTHER provider after removing one).
  const targetProvider: Provider = (options.provider
    ?? (await getActiveAuthorProvider(userId))) as Provider;

  const supabase = (client ?? createServerClient()) as ProviderKeyClient;
  const query = supabase
    .from('provider_keys')
    .select?.('id, provider, key_hint, is_active, is_default, created_at');
  if (!query) return { enabled: false, provider: null, status: 'missing' };

  const { data, error } = await query
    .eq('user_id', userId)
    .eq('provider', targetProvider)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return { enabled: false, provider: null, status: 'missing' };
  }

  return {
    enabled: true,
    provider: targetProvider as 'anthropic' | 'openai',
    key_last_4: keyHintToLast4(data.key_hint),
    verified_at: data.created_at ?? null,
    status: 'active',
  };
}


const AUTHOR_BYOK_SUPPORTED_PROVIDERS: ReadonlySet<AuthorByokProvider> = new Set([
  AUTHOR_BYOK_PROVIDER,
  AUTHOR_BYOK_OPENAI_PROVIDER,
]);

function isSupportedAuthorByokProvider(value: string): value is AuthorByokProvider {
  return AUTHOR_BYOK_SUPPORTED_PROVIDERS.has(value as AuthorByokProvider);
}

export async function saveAuthorByokKey(
  input: { userId: string; provider: string; apiKey: string },
  client?: ProviderKeyClient
): Promise<{ valid: true; key_last_4: string; provider: Provider }> {
  if (!isSupportedAuthorByokProvider(input.provider) || !validateKeyFormat(input.provider, input.apiKey)) {
    throw new AuthorLlmError('LLM_NOT_CONFIGURED', 'invalid provider api key', 400);
  }
  const provider: AuthorByokProvider = input.provider;

  if (!hasServerSupabaseServiceRoleConfig()) {
    if (process.env.NODE_ENV === 'production') {
      throw new AuthorLlmError('LLM_NOT_CONFIGURED', 'BYOK storage is not configured', 500);
    }
    return { valid: true, key_last_4: input.apiKey.slice(-4), provider };
  }

  const supabase = (client ?? createServerClient()) as ProviderKeyClient;
  const providerKeys = supabase.from('provider_keys');
  if (typeof providerKeys.update === 'function') {
    await providerKeys
      .update({ is_default: false })
      .eq('user_id', input.userId)
      .eq('provider', provider);
  }

  if (typeof providerKeys.insert !== 'function') {
    throw new AuthorLlmError('LLM_NOT_CONFIGURED', 'BYOK storage client is unavailable', 500);
  }

  const label = `Author Memory v3 ${providerLabel(provider)} ${new Date().toISOString()}`;

  const { data, error } = await providerKeys
    .insert({
      user_id: input.userId,
      provider,
      key_encrypted: encryptApiKey(input.apiKey),
      key_hint: generateKeyHint(input.apiKey),
      label,
      is_default: true,
      is_active: true,
      metadata: { source: 'author_memory_v3' },
    })
    .select('id, provider, key_hint, created_at')
    .single();

  if (error || !data) {
    throw new AuthorLlmError('LLM_NOT_CONFIGURED', 'Failed to save BYOK key', 500);
  }

  return { valid: true, key_last_4: input.apiKey.slice(-4), provider };
}

/**
 * Resolve the managed (server-side, non-BYOK) API key for a provider. Looks up
 * env vars in priority order: provider-specific dev key → namespaced LLM key →
 * Litheon-prefixed key → bare provider key. Same fallback chain for both
 * providers so deployments can be configured uniformly.
 */
function readManagedKey(provider: AuthorByokProvider, env: NodeJS.ProcessEnv): string | null {
  const candidates = MANAGED_KEY_ENV_VARS[provider];
  for (const name of candidates) {
    const value = env[name];
    if (value) return value;
  }
  return null;
}

const MANAGED_KEY_ENV_VARS: Record<AuthorByokProvider, readonly string[]> = {
  anthropic: [
    'AUTHOR_ANTHROPIC_DEV_API_KEY',
    'AUTHOR_LLM_ANTHROPIC_API_KEY',
    'LITHEON_ANTHROPIC_API_KEY',
    'ANTHROPIC_API_KEY',
  ],
  openai: [
    'AUTHOR_OPENAI_DEV_API_KEY',
    'AUTHOR_LLM_OPENAI_API_KEY',
    'LITHEON_OPENAI_API_KEY',
    'OPENAI_API_KEY',
  ],
};

function providerLabel(provider: AuthorByokProvider): string {
  return provider === 'anthropic' ? 'Anthropic' : 'OpenAI';
}

function keyHintToLast4(keyHint?: string | null): string | undefined {
  if (!keyHint) return undefined;
  const trimmed = keyHint.trim();
  return trimmed.length >= 4 ? trimmed.slice(-4) : trimmed;
}
