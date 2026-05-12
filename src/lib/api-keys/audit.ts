import { createServerClient } from '@/lib/supabase';
import type { ApiKeyAuditAction, SupabaseLike } from './types';

type RecordAuditInput = {
  apiKeyId?: string | null;
  userId: string;
  orgId?: string | null;
  action: ApiKeyAuditAction;
  metadata?: Record<string, unknown>;
  supabase?: SupabaseLike;
};

export async function recordAudit(input: RecordAuditInput): Promise<void> {
  const supabase = input.supabase ?? createServerClient();
  const { error } = await supabase.from('api_key_audit_log').insert({
    api_key_id: input.apiKeyId ?? null,
    user_id: input.userId,
    org_id: input.orgId ?? null,
    action: input.action,
    metadata: input.metadata ?? {},
  });

  if (error) {
    console.error('[track2-api-keys] audit insert failed', {
      action: input.action,
      apiKeyId: input.apiKeyId ?? null,
      message: error.message,
    });
  }
}
