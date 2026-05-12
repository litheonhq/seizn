import { timingSafeEqual } from 'crypto';
import { createServerClient } from '@/lib/supabase';
import { InvalidApiKeyError, ScopeDeniedError } from './errors';
import { extractPrefix, hashApiKey } from './generate';
import { recordAudit } from './audit';
import type { ApiKeyRecord, SupabaseLike, ValidatedApiKey } from './types';

type ValidateBearerDeps = {
  supabase?: SupabaseLike;
  updateLastUsed?: boolean;
};

function safeEqualString(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, 'utf8');
  const bBuffer = Buffer.from(b, 'utf8');

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

function normalizeRecord(row: ApiKeyRecord): ValidatedApiKey {
  // Defaults match v9 free tier: 50 calls/day, 30 req/min. A NULL row
  // (legacy data or migration race) used to fall through to 100/month
  // — that gave 3.3 calls/day on average AND let the user spike to 100
  // in a single day, which is neither v8 (100/day) nor v9 (50/day). Now
  // we hard-code v9 free defaults so a missing column never grants a
  // higher tier than the user paid for.
  return {
    apiKeyId: row.id,
    userId: row.user_id,
    orgId: row.org_id ?? row.organization_id ?? null,
    scopes: row.scopes ?? [],
    rateLimitPerMinute: row.rate_limit_per_minute ?? 30,
    monthlyQuota: row.monthly_quota ?? 50,
    monthlyQuotaPeriod: row.monthly_quota_period ?? 'day',
  };
}

export async function validateBearer(
  token: string,
  deps: ValidateBearerDeps = {}
): Promise<ValidatedApiKey> {
  const prefix = extractPrefix(token);
  if (!prefix) {
    throw new InvalidApiKeyError('API key format is invalid');
  }

  const supabase = deps.supabase ?? createServerClient();
  const { data, error } = await supabase
    .from('api_keys')
    .select(
      [
        'id',
        'user_id',
        'org_id',
        'organization_id',
        'scopes',
        'prefix',
        'key_prefix',
        'hash',
        'key_hash',
        'rate_limit_per_minute',
        'monthly_quota',
        'monthly_quota_period',
        'revoked_at',
        'is_active',
      ].join(',')
    )
    .or(`prefix.eq.${prefix},key_prefix.eq.${prefix}`)
    .is('revoked_at', null)
    .maybeSingle();

  if (error || !data) {
    throw new InvalidApiKeyError();
  }

  const row = data as ApiKeyRecord;
  const storedHash = row.hash ?? row.key_hash;
  if (!storedHash || row.is_active === false) {
    throw new InvalidApiKeyError();
  }

  if (!safeEqualString(hashApiKey(token), storedHash)) {
    throw new InvalidApiKeyError();
  }

  if (deps.updateLastUsed !== false) {
    void supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', row.id);
  }

  return normalizeRecord(row);
}

export async function checkScope(
  scopes: string[],
  required: string,
  context?: {
    apiKeyId?: string;
    userId?: string;
    orgId?: string | null;
    supabase?: SupabaseLike;
  }
): Promise<void> {
  const allowed =
    scopes.includes('*') ||
    scopes.includes('admin') ||
    scopes.includes(required) ||
    scopes.includes(`${required.split(':')[0]}:*`);

  if (allowed) {
    return;
  }

  if (context?.apiKeyId && context.userId) {
    await recordAudit({
      apiKeyId: context.apiKeyId,
      userId: context.userId,
      orgId: context.orgId,
      action: 'scope_denied',
      metadata: { required },
      supabase: context.supabase,
    });
  }

  throw new ScopeDeniedError(required);
}
