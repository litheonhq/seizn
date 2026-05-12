import {
  V9_TRACK2_PRODUCTS,
  V9_TRACK2_QUOTA,
  resolveV9CharterStatus,
  type V9BillingCadence,
  type V9Track2Tier,
} from "@/lib/billing/v9-products";

export function formatTrack2Usd(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  });
}

export function formatTrack2Price(
  tier: V9Track2Tier,
  cadence: V9BillingCadence = "monthly"
): string {
  if (tier === "enterprise") return "Contact us";

  const product = V9_TRACK2_PRODUCTS[tier];
  if (tier === "free") return "$0";

  const isCharter = resolveV9CharterStatus() === "charter";
  const value =
    cadence === "yearly"
      ? isCharter
        ? product.annualCharterUsd ?? product.annualUsd
        : product.annualUsd
      : isCharter
        ? product.monthlyCharterUsd ?? product.monthlyUsd
        : product.monthlyUsd;

  if (value === null) return "Contact us";
  return `$${formatTrack2Usd(value)}${cadence === "yearly" ? "/yr" : "/mo"}`;
}

export function formatTrack2RegularPrice(
  tier: V9Track2Tier,
  cadence: V9BillingCadence = "monthly"
): string | null {
  if (tier === "free" || tier === "enterprise") return null;

  const product = V9_TRACK2_PRODUCTS[tier];
  const value = cadence === "yearly" ? product.annualUsd : product.monthlyUsd;
  if (value === null) return null;
  return `$${formatTrack2Usd(value)}${cadence === "yearly" ? "/yr" : "/mo"}`;
}

export function formatTrack2Quota(tier: V9Track2Tier): string {
  if (tier === "enterprise") return "Custom";

  const quota = V9_TRACK2_QUOTA[tier];
  const period = quota.monthlyQuotaPeriod === "day" ? "day" : "mo";
  return `${quota.monthlyQuota.toLocaleString("en-US")} calls/${period}`;
}

export function formatTrack2Rate(tier: V9Track2Tier): string {
  if (tier === "enterprise") return "Custom";
  return `${V9_TRACK2_QUOTA[tier].rateLimitPerMinute.toLocaleString("en-US")}/min`;
}

export function formatTrack2Scopes(tier: V9Track2Tier): string {
  if (tier === "enterprise") return "All + custom scopes";
  return V9_TRACK2_QUOTA[tier].scopes.join(", ");
}
