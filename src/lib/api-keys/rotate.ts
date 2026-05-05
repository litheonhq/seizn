import { createServerClient } from '@/lib/supabase';
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

  const { error: revokeError } = await supabase
    .from('api_keys')
    .update({ revoked_at: now, is_active: false, updated_at: now })
    .eq('id', input.oldKeyId)
    .eq('user_id', input.userId);

  if (revokeError) {
    throw revokeError;
  }

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
      scopes: input.scopes ?? ['recall', 'remember', 'graph', 'search'],
      rate_limit_per_minute: 30,
      monthly_quota: 100,
      monthly_quota_period: 'day',
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
