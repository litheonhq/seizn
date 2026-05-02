import { NextRequest } from 'next/server';
import {
  withAuthorUiService,
} from '@/lib/author/ui';
import { getAuthorModelUsageSummary } from '@/lib/author/llm';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  return withAuthorUiService(request, async (service, userId) => {
    const usage = service.getUsage();
    const modelUsage = await getAuthorModelUsageSummary(userId);
    if (!modelUsage) {
      return usage;
    }

    return {
      ...usage,
      tokens_used_month: modelUsage.total_tokens,
      byok_active: modelUsage.byok_active || usage.byok_active,
      model_usage: modelUsage,
    };
  });
}
