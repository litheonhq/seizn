import {
  createServerClient,
  hasServerSupabaseServiceRoleConfig,
} from '@/lib/supabase';
import { AuthorLlmError, type AuthorModelUsageRecord } from './types';

export interface AuthorModelUsageSummary {
  tokens_in: number;
  tokens_out: number;
  total_tokens: number;
  request_count: number;
  byok_had_this_month?: boolean;
  byok_currently_active?: boolean;
  byok_active: boolean;
}

interface UsageStoreClient {
  from: (table: string) => {
    insert?: (record: Record<string, unknown>) => Promise<{ error?: { message?: string } | null }>;
    select?: (columns: string) => {
      eq: (column: string, value: string) => {
        gte: (column: string, value: string) => Promise<{
          data?: Array<{
            tokens_in?: number | null;
            tokens_out?: number | null;
            byok?: boolean | null;
          }> | null;
          error?: { message?: string } | null;
        }>;
      };
    };
  };
}

export async function recordAuthorModelUsage(
  input: AuthorModelUsageRecord,
  client?: UsageStoreClient
): Promise<void> {
  if (!hasServerSupabaseServiceRoleConfig()) {
    if (process.env.NODE_ENV === 'production') {
      throw new AuthorLlmError(
        'MODEL_USAGE_RECORD_FAILED',
        'Supabase service-role configuration is required to persist model usage'
      );
    }
    return;
  }

  const supabase = client ?? createServerClient();
  const modelUsage = supabase.from('model_usage');
  if (typeof modelUsage.insert !== 'function') {
    throw new AuthorLlmError('MODEL_USAGE_RECORD_FAILED', 'model_usage insert client is unavailable');
  }

  const { error } = await modelUsage.insert({
    user_id: input.userId,
    project_id: input.projectId,
    provider: input.provider,
    model: input.model,
    tokens_in: input.tokensIn,
    tokens_out: input.tokensOut,
    cost_usd: input.costUsd ?? null,
    byok: input.byok,
    request_id: input.requestId ?? null,
  });

  if (error) {
    throw new AuthorLlmError(
      'MODEL_USAGE_RECORD_FAILED',
      `Failed to persist model usage: ${error.message ?? 'unknown error'}`
    );
  }
}

export async function getAuthorModelUsageSummary(
  userId: string,
  client?: UsageStoreClient,
  currentByokActive = false
): Promise<AuthorModelUsageSummary | null> {
  if (!hasServerSupabaseServiceRoleConfig()) {
    return null;
  }

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const supabase = client ?? createServerClient();
  const modelUsage = supabase.from('model_usage');
  if (typeof modelUsage.select !== 'function') return null;

  const { data, error } = await modelUsage
    .select('tokens_in,tokens_out,byok')
    .eq('user_id', userId)
    .gte('created_at', monthStart.toISOString());

  if (error || !data) {
    return null;
  }

  return data.reduce<AuthorModelUsageSummary>((summary, row) => {
    const tokensIn = row.tokens_in ?? 0;
    const tokensOut = row.tokens_out ?? 0;
    summary.tokens_in += tokensIn;
    summary.tokens_out += tokensOut;
    summary.total_tokens += tokensIn + tokensOut;
    summary.request_count += 1;
    summary.byok_had_this_month = summary.byok_had_this_month || row.byok === true;
    return summary;
  }, {
    tokens_in: 0,
    tokens_out: 0,
    total_tokens: 0,
    request_count: 0,
    byok_had_this_month: false,
    byok_currently_active: currentByokActive,
    byok_active: currentByokActive,
  });
}
