import { NextRequest } from 'next/server';
import {
  withAuthorUiService,
} from '@/lib/author/ui';
import { getAuthorByokStatus, getAuthorModelUsageSummary } from '@/lib/author/llm';
import { getAuthorBillingUsageState } from '@/lib/author/billing/token-budget';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  return withAuthorUiService(request, async (service, userId) => {
    const usage = service.getUsage();
    // Degrade gracefully on BYOK status read failure — show usage with
    // managed-key billing assumed rather than 503 the whole usage tab.
    // The DELETE flow in /api/account/byok keeps the strict throw because
    // there it gates a Stripe coupon decision; here it's a display field.
    let byokStatus;
    try {
      byokStatus = await getAuthorByokStatus(userId);
    } catch (byokError) {
      console.error('usage route: getAuthorByokStatus failed, degrading to no-BYOK', byokError);
      byokStatus = { enabled: false, provider: null, status: 'missing' as const };
    }
    const modelUsage = await getAuthorModelUsageSummary(userId, undefined, byokStatus.enabled);
    const billingUsage = await getAuthorBillingUsageState(userId, modelUsage, byokStatus.enabled);
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
        byok_active: billingUsage.byokActive,
      };
    }

    return {
      ...usage,
      tier: billingUsage.tier ?? usage.tier,
      tokens_used_month: tokensUsed,
      tokens_cap_month: tokenCap,
      overage_tokens: overageTokens,
      overage_charges_usd: usage.overage_charges_usd ?? 0,
      byok_active: modelUsage.byok_active,
      model_usage: modelUsage,
    };
  });
}
