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
import DashboardShell from "@/components/dashboard/DashboardShell";
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

export default async function ApiKeysPage() {
  const { user } = await getAuthOrReview();
  if (!isTrack2ApiEnabled()) {
    return (
      <DashboardShell>
        <section className="mx-auto w-full max-w-2xl px-6 py-16 text-ink">
          <h1 className="font-serif text-3xl">API keys — coming soon</h1>
          <p className="mt-3 text-sm text-ink/70">
            Track 2 (REST API + MCP server) is rolling out in waves. We&apos;ll email you the moment your account is unlocked.
          </p>
          <p className="mt-2 text-sm text-ink/60">
            Need early access for a Studio or Enterprise team? <a className="underline" href="mailto:sales@seizn.com">sales@seizn.com</a>.
          </p>
        </section>
      </DashboardShell>
    );
  }
  const keys = user.id === "review" ? [] : await loadKeys(user.id);
  const usage = user.id === "review" ? null : await loadUsageSummary(keys);
  return (
    <DashboardShell>
      <ApiKeysClient initialKeys={keys} cap={TRACK_2_KEY_CAP_PER_USER} initialUsage={usage} />
    </DashboardShell>
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
