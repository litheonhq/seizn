import type { Locale } from "@/i18n/config";

export type ByokKeyStatus = "active" | "invalid" | "missing" | "error";

export interface ByokState {
  enabled: boolean;
  provider: "anthropic" | "openai" | string | null;
  key_last_4?: string | null;
  verified_at?: string | null;
  status: ByokKeyStatus;
}

export interface SubscriptionState {
  plan: string;
  tier: string | null;
  tier_label: string;
  status: string;
  current_period_end: string | null;
  renews_at: string | null;
  trial_ends_at: string | null;
  trial_days_remaining: number | null;
  cancel_at_period_end: boolean;
  payment_failed: boolean;
  byok_active: boolean;
  stripe_price_id?: string | null;
  billing_cadence?: "monthly" | "yearly" | null;
  price_lock_version: string;
  track2?: Track2SubscriptionState | null;
  usage?: {
    tokens_used_month?: number;
    tokens_cap_month?: number | null;
    request_count?: number;
    byok_active?: boolean;
  };
}

export interface Track2SubscriptionState {
  channel: "track2";
  catalog: "v9" | "v8";
  tier: string;
  tier_label: string;
  status: string;
  stripe_status: string | null;
  stripe_subscription_id_present: boolean;
  subscription_id: string | null;
  stripe_price_id: string | null;
  billing_cadence: "monthly" | "yearly" | null;
  current_period_start: string | null;
  current_period_end: string | null;
  renews_at: string | null;
  cancel_at_period_end: boolean;
  payment_failed: boolean;
  payment_failed_at: string | null;
  price_lock_version: string;
  price_label: string;
  quota: {
    calls: number;
    period: "day" | "month";
    rate_limit_per_minute: number;
    scopes: string[];
  };
}

export interface UsageState {
  tokens_used_month: number;
  tokens_cap_month: number | null;
  overage_tokens: number;
  overage_charges_usd: number;
  byok_active: boolean;
  tier?: string | null;
}

export interface AuthorSettingsCopy {
  eyebrow: string;
  title: string;
  subtitle: string;
  refresh: string;
  loading: string;
  loadError: string;
  byok: {
    title: string;
    description: string;
    status: string;
    active: string;
    missing: string;
    error: string;
    lastFour: string;
    keyLabel: string;
    keyPlaceholder: string;
    save: string;
    saving: string;
    remove: string;
    removing: string;
    keyHint: string;
    helper: {
      title: string;
      buttonLabel: string;
      buttonAriaLabel: string;
      step1: string;
      step2: string;
      step3: string;
      step4: string;
    };
  };
  subscription: {
    title: string;
    description: string;
    currentPlan: string;
    status: string;
    trial: string;
    noTrial: string;
    renews: string;
    manage: string;
    opening: string;
    paymentFailed: string;
  };
  usage: {
    title: string;
    description: string;
    monthlyTokens: string;
    requests: string;
    overage: string;
    unlimitedByok: string;
    of: string;
  };
  sync: {
    title: string;
    description: string;
    status: string;
    comingSoon: string;
  };
}

export const DEFAULT_BYOK_STATE: ByokState = {
  enabled: false,
  provider: null,
  key_last_4: null,
  verified_at: null,
  status: "missing",
};

export const DEFAULT_SUBSCRIPTION_STATE: SubscriptionState = {
  plan: "free",
  tier: null,
  tier_label: "Free",
  status: "inactive",
  current_period_end: null,
  renews_at: null,
  trial_ends_at: null,
  trial_days_remaining: null,
  cancel_at_period_end: false,
  payment_failed: false,
  byok_active: false,
  price_lock_version: "v9",
  track2: null,
  usage: {
    tokens_used_month: 0,
    tokens_cap_month: null,
    request_count: 0,
    byok_active: false,
  },
};

export const DEFAULT_USAGE_STATE: UsageState = {
  tokens_used_month: 0,
  tokens_cap_month: null,
  overage_tokens: 0,
  overage_charges_usd: 0,
  byok_active: false,
  tier: null,
};

export function getUsagePercent(used: number, cap: number | null | undefined): number {
  if (!cap || cap <= 0) return 0;
  return Math.min(100, Math.round((used / cap) * 100));
}

export function formatTokenCount(value: number): string {
  if (value >= 1_000_000) {
    const amount = value / 1_000_000;
    return `${amount.toFixed(Number.isInteger(amount) ? 0 : 1)}M`;
  }
  if (value >= 1_000) {
    const amount = value / 1_000;
    return `${amount.toFixed(Number.isInteger(amount) ? 0 : 1)}K`;
  }
  return value.toLocaleString("en");
}

export function formatDate(value: string | null | undefined, locale: Locale | "zh" = "en"): string {
  if (!value) return "—";
  const normalizedLocale = locale === "zh" ? "zh-hans" : locale;
  return new Intl.DateTimeFormat(normalizedLocale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
