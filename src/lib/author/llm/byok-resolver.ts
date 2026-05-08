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
  type ResolvedAuthorAnthropicKey,
} from './types';

const AUTHOR_BYOK_LABEL = 'Author Memory v3 Anthropic';
const AUTHOR_BYOK_PROVIDER: Provider = 'anthropic';
const AUTHOR_BYOK_OPENAI_PROVIDER: Provider = 'openai';
const AUTHOR_BYOK_GOOGLE_PROVIDER: Provider = 'google';

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

export async function resolveAuthorAnthropicKey(
  input: { userId: string; projectId?: string },
  deps: {
    lookupProviderKey?: ProviderKeyLookup;
    nodeEnv?: string;
    env?: NodeJS.ProcessEnv;
  } = {}
): Promise<ResolvedAuthorAnthropicKey> {
  const lookupProviderKey = deps.lookupProviderKey ?? getUserProviderKey;
  const userKey = await lookupProviderKey(input.userId, AUTHOR_BYOK_PROVIDER);
  if (userKey) {
    return {
      apiKey: userKey.apiKey,
      source: 'byok',
      byok: true,
      providerKeyId: userKey.id,
    };
  }

  const env = deps.env ?? process.env;
  const managedKey = readManagedAnthropicKey(env);
  if (!managedKey) {
    throw new AuthorLlmError(
      'LLM_NOT_CONFIGURED',
      'Managed Anthropic key is not configured for Author Memory v3'
    );
  }

  return {
    apiKey: managedKey,
    source: 'managed',
    byok: false,
  };
}

export async function recordAuthorByokUsage(
  resolved: ResolvedAuthorAnthropicKey,
  costUsd = 0,
  recorder: ProviderKeyUsageRecorder = recordKeyUsage
): Promise<void> {
  if (!resolved.providerKeyId) return;
  await recorder(resolved.providerKeyId, costUsd);
}

export async function getAuthorByokStatus(
  userId: string,
  client?: ProviderKeyClient,
  options: { provider?: 'anthropic' | 'google' | 'openai' } = {},
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
    provider: targetProvider as 'anthropic' | 'google' | 'openai',
    key_last_4: keyHintToLast4(data.key_hint),
    verified_at: data.created_at ?? null,
    status: 'active',
  };
}


const AUTHOR_BYOK_SUPPORTED_PROVIDERS: ReadonlySet<Provider> = new Set([
  AUTHOR_BYOK_PROVIDER,
  AUTHOR_BYOK_OPENAI_PROVIDER,
  AUTHOR_BYOK_GOOGLE_PROVIDER,
]);

function isSupportedAuthorByokProvider(value: string): value is Provider {
  return AUTHOR_BYOK_SUPPORTED_PROVIDERS.has(value as Provider);
}

export async function saveAuthorByokKey(
  input: { userId: string; provider: string; apiKey: string },
  client?: ProviderKeyClient
): Promise<{ valid: true; key_last_4: string; provider: Provider }> {
  if (!isSupportedAuthorByokProvider(input.provider) || !validateKeyFormat(input.provider, input.apiKey)) {
    throw new AuthorLlmError('LLM_NOT_CONFIGURED', 'invalid provider api key', 400);
  }
  const provider: Provider = input.provider;

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

  const labelStem = provider === AUTHOR_BYOK_OPENAI_PROVIDER
    ? 'Author Memory v3 OpenAI'
    : provider === AUTHOR_BYOK_GOOGLE_PROVIDER
      ? 'Author Memory v3 Google'
      : AUTHOR_BYOK_LABEL;
  const label = `${labelStem} ${new Date().toISOString()}`;

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

function readManagedAnthropicKey(env: NodeJS.ProcessEnv): string | null {
  return (
    env.AUTHOR_ANTHROPIC_DEV_API_KEY ||
    env.AUTHOR_LLM_ANTHROPIC_API_KEY ||
    env.LITHEON_ANTHROPIC_API_KEY ||
    env.ANTHROPIC_API_KEY ||
    null
  );
}

export async function resolveAuthorOpenAiKey(
  input: { userId: string; projectId?: string },
  deps: {
    lookupProviderKey?: ProviderKeyLookup;
    nodeEnv?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<ResolvedAuthorAnthropicKey> {
  const lookupProviderKey = deps.lookupProviderKey ?? getUserProviderKey;
  const userKey = await lookupProviderKey(input.userId, AUTHOR_BYOK_OPENAI_PROVIDER);
  if (userKey) {
    return {
      apiKey: userKey.apiKey,
      source: 'byok',
      byok: true,
      providerKeyId: userKey.id,
    };
  }

  const env = deps.env ?? process.env;
  const managedKey = readManagedOpenAiKey(env);
  if (!managedKey) {
    throw new AuthorLlmError(
      'LLM_NOT_CONFIGURED',
      'Managed OpenAI key is not configured for Author Memory v3',
    );
  }

  return {
    apiKey: managedKey,
    source: 'managed',
    byok: false,
  };
}

function readManagedOpenAiKey(env: NodeJS.ProcessEnv): string | null {
  return (
    env.AUTHOR_OPENAI_DEV_API_KEY ||
    env.AUTHOR_LLM_OPENAI_API_KEY ||
    env.LITHEON_OPENAI_API_KEY ||
    env.OPENAI_API_KEY ||
    null
  );
}

export async function resolveAuthorGoogleKey(
  input: { userId: string; projectId?: string },
  deps: {
    lookupProviderKey?: ProviderKeyLookup;
    nodeEnv?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<ResolvedAuthorAnthropicKey> {
  const lookupProviderKey = deps.lookupProviderKey ?? getUserProviderKey;
  const userKey = await lookupProviderKey(input.userId, AUTHOR_BYOK_GOOGLE_PROVIDER);
  if (userKey) {
    return {
      apiKey: userKey.apiKey,
      source: 'byok',
      byok: true,
      providerKeyId: userKey.id,
    };
  }

  const env = deps.env ?? process.env;
  const managedKey = readManagedGoogleKey(env);
  if (!managedKey) {
    throw new AuthorLlmError(
      'LLM_NOT_CONFIGURED',
      'Managed Google key is not configured for Author Memory v3',
    );
  }

  return {
    apiKey: managedKey,
    source: 'managed',
    byok: false,
  };
}

function readManagedGoogleKey(env: NodeJS.ProcessEnv): string | null {
  return (
    env.AUTHOR_GOOGLE_DEV_API_KEY ||
    env.AUTHOR_LLM_GOOGLE_API_KEY ||
    env.LITHEON_GOOGLE_API_KEY ||
    env.GOOGLE_API_KEY ||
    env.GEMINI_API_KEY ||
    null
  );
}

function keyHintToLast4(keyHint?: string | null): string | undefined {
  if (!keyHint) return undefined;
  const trimmed = keyHint.trim();
  return trimmed.length >= 4 ? trimmed.slice(-4) : trimmed;
}
