import { NextRequest } from 'next/server';
import {
  withAuthorUiService,
} from '@/lib/author/ui';
import { getAuthorModelUsageSummary } from '@/lib/author/llm';
import { getAuthorBillingUsageState } from '@/lib/author/billing/token-budget';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  return withAuthorUiService(request, async (service, userId) => {
    const usage = service.getUsage();
    const modelUsage = await getAuthorModelUsageSummary(userId);
    const billingUsage = await getAuthorBillingUsageState(userId, modelUsage);
    const tokensUsed = modelUsage?.total_tokens ?? usage.tokens_used_month;
    const tokenCap = billingUsage.tier
      ? billingUsage.tokenCapMonth
      : usage.tokens_cap_month ?? null;
    const overageTokens = typeof tokenCap === 'number'
      ? Math.max(0, tokensUsed - tokenCap)
      : 0;

    if (!modelUsage) {
      return {
        ...usage,
        tier: billingUsage.tier ?? usage.tier,
        tokens_cap_month: tokenCap,
        overage_tokens: overageTokens,
        overage_charges_usd: usage.overage_charges_usd ?? 0,
        byok_active: billingUsage.byokActive || usage.byok_active,
      };
    }

    return {
      ...usage,
      tier: billingUsage.tier ?? usage.tier,
      tokens_used_month: tokensUsed,
      tokens_cap_month: tokenCap,
      overage_tokens: overageTokens,
      overage_charges_usd: usage.overage_charges_usd ?? 0,
      byok_active: modelUsage.byok_active || usage.byok_active,
      model_usage: modelUsage,
    };
  });
}
