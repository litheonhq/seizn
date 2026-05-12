import type { Metadata } from "next";
import { getAuthOrReview } from "@/lib/auth-or-review";
import { createServerClient } from "@/lib/supabase";
import {
  aggregateUserUsage,
  getApiKeyUsageBreakdown,
  getUsage,
  type ApiKeyPeriod,
  type UserUsageSummary,
} from "@/lib/api-keys";
import { isTrack2ApiEnabled } from "@/lib/feature-flags/track-2";
import {
  buildTrack2StateFromProfile,
  recoverLiveTrack2ProfileAndKeys,
  type Track2ProfileRow,
} from "@/lib/billing/track2-subscription-state";
import { getDashboardCapabilities } from "@/lib/dashboard-capabilities";
import { WorkspaceShell } from "@/components/dashboard/redesign/workspace-shell";
import ApiKeysClient from "./api-keys-client";
import { TRACK_2_KEY_CAP_PER_USER } from "./constants";

export const metadata: Metadata = {
  title: "API keys — Seizn",
  description: "Manage your Seizn API + MCP keys.",
  robots: { index: false, follow: false },
};

export type ApiKeySummary = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  monthlyQuota: number;
  monthlyQuotaPeriod: ApiKeyPeriod;
  rateLimitPerMinute: number;
  used: number;
  createdAt: string | null;
  lastUsedAt: string | null;
};

async function loadKeys(userId: string): Promise<ApiKeySummary[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select(
      "id, name, prefix, key_prefix, scopes, monthly_quota, monthly_quota_period, rate_limit_per_minute, created_at, last_used_at"
    )
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  type ApiKeyRow = {
    id: string;
    name: string | null;
    prefix: string | null;
    key_prefix: string | null;
    scopes: string[] | null;
    monthly_quota: number | null;
    monthly_quota_period: string | null;
    rate_limit_per_minute: number | null;
    created_at: string | null;
    last_used_at: string | null;
  };

  const rows = data as unknown as ApiKeyRow[];

  const usages = await Promise.all(
    rows.map((row) =>
      getUsage(row.id, (row.monthly_quota_period as ApiKeyPeriod) ?? "month").catch(() => 0)
    )
  );

  return rows.map((row, index) => ({
    id: row.id,
    name: row.name ?? "Untitled key",
    prefix: row.prefix ?? row.key_prefix ?? "sk_seizn_…",
    scopes: row.scopes ?? [],
    monthlyQuota: row.monthly_quota ?? 0,
    monthlyQuotaPeriod: (row.monthly_quota_period as ApiKeyPeriod) ?? "month",
    rateLimitPerMinute: row.rate_limit_per_minute ?? 0,
    used: usages[index],
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }));
}

async function recoverTrack2Entitlements(userId: string): Promise<void> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("profiles")
    .select([
      "stripe_customer_id",
      "track2_tier",
      "track2_subscription_id",
      "track2_subscription_status",
      "track2_price_id",
      "track2_billing_cadence",
      "track2_price_lock_version",
      "track2_current_period_start",
      "track2_current_period_end",
      "track2_subscription_renews_at",
      "track2_subscription_cancelled",
      "track2_subscription_payment_failed",
      "track2_subscription_payment_failed_at",
    ].join(","))
    .eq("id", userId)
    .single<Track2ProfileRow & { stripe_customer_id?: string | null }>();

  const stored = data ? buildTrack2StateFromProfile(data) : null;
  if (stored && stored.status !== "cancelled" && stored.status !== "incomplete") {
    return;
  }

  try {
    await recoverLiveTrack2ProfileAndKeys(
      supabase as unknown as Parameters<typeof recoverLiveTrack2ProfileAndKeys>[0],
      userId,
      data?.stripe_customer_id ?? null,
    );
  } catch (error) {
    console.error("[track2] API key page entitlement recovery failed", { userId, error });
  }
}

export default async function ApiKeysPage() {
  const { user } = await getAuthOrReview();
  const userName = user.name ?? user.email ?? "Author";
  const capabilities = getDashboardCapabilities(user);
  if (!isTrack2ApiEnabled()) {
    return (
      <WorkspaceShell
        userName={userName}
        userPlanLabel="Studio"
        currentLabel="API keys"
        capabilities={capabilities}
      >
        <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg-app)]">
          <section className="mx-auto w-full max-w-2xl px-6 py-16 text-szn-text-1">
          <h1 className="font-serif text-3xl">API keys — coming soon</h1>
          <p className="mt-3 text-sm text-szn-text-2">
            Track 2 (REST API + MCP server) is rolling out in waves. We&apos;ll email you the moment your account is unlocked.
          </p>
          <p className="mt-2 text-sm text-szn-text-2">
            Need early access for a Studio or Enterprise team? <a className="underline" href="mailto:sales@seizn.com">sales@seizn.com</a>.
          </p>
          </section>
        </main>
      </WorkspaceShell>
    );
  }
  if (user.id !== "review") {
    await recoverTrack2Entitlements(user.id);
  }
  const keys = user.id === "review" ? [] : await loadKeys(user.id);
  const usage = user.id === "review" ? null : await loadUsageSummary(keys);
  return (
    <WorkspaceShell
      userName={userName}
      userPlanLabel="Studio"
      currentLabel="API keys"
      capabilities={capabilities}
    >
      <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg-app)]">
        <ApiKeysClient initialKeys={keys} cap={TRACK_2_KEY_CAP_PER_USER} initialUsage={usage} />
      </main>
    </WorkspaceShell>
  );
}

async function loadUsageSummary(keys: ApiKeySummary[]): Promise<UserUsageSummary | null> {
  if (keys.length === 0) {
    return aggregateUserUsage([]);
  }
  const breakdowns = await Promise.all(
    keys.map((key) => getApiKeyUsageBreakdown(key.id, "month").catch(() => ({
      apiKeyId: key.id,
      total: key.used,
      cost_usd_milli: 0,
      byTool: [],
      byModel: [],
      daily: [],
    }))),
  );
  return aggregateUserUsage(breakdowns);
}
