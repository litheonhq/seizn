import { createServerClient } from '@/lib/supabase';
import { V9_TRACK2_QUOTA } from '@/lib/billing/v9-products';
import { generateApiKey } from './generate';
import { recordAudit } from './audit';
import type { SupabaseLike } from './types';

type RotateInput = {
  oldKeyId: string;
  userId: string;
  orgId?: string | null;
  name?: string;
  scopes?: string[];
  supabase?: SupabaseLike;
};

export async function rotateApiKey(input: RotateInput) {
  const supabase = input.supabase ?? createServerClient();
  const generated = generateApiKey();
  const now = new Date().toISOString();

  // Read the old key's quota/scopes BEFORE revoking so we can preserve the
  // user's current tier across rotation. Pre-fix the function reset every
  // rotation back to v8 free defaults — a Studio user rotating their key
  // would silently downgrade to 100/day until the next webhook event.
  const existingResult = await supabase
    .from('api_keys')
    .select('scopes, rate_limit_per_minute, monthly_quota, monthly_quota_period')
    .eq('id', input.oldKeyId)
    .eq('user_id', input.userId)
    .single();
  const existingKey = existingResult.data as
    | {
        scopes: string[] | null;
        rate_limit_per_minute: number | null;
        monthly_quota: number | null;
        monthly_quota_period: string | null;
      }
    | null;

  const { error: revokeError } = await supabase
    .from('api_keys')
    .update({ revoked_at: now, is_active: false })
    .eq('id', input.oldKeyId)
    .eq('user_id', input.userId);

  if (revokeError) {
    throw revokeError;
  }

  const freeDefaults = V9_TRACK2_QUOTA.free;
  const { data, error: insertError } = await supabase
    .from('api_keys')
    .insert({
      user_id: input.userId,
      org_id: input.orgId ?? null,
      name: input.name ?? 'Rotated Track 2 API key',
      prefix: generated.prefix,
      key_prefix: generated.prefix,
      hash: generated.hash,
      key_hash: generated.hash,
      scopes: input.scopes ?? existingKey?.scopes ?? [...freeDefaults.scopes],
      rate_limit_per_minute: existingKey?.rate_limit_per_minute ?? freeDefaults.rateLimitPerMinute,
      monthly_quota: existingKey?.monthly_quota ?? freeDefaults.monthlyQuota,
      monthly_quota_period:
        existingKey?.monthly_quota_period ?? freeDefaults.monthlyQuotaPeriod,
      rotated_from_id: input.oldKeyId,
      is_active: true,
    })
    .select('id')
    .single();

  if (insertError) {
    throw insertError;
  }

  await recordAudit({
    apiKeyId: input.oldKeyId,
    userId: input.userId,
    orgId: input.orgId,
    action: 'rotated',
    metadata: { newApiKeyId: data.id },
    supabase,
  });

  return {
    id: data.id,
    key: generated.key,
    prefix: generated.prefix,
    hash: generated.hash,
    rotatedFromId: input.oldKeyId,
  };
}
