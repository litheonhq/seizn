"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { getAuthorSettingsCopy } from "./author-settings-i18n";
import { ByokSection } from "./byok-section";
import { SubscriptionSection } from "./subscription-section";
import { SyncPlaceholder } from "./sync-placeholder";
import { UsageSection } from "./usage-section";
import {
  DEFAULT_BYOK_STATE,
  DEFAULT_SUBSCRIPTION_STATE,
  DEFAULT_USAGE_STATE,
  type ByokDiscountState,
  type ByokState,
  type SubscriptionState,
  type UsageState,
  normalizeByokDiscountStatus,
} from "./author-settings-types";

type SettingsAction = "idle" | "refresh" | "saving" | "removing" | "portal";

interface AuthorSettingsClientProps {
  navigateToBilling?: (url: string) => void;
}

export function AuthorSettingsClient({ navigateToBilling = defaultNavigate }: AuthorSettingsClientProps) {
  const { locale } = useDashboardTranslation();
  const copy = useMemo(() => getAuthorSettingsCopy(locale), [locale]);
  const [byok, setByok] = useState<ByokState>(DEFAULT_BYOK_STATE);
  const [subscription, setSubscription] = useState<SubscriptionState>(DEFAULT_SUBSCRIPTION_STATE);
  const [usage, setUsage] = useState<UsageState>(DEFAULT_USAGE_STATE);
  const [action, setAction] = useState<SettingsAction>("refresh");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setAction("refresh");
    setError(null);
    try {
      const [byokResponse, subscriptionResponse, usageResponse] = await Promise.all([
        fetchJson<ByokState>("/api/account/byok"),
        fetchJson<SubscriptionState>("/api/account/subscription"),
        fetchJson<UsageState>("/api/account/usage"),
      ]);
      setByok(normalizeByok(byokResponse));
      setSubscription(normalizeSubscription(subscriptionResponse));
      setUsage(normalizeUsage(usageResponse, subscriptionResponse));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : copy.loadError);
    } finally {
      setAction("idle");
    }
  }, [copy.loadError]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveByok = useCallback(async (apiKey: string): Promise<ByokDiscountState> => {
    if (!apiKey) {
      throw new Error(copy.byok.missing);
    }
    setAction("saving");
    setError(null);
    try {
      const response = await fetchJson<ByokState & { byok_discount?: ByokDiscountState }>("/api/account/byok", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ provider: "anthropic", api_key: apiKey }),
      });
      setByok(normalizeByok(response));
      await refresh();
      return response.byok_discount ?? { status: "inactive" };
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : copy.byok.error;
      setError(message);
      throw new Error(message);
    } finally {
      setAction("idle");
    }
  }, [copy.byok.error, copy.byok.missing, refresh]);

  const removeByok = useCallback(async (): Promise<ByokDiscountState> => {
    setAction("removing");
    setError(null);
    try {
      const response = await fetchJson<ByokState & { byok_discount?: ByokDiscountState }>("/api/account/byok", {
        method: "DELETE",
        headers: csrfHeaders(),
      });
      setByok(normalizeByok(response));
      await refresh();
      return response.byok_discount ?? { status: "inactive", removed: true };
    } catch (removeError) {
      const message = removeError instanceof Error ? removeError.message : copy.byok.error;
      setError(message);
      throw new Error(message);
    } finally {
      setAction("idle");
    }
  }, [copy.byok.error, refresh]);

  const manageBilling = useCallback(async () => {
    setAction("portal");
    setError(null);
    try {
      const response = await fetchJson<{ url?: string }>("/api/account/billing-portal", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ return_to: "/dashboard/author/settings" }),
      });
      if (!response.url) {
        throw new Error("Billing portal URL missing.");
      }
      navigateToBilling(response.url);
    } catch (portalError) {
      setError(portalError instanceof Error ? portalError.message : copy.loadError);
    } finally {
      setAction("idle");
    }
  }, [copy.loadError, navigateToBilling]);

  const requestCount = usageRequestCount(subscription, usage);
  const loading = action === "refresh" && !error;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--ink-600)]">{copy.eyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--ink-900)]">{copy.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-600)]">{copy.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={action !== "idle"}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--ink-200)] px-4 text-sm font-medium text-[var(--ink-900)] hover:bg-[var(--ink-50)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          {copy.refresh}
        </button>
      </header>

      {loading ? <div className="text-sm text-[var(--ink-600)]">{copy.loading}</div> : null}
      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--signal-pending)] bg-[var(--signal-pending-soft)] px-4 py-3 text-sm text-[var(--signal-pending-ink)] dark:border-[var(--signal-pending)]/60 dark:bg-[var(--signal-pending-ink)]/30 dark:text-[var(--signal-pending-soft)]">
          <TriangleAlert className="mt-0.5 h-4 w-4" aria-hidden="true" />
          <span>{error || copy.loadError}</span>
        </div>
      ) : null}

      <div className="grid gap-5">
        <ByokSection
          byok={byok}
          discountStatus={subscription.byok_discount_status}
          discountError={subscription.byok_discount_error}
          copy={copy.byok}
          action={action === "saving" || action === "removing" ? action : "idle"}
          onSave={saveByok}
          onRemove={removeByok}
        />
        <SubscriptionSection
          subscription={subscription}
          copy={copy.subscription}
          locale={locale}
          action={action === "portal" ? "portal" : "idle"}
          onManageBilling={manageBilling}
        />
        <UsageSection usage={usage} requestCount={requestCount} copy={copy.usage} />
        <SyncPlaceholder copy={copy.sync} />
      </div>
    </div>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
  });
  const data = await response.json().catch(() => null) as T | { error?: string } | null;
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
      ? data.error
      : `Request failed: ${response.status}`;
    throw new Error(message);
  }
  return data as T;
}

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)seizn_csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function csrfHeaders(base?: Record<string, string>): Record<string, string> {
  const token = getCsrfToken();
  return token ? { ...(base ?? {}), "x-csrf-token": token } : (base ?? {});
}

function normalizeByok(value: Partial<ByokState>): ByokState {
  return {
    ...DEFAULT_BYOK_STATE,
    ...value,
    enabled: value.enabled === true,
    provider: typeof value.provider === "string" ? value.provider : null,
    status: value.status === "active" || value.status === "invalid" || value.status === "error"
      ? value.status
      : "missing",
  };
}

function normalizeSubscription(value: Partial<SubscriptionState>): SubscriptionState {
  return {
    ...DEFAULT_SUBSCRIPTION_STATE,
    ...value,
    byok_discount_status: normalizeByokDiscountStatus(value.byok_discount_status),
    usage: {
      ...DEFAULT_SUBSCRIPTION_STATE.usage,
      ...(value.usage ?? {}),
    },
  };
}

function normalizeUsage(value: Partial<UsageState>, subscription: Partial<SubscriptionState>): UsageState {
  return {
    ...DEFAULT_USAGE_STATE,
    ...value,
    tokens_used_month: value.tokens_used_month ?? subscription.usage?.tokens_used_month ?? 0,
    tokens_cap_month: value.tokens_cap_month ?? subscription.usage?.tokens_cap_month ?? null,
    byok_active: value.byok_active === true || subscription.byok_active === true,
  };
}

function usageRequestCount(subscription: SubscriptionState, usage: UsageState): number {
  const requestCount = subscription.usage?.request_count;
  if (typeof requestCount === "number") return requestCount;
  const modelUsage = (usage as UsageState & { model_usage?: { request_count?: number } }).model_usage;
  return modelUsage?.request_count ?? 0;
}

function defaultNavigate(url: string): void {
  window.open(url, "_self", "noopener,noreferrer");
}
