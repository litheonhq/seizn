"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CreditCard, ExternalLink, PauseCircle, RefreshCw, RotateCcw } from "lucide-react";
import { getErrorMessage } from "@/lib/ui-error";

interface SubscriptionState {
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
  price_lock_version: string;
  usage: {
    tokens_used_month: number;
    tokens_cap_month: number | null;
    request_count: number;
    byok_active: boolean;
  };
}

interface UsageState {
  tokens_used_month?: number;
  tokens_cap_month?: number | null;
  overage_tokens?: number;
  overage_charges_usd?: number;
  byok_active?: boolean;
}

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)seizn_csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function formatDate(value: string | null): string {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}K`;
  return value.toLocaleString();
}

export function BillingDashboardClient() {
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<"portal" | "cancel" | "resume" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const csrfToken = getCsrfToken();
      const csrfHeaders = csrfToken ? { "x-csrf-token": csrfToken } : undefined;
      const [subscriptionResponse, usageResponse] = await Promise.all([
        fetch("/api/account/subscription", { credentials: "include", headers: csrfHeaders }),
        fetch("/api/account/usage", { credentials: "include", headers: csrfHeaders }),
      ]);

      if (!subscriptionResponse.ok) {
        throw new Error("Subscription state could not be loaded.");
      }

      setSubscription(await subscriptionResponse.json());
      setUsage(usageResponse.ok ? await usageResponse.json() : null);
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Billing could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const mergedUsage = useMemo(() => {
    const source = usage ?? subscription?.usage;
    return {
      used: source?.tokens_used_month ?? 0,
      cap: source?.tokens_cap_month ?? null,
      overage: usage?.overage_tokens ?? 0,
      byok: usage?.byok_active ?? subscription?.byok_active ?? false,
    };
  }, [subscription, usage]);

  const percent = mergedUsage.cap
    ? Math.min(100, Math.round((mergedUsage.used / mergedUsage.cap) * 100))
    : 0;
  const isTrialD3 =
    typeof subscription?.trial_days_remaining === "number" &&
    subscription.trial_days_remaining <= 3 &&
    subscription.trial_days_remaining > 0;

  const runAction = async (nextAction: "portal" | "cancel" | "resume") => {
    setAction(nextAction);
    setError(null);
    try {
      const csrfToken = getCsrfToken();
      const response = await fetch("/api/account/subscription", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({ action: nextAction }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Billing action failed.");
      }
      if (nextAction === "portal" && typeof data.url === "string") {
        window.open(data.url, "_self", "noopener,noreferrer");
        return;
      }
      await refresh();
    } catch (actionError) {
      setError(getErrorMessage(actionError, "Billing action failed."));
    } finally {
      setAction(null);
    }
  };

  if (loading) {
    return <div className="text-sm text-[var(--ink-600)]">Loading billing...</div>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-[var(--ink-600)]">Billing</p>
          <h1 className="text-2xl font-semibold text-[var(--ink-900)]">Author subscription</h1>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--ink-200)] px-3 py-2 text-sm font-medium text-[var(--ink-900)] hover:bg-[var(--ink-50)]"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </header>

      {error ? (
        <div className="rounded-lg border border-[var(--signal-conflict)] bg-[var(--signal-conflict-soft)] px-4 py-3 text-sm text-[var(--signal-conflict-ink)]">
          {error}
        </div>
      ) : null}

      {isTrialD3 ? (
        <div className="rounded-lg border border-[var(--signal-pending)] bg-[var(--signal-pending-soft)] px-4 py-3 text-sm text-[var(--signal-pending-ink)]">
          Trial ends in {subscription?.trial_days_remaining} day{subscription?.trial_days_remaining === 1 ? "" : "s"}.
        </div>
      ) : null}

      {subscription?.payment_failed ? (
        <div className="rounded-lg border border-[var(--signal-conflict)] bg-[var(--signal-conflict-soft)] px-4 py-3 text-sm text-[var(--signal-conflict-ink)]">
          Payment failed. Open billing portal to update payment details.
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border border-[var(--ink-200)] bg-[var(--ink-0)] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-[var(--ink-600)]">Current plan</p>
              <h2 className="mt-1 text-3xl font-semibold text-[var(--ink-900)]">
                {subscription?.tier_label ?? "Free"}
              </h2>
              <p className="mt-2 text-sm text-[var(--ink-600)]">
                {subscription?.status ?? "inactive"} · {subscription?.price_lock_version ?? "v7"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => runAction("portal")}
                disabled={action !== null}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--ink-900)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--ink-900)]/90 disabled:opacity-60"
              >
                <CreditCard className="h-4 w-4" />
                {action === "portal" ? "Opening..." : "Manage"}
              </button>
              {subscription?.cancel_at_period_end ? (
                <button
                  type="button"
                  onClick={() => runAction("resume")}
                  disabled={action !== null}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--ink-200)] px-3 py-2 text-sm font-medium text-[var(--ink-900)] hover:bg-[var(--ink-50)] disabled:opacity-60"
                >
                  <RotateCcw className="h-4 w-4" />
                  Resume
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => runAction("cancel")}
                  disabled={action !== null}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--ink-200)] px-3 py-2 text-sm font-medium text-[var(--ink-900)] hover:bg-[var(--ink-50)] disabled:opacity-60"
                >
                  <PauseCircle className="h-4 w-4" />
                  Cancel
                </button>
              )}
            </div>
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-[var(--ink-600)]">Renews</dt>
              <dd className="mt-1 text-sm font-medium text-[var(--ink-900)]">{formatDate(subscription?.renews_at ?? null)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-[var(--ink-600)]">Access ends</dt>
              <dd className="mt-1 text-sm font-medium text-[var(--ink-900)]">{formatDate(subscription?.current_period_end ?? null)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-[var(--ink-200)] bg-[var(--ink-0)] p-5">
          <p className="text-sm text-[var(--ink-600)]">Monthly tokens</p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div className="text-3xl font-semibold text-[var(--ink-900)]">
              {formatTokens(mergedUsage.used)}
            </div>
            <div className="text-sm text-[var(--ink-600)]">
              {mergedUsage.cap ? `of ${formatTokens(mergedUsage.cap)}` : "Unlimited"}
            </div>
          </div>
          {mergedUsage.cap ? (
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--ink-50)]">
              <div className="h-full rounded-full bg-[var(--ink-900)]" style={{ width: `${percent}%` }} />
            </div>
          ) : null}
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-[var(--ink-600)]">Overage</span>
            <span className="font-medium text-[var(--ink-900)]">{formatTokens(mergedUsage.overage)}</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--ink-200)] px-3 py-2 text-sm font-medium text-[var(--ink-900)] hover:bg-[var(--ink-50)]"
            >
              <ExternalLink className="h-4 w-4" />
              Upgrade
            </Link>
            <Link
              href="/dashboard/settings"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--ink-200)] px-3 py-2 text-sm font-medium text-[var(--ink-900)] hover:bg-[var(--ink-50)]"
            >
              <ExternalLink className="h-4 w-4" />
              API keys
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

