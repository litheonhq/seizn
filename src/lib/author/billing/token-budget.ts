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
  stripeCustomerId: string | null;
}

export interface AuthorTokenMeterResult {
  metered: boolean;
  overageTokens: number;
  actualProjected: number;
}

export interface AuthorTokenEstimateInput {
  prompt: string;
  system?: string;
  maxTokens: number;
  responseFormat?: string;
}

export interface AuthorBillableUsageInput {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export interface AuthorBillableUsageTokens {
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

const JSON_RESPONSE_INSTRUCTION_TOKENS = 12;
const CACHE_CREATION_TOKEN_WEIGHT = 1.25;
const CACHE_READ_TOKEN_WEIGHT = 0.1;

export async function getAuthorBillingUsageState(
  userId: string,
  usageSummary?: AuthorModelUsageSummary | null,
  currentByokActive = false
): Promise<AuthorBillingUsageState> {
  if (!hasServerSupabaseServiceRoleConfig()) {
    return {
      plan: "free",
      tier: null,
      tokenCapMonth: null,
      tokensUsedMonth: usageSummary?.total_tokens ?? 0,
      stripeCustomerId: null,
      byokActive: currentByokActive,
    };
  }

  const supabase = createServerClient();
  const [{ data: profile }, usage] = await Promise.all([
    supabase
      .from("profiles")
      .select("plan,stripe_customer_id")
      .eq("id", userId)
      .single<BillingProfileRow>(),
    usageSummary === undefined
      ? getAuthorModelUsageSummary(userId, undefined, currentByokActive)
      : Promise.resolve(usageSummary),
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
    byokActive: currentByokActive,
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
      stripeCustomerId: null,
    };
  }

  const state = await getAuthorBillingUsageState(input.userId, input.usageSummary, input.byokActive);
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
      stripeCustomerId: state.stripeCustomerId,
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
      stripeCustomerId: state.stripeCustomerId,
    };
  }

  const overageTokens = projected - cap;
  if (!hasAuthorTokenMeterPath(state.stripeCustomerId)) {
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
    metered: false,
    stripeCustomerId: state.stripeCustomerId,
  };
}

export async function meterAuthorTokenOverage(input: {
  userId: string;
  byokActive: boolean;
  actualTotalTokens: number;
  budget: AuthorTokenBudgetResult;
}): Promise<AuthorTokenMeterResult> {
  const actualTokens = Math.max(0, Math.floor(input.actualTotalTokens));
  const cap = input.budget.cap;
  const actualProjected = input.budget.used + actualTokens;

  if (input.byokActive || cap === null) {
    return {
      metered: false,
      overageTokens: 0,
      actualProjected,
    };
  }

  const alreadyBillableThrough = Math.max(cap, input.budget.used);
  const overageTokens = Math.max(0, actualProjected - alreadyBillableThrough);
  if (overageTokens <= 0) {
    return {
      metered: false,
      overageTokens: 0,
      actualProjected,
    };
  }

  const metered = await emitAuthorTokenOverage({
    userId: input.userId,
    stripeCustomerId: input.budget.stripeCustomerId,
    overageTokens,
  });

  if (!metered) {
    throw new AuthorLlmError(
      "TOKEN_LIMIT_EXCEEDED",
      "Monthly author token overage could not be metered",
      402
    );
  }

  return {
    metered: true,
    overageTokens,
    actualProjected,
  };
}

export function estimateAuthorRequestTotalTokens(input: AuthorTokenEstimateInput): number {
  return (
    estimateAuthorTextTokens(input.prompt) +
    estimateAuthorTextTokens(input.system ?? "") +
    (input.responseFormat === "json" ? JSON_RESPONSE_INSTRUCTION_TOKENS : 0) +
    Math.max(0, Math.floor(input.maxTokens))
  );
}

export function calculateAuthorBillableUsageTokens(
  usage: AuthorBillableUsageInput | null | undefined
): AuthorBillableUsageTokens {
  const inputTokens = readUsageTokenCount(usage?.input_tokens);
  const outputTokens = readUsageTokenCount(usage?.output_tokens);
  const cacheCreationInputTokens = readUsageTokenCount(usage?.cache_creation_input_tokens);
  const cacheReadInputTokens = readUsageTokenCount(usage?.cache_read_input_tokens);
  const weightedCacheTokens = Math.ceil(
    (cacheCreationInputTokens * CACHE_CREATION_TOKEN_WEIGHT) +
    (cacheReadInputTokens * CACHE_READ_TOKEN_WEIGHT)
  );
  const tokensIn = inputTokens + weightedCacheTokens;

  return {
    tokensIn,
    tokensOut: outputTokens,
    totalTokens: tokensIn + outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
  };
}

function estimateAuthorTextTokens(text: string): number {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return 0;

  let cjkCharacters = 0;
  for (const char of normalized) {
    if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(char)) {
      cjkCharacters += 1;
    }
  }

  const nonCjkCharacters = Math.max(0, normalized.length - cjkCharacters);
  return Math.ceil(nonCjkCharacters / 4) + cjkCharacters;
}

function readUsageTokenCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

export async function emitAuthorTokenOverage(input: {
  userId: string;
  stripeCustomerId: string | null;
  overageTokens: number;
}): Promise<boolean> {
  if (!input.stripeCustomerId || input.overageTokens <= 0) {
    return false;
  }

  const eventName = readAuthorTokenMeterEventName();
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

function hasAuthorTokenMeterPath(stripeCustomerId: string | null): boolean {
  return Boolean(stripeCustomerId && readAuthorTokenMeterEventName() && process.env.STRIPE_SECRET_KEY);
}

function readAuthorTokenMeterEventName(): string | null {
  return (
    process.env.STRIPE_METER_ID_MEMORIES?.trim() ||
    process.env.STRIPE_METER_ID_OPS?.trim() ||
    null
  );
}
