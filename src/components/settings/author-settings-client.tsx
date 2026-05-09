"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { readApiJson } from "@/lib/client/api-json";
import { csrfFetch } from "@/lib/client/csrf-fetch";
import { getAuthorSettingsCopy } from "./author-settings-i18n";
import { ByokSection } from "./byok-section";
import { LlmProviderSection, type AuthorLlmProvider, type LlmProviderState } from "./llm-provider-section";
import { SubscriptionSection } from "./subscription-section";
import { SyncPlaceholder } from "./sync-placeholder";
import { UsageSection } from "./usage-section";
import {
  DEFAULT_BYOK_STATE,
  DEFAULT_SUBSCRIPTION_STATE,
  DEFAULT_USAGE_STATE,
  type ByokState,
  type SubscriptionState,
  type UsageState,
} from "./author-settings-types";

const DEFAULT_LLM_PROVIDER_STATE: LlmProviderState = {
  provider: null,
  env_default: "anthropic",
};

type SettingsAction = "idle" | "refresh" | "saving" | "removing" | "portal" | "llmprov";

interface AuthorSettingsClientProps {
  navigateToBilling?: (url: string) => void;
}

export function AuthorSettingsClient({ navigateToBilling = defaultNavigate }: AuthorSettingsClientProps) {
  const { locale } = useDashboardTranslation();
  const copy = useMemo(() => getAuthorSettingsCopy(locale), [locale]);
  const [byok, setByok] = useState<ByokState>(DEFAULT_BYOK_STATE);
  const [subscription, setSubscription] = useState<SubscriptionState>(DEFAULT_SUBSCRIPTION_STATE);
  const [usage, setUsage] = useState<UsageState>(DEFAULT_USAGE_STATE);
  const [llmProvider, setLlmProvider] = useState<LlmProviderState>(DEFAULT_LLM_PROVIDER_STATE);
  const [action, setAction] = useState<SettingsAction>("refresh");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setAction("refresh");
    setError(null);
    try {
      const [byokResponse, subscriptionResponse, usageResponse, llmProviderResponse] = await Promise.all([
        fetchJson<ByokState>("/api/account/byok"),
        fetchJson<SubscriptionState>("/api/account/subscription"),
        fetchJson<UsageState>("/api/account/usage"),
        fetchJson<LlmProviderState>("/api/account/llm-provider"),
      ]);
      setByok(normalizeByok(byokResponse));
      setSubscription(normalizeSubscription(subscriptionResponse));
      setUsage(normalizeUsage(usageResponse, subscriptionResponse));
      setLlmProvider(llmProviderResponse ?? DEFAULT_LLM_PROVIDER_STATE);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : copy.loadError);
    } finally {
      setAction("idle");
    }
  }, [copy.loadError]);

  const saveLlmProvider = useCallback(async (provider: AuthorLlmProvider | null): Promise<void> => {
    setAction("llmprov");
    setError(null);
    try {
      const response = await fetchJson<{ provider: AuthorLlmProvider | null }>("/api/account/llm-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      setLlmProvider((prev) => ({ ...prev, provider: response.provider ?? null }));
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : copy.loadError;
      throw new Error(message);
    } finally {
      setAction("idle");
    }
  }, [copy.loadError]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveByok = useCallback(async (apiKey: string, provider: "anthropic" | "google" | "openai" = "anthropic"): Promise<void> => {
    if (!apiKey) {
      throw new Error(copy.byok.missing);
    }
    setAction("saving");
    setError(null);
    try {
      const response = await fetchJson<ByokState>("/api/account/byok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, api_key: apiKey }),
      });
      setByok(normalizeByok(response));
      await refresh();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : copy.byok.error;
      throw new Error(message);
    } finally {
      setAction("idle");
    }
  }, [copy.byok.error, copy.byok.missing, refresh]);

  const removeByok = useCallback(async (provider: "anthropic" | "google" | "openai" = "anthropic"): Promise<void> => {
    setAction("removing");
    setError(null);
    try {
      const response = await fetchJson<ByokState>(
        `/api/account/byok?provider=${encodeURIComponent(provider)}`,
        {
          method: "DELETE",
        },
      );
      setByok(normalizeByok(response));
      await refresh();
    } catch (removeError) {
      const message = removeError instanceof Error ? removeError.message : copy.byok.error;
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
        headers: { "Content-Type": "application/json" },
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
    <div className="space-y-5" data-testid="author-settings-layout">
      <header className="flex flex-col gap-4 border-b border-[var(--ink-200)] pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--ink-600)]">{copy.eyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold leading-tight text-[var(--ink-900)] sm:text-3xl">
            {copy.title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-600)]">{copy.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={action !== "idle"}
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-[var(--ink-200)] bg-[var(--ink-0)] px-4 text-sm font-medium text-[var(--ink-900)] hover:bg-[var(--ink-50)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
        <div className="grid min-w-0 gap-5" data-testid="author-settings-main-column">
          <LlmProviderSection
            state={llmProvider}
            busy={action !== "idle"}
            onSave={saveLlmProvider}
          />
          <ByokSection
            byok={byok}
            copy={copy.byok}
            action={action === "saving" || action === "removing" ? action : "idle"}
            onSave={saveByok}
            onRemove={removeByok}
          />
        </div>
        <aside className="grid min-w-0 gap-5 xl:sticky xl:top-5" data-testid="author-settings-summary-column">
          <SubscriptionSection
            subscription={subscription}
            copy={copy.subscription}
            locale={locale}
            action={action === "portal" ? "portal" : "idle"}
            onManageBilling={manageBilling}
          />
          <UsageSection usage={usage} requestCount={requestCount} copy={copy.usage} />
          <SyncPlaceholder copy={copy.sync} />
        </aside>
      </div>
    </div>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await csrfFetch(url, init);
  return readApiJson<T>(response, `Request failed: ${response.status}`);
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
