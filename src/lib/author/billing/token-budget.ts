import { randomUUID } from "crypto";
import { getStripeClient } from "@/lib/stripe";
import { createServerClient, hasServerSupabaseServiceRoleConfig } from "@/lib/supabase";
import {
  getAuthorTierConfig,
  isAuthorBillingTier,
  type AuthorBillingTier,
} from "@/lib/stripe-config";
import { AuthorLlmError } from "@/lib/author/llm/types";
import { getAuthorModelUsageSummary, type AuthorModelUsageSummary } from "@/lib/author/llm/usage-store";

export interface AuthorBillingUsageState {
  plan: string;
  tier: AuthorBillingTier | null;
  tokenCapMonth: number | null;
  tokensUsedMonth: number;
  stripeCustomerId: string | null;
  byokActive: boolean;
}

interface BillingProfileRow {
  plan?: string | null;
  stripe_customer_id?: string | null;
}

export interface AuthorTokenBudgetInput {
  userId: string;
  byokActive: boolean;
  requestedTokens: number;
  usageSummary?: AuthorModelUsageSummary | null;
}

export interface AuthorTokenBudgetResult {
  allowed: true;
  cap: number | null;
  used: number;
  projected: number;
  overageTokens: number;
  metered: boolean;
}

export async function getAuthorBillingUsageState(
  userId: string,
  usageSummary?: AuthorModelUsageSummary | null
): Promise<AuthorBillingUsageState> {
  if (!hasServerSupabaseServiceRoleConfig()) {
    return {
      plan: "free",
      tier: null,
      tokenCapMonth: null,
      tokensUsedMonth: usageSummary?.total_tokens ?? 0,
      stripeCustomerId: null,
      byokActive: usageSummary?.byok_active === true,
    };
  }

  const supabase = createServerClient();
  const [{ data: profile }, usage] = await Promise.all([
    supabase
      .from("profiles")
      .select("plan,stripe_customer_id")
      .eq("id", userId)
      .single<BillingProfileRow>(),
    usageSummary === undefined ? getAuthorModelUsageSummary(userId) : Promise.resolve(usageSummary),
  ]);

  const plan = profile?.plan ?? "free";
  const tier = isAuthorBillingTier(plan) ? plan : null;
  const tokenCapMonth = tier ? getAuthorTierConfig(tier).tokenCapMonth : 0;

  return {
    plan,
    tier,
    tokenCapMonth,
    tokensUsedMonth: usage?.total_tokens ?? 0,
    stripeCustomerId: profile?.stripe_customer_id ?? null,
    byokActive: usage?.byok_active === true,
  };
}

export async function enforceAuthorTokenBudget(
  input: AuthorTokenBudgetInput
): Promise<AuthorTokenBudgetResult> {
  if (input.byokActive) {
    const used = input.usageSummary?.total_tokens ?? 0;
    return {
      allowed: true,
      cap: null,
      used,
      projected: used + Math.max(0, input.requestedTokens),
      overageTokens: 0,
      metered: false,
    };
  }

  const state = await getAuthorBillingUsageState(input.userId, input.usageSummary);
  const used = state.tokensUsedMonth;
  const projected = used + Math.max(0, input.requestedTokens);

  if (input.byokActive || state.byokActive || state.tokenCapMonth === null) {
    return {
      allowed: true,
      cap: state.tokenCapMonth,
      used,
      projected,
      overageTokens: 0,
      metered: false,
    };
  }

  const cap = state.tokenCapMonth;
  if (projected <= cap) {
    return {
      allowed: true,
      cap,
      used,
      projected,
      overageTokens: 0,
      metered: false,
    };
  }

  const overageTokens = projected - cap;
  const metered = await emitAuthorTokenOverage({
    userId: input.userId,
    stripeCustomerId: state.stripeCustomerId,
    overageTokens,
  });

  if (!metered) {
    throw new AuthorLlmError(
      "TOKEN_LIMIT_EXCEEDED",
      "Monthly author token limit exceeded",
      402
    );
  }

  return {
    allowed: true,
    cap,
    used,
    projected,
    overageTokens,
    metered: true,
  };
}

export async function emitAuthorTokenOverage(input: {
  userId: string;
  stripeCustomerId: string | null;
  overageTokens: number;
}): Promise<boolean> {
  if (!input.stripeCustomerId || input.overageTokens <= 0) {
    return false;
  }

  const eventName =
    process.env.STRIPE_METER_ID_MEMORIES?.trim() ||
    process.env.STRIPE_METER_ID_OPS?.trim();
  if (!eventName || !process.env.STRIPE_SECRET_KEY) {
    return false;
  }

  const stripe = getStripeClient();
  await stripe.billing.meterEvents.create({
    event_name: eventName,
    identifier: `author-overage-${input.userId}-${Date.now()}-${randomUUID()}`,
    payload: {
      stripe_customer_id: input.stripeCustomerId,
      value: String(input.overageTokens),
      user_id: input.userId,
    },
  });
  return true;
}
