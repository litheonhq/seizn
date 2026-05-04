"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import { locales, localeNames, type Locale } from "@/i18n/config";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { createLatestRequestGuard, isAbortError } from "@/lib/client-request";
import { getErrorMessage } from "@/lib/ui-error";
import { RTBFModal, DataExportModal, DeleteMemoriesModal } from '@/components/settings';

interface ProfileData {
  email?: string | null;
  name?: string | null;
  language?: Locale;
}

interface BudgetSettings {
  dailyBudgetUsd: number;
  monthlyBudgetUsd: number;
  perQueryMaxUsd: number;
  alertAtPercent: number;
  mode: "soft" | "hard";
  fallbackStrategy: "degrade" | "reject" | "queue";
}

interface NotificationSettings {
  emailAlerts: boolean;
  usageAlerts: boolean;
  weeklyDigest: boolean;
  securityAlerts: boolean;
}

interface QuotaData {
  plan: string;
  memories: { used: number; limit: number };
  apiCalls: { used: number; limit: number };
  apiKeys: { used: number; limit: number };
}

type PreferredRegion = "auto" | "seoul" | "us-east-1" | "eu-west-1";

interface RegionPreferenceData {
  preferredRegion: PreferredRegion;
  regionPinAvailable: boolean;
}

// Plan limits for UI display. Keep in sync with src/lib/plan-limits.ts (canonical source).
const PLAN_LIMITS: Record<string, { memories: number; apiCalls: number; apiKeys: number; price: string }> = {
  free: { memories: 10_000, apiCalls: 10_000, apiKeys: 2, price: "$0" },
  starter: { memories: 100_000, apiCalls: 100_000, apiKeys: 3, price: "$39" },
  indie: { memories: 100_000, apiCalls: 100_000, apiKeys: 3, price: "$39" },
  plus: { memories: 1_000_000, apiCalls: 1_000_000, apiKeys: 10, price: "$299" },
  studio: { memories: 1_000_000, apiCalls: 1_000_000, apiKeys: 10, price: "$299" },
  pro: { memories: 5_000_000, apiCalls: -1, apiKeys: 25, price: "$999" },
  enterprise: { memories: -1, apiCalls: -1, apiKeys: 100, price: "Custom" },
};

const REGION_OPTIONS: Array<{ value: PreferredRegion; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "seoul", label: "Seoul" },
  { value: "us-east-1", label: "US East" },
  { value: "eu-west-1", label: "EU West" },
];

function normalizePreferredRegion(value: unknown): PreferredRegion {
  return REGION_OPTIONS.some((option) => option.value === value) ? (value as PreferredRegion) : "auto";
}

function getUsagePercent(used: number, limit: number): number {
  if (limit === -1) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function isUsageCritical(used: number, limit: number): boolean {
  if (limit === -1) return false;
  return (used / limit) >= 0.9;
}

function isUsageWarning(used: number, limit: number): boolean {
  if (limit === -1) return false;
  const ratio = used / limit;
  return ratio >= 0.7 && ratio < 0.9;
}

type SettingsTab = "profile" | "billing" | "budget" | "notifications" | "security" | "danger";

export function SettingsClient() {
  const { status: sessionStatus } = useSession();
  const { t } = useDashboardTranslation();
  const [profile, setProfile] = useState<ProfileData>({});
  const [language, setLanguage] = useState<Locale>("en");
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestGuardRef = useRef(createLatestRequestGuard());

  // Budget settings state
  const [budgetSettings, setBudgetSettings] = useState<BudgetSettings>({
    dailyBudgetUsd: 10,
    monthlyBudgetUsd: 100,
    perQueryMaxUsd: 0.05,
    alertAtPercent: 80,
    mode: "soft",
    fallbackStrategy: "degrade",
  });
  const [budgetLoading, setBudgetLoading] = useState(true);

  // Notification settings state
  const [notifications, setNotifications] = useState<NotificationSettings>({
    emailAlerts: true,
    usageAlerts: true,
    weeklyDigest: false,
    securityAlerts: true,
  });

  // Quota/Billing state
  const [quotaData, setQuotaData] = useState<QuotaData>({
    plan: "free",
    memories: { used: 0, limit: PLAN_LIMITS.free.memories },
    apiCalls: { used: 0, limit: PLAN_LIMITS.free.apiCalls },
    apiKeys: { used: 0, limit: PLAN_LIMITS.free.apiKeys },
  });
  const [quotaLoading, setQuotaLoading] = useState(true);
  const [regionPreference, setRegionPreference] = useState<RegionPreferenceData>({
    preferredRegion: "auto",
    regionPinAvailable: false,
  });
  const [regionLoading, setRegionLoading] = useState(true);

  // Modal state for RTBF actions
  const [showExportModal, setShowExportModal] = useState(false);
  const [showDeleteMemoriesModal, setShowDeleteMemoriesModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);

  const loadInitialData = useCallback(async () => {
    const request = requestGuardRef.current.begin();
    setLoadError(null);
    setBudgetLoading(true);
    setQuotaLoading(true);
    setRegionLoading(true);

    try {
      const [profileResult, budgetResult, quotaResult, regionResult] = await Promise.allSettled([
        fetch("/api/me", { credentials: "include", signal: request.signal }).then(async (res) => ({
          status: res.status,
          data: res.status === 401 ? null : await res.json(),
        })),
        fetch("/api/budget/settings", { credentials: "include", signal: request.signal }).then(async (res) => ({
          ok: res.ok,
          data: res.ok ? await res.json() : null,
        })),
        fetch("/api/quota", { credentials: "include", signal: request.signal }).then(async (res) => ({
          ok: res.ok,
          data: res.ok ? await res.json() : null,
        })),
        fetch("/api/personas/region-preference", { credentials: "include", signal: request.signal }).then(async (res) => ({
          ok: res.ok,
          data: res.ok ? await res.json() : null,
        })),
      ]);

      if (!requestGuardRef.current.isCurrent(request.id)) {
        return;
      }

      let failedCount = 0;

      if (profileResult.status === "fulfilled" && profileResult.value.status !== 401 && profileResult.value.data) {
        const data = profileResult.value.data;
        setProfile({
          email: data?.user?.email,
          name: data?.user?.name,
          language: data?.user?.language || "en",
        });
        setLanguage((data?.user?.language as Locale) || "en");
      } else if (profileResult.status === "rejected" && !isAbortError(profileResult.reason)) {
        failedCount += 1;
      }

      if (budgetResult.status === "fulfilled" && budgetResult.value.ok && budgetResult.value.data?.settings) {
        setBudgetSettings(budgetResult.value.data.settings);
      } else if (
        (budgetResult.status === "fulfilled" && !budgetResult.value.ok) ||
        (budgetResult.status === "rejected" && !isAbortError(budgetResult.reason))
      ) {
        failedCount += 1;
      }

      if (quotaResult.status === "fulfilled" && quotaResult.value.ok && quotaResult.value.data) {
        const data = quotaResult.value.data;
        setQuotaData({
          plan: data.plan || "free",
          memories: {
            used: data.memories?.used || 0,
            limit: data.memories?.limit || PLAN_LIMITS[data.plan || "free"]?.memories || 10000,
          },
          apiCalls: {
            used: data.apiCalls?.used || 0,
            limit: data.apiCalls?.limit || PLAN_LIMITS[data.plan || "free"]?.apiCalls || 1000,
          },
          apiKeys: {
            used: data.apiKeys?.used || 0,
            limit: data.apiKeys?.limit || PLAN_LIMITS[data.plan || "free"]?.apiKeys || 3,
          },
        });
      } else if (
        (quotaResult.status === "fulfilled" && !quotaResult.value.ok) ||
        (quotaResult.status === "rejected" && !isAbortError(quotaResult.reason))
      ) {
        failedCount += 1;
      }

      if (regionResult.status === "fulfilled" && regionResult.value.ok && regionResult.value.data) {
        setRegionPreference({
          preferredRegion: normalizePreferredRegion(regionResult.value.data.preferredRegion),
          regionPinAvailable: Boolean(regionResult.value.data.regionPinAvailable),
        });
      } else if (
        (regionResult.status === "fulfilled" && !regionResult.value.ok) ||
        (regionResult.status === "rejected" && !isAbortError(regionResult.reason))
      ) {
        failedCount += 1;
      }

      setLoadError(failedCount > 0 ? "Some settings data could not be loaded." : null);
    } catch (err) {
      if (!isAbortError(err) && requestGuardRef.current.isCurrent(request.id)) {
        setLoadError(getErrorMessage(err, "Failed to load settings."));
      }
    } finally {
      if (requestGuardRef.current.isCurrent(request.id)) {
        setBudgetLoading(false);
        setQuotaLoading(false);
        setRegionLoading(false);
        requestGuardRef.current.finish(request.id);
      }
    }
  }, []);

  useEffect(() => {
    const requestGuard = requestGuardRef.current;
    loadInitialData();
    return () => requestGuard.cancel();
  }, [loadInitialData]);

  const saveLanguage = async (lang: Locale) => {
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/profile/language", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: lang }),
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401) {
          signIn(undefined, { callbackUrl: "/dashboard/settings" });
          return;
        }
        throw new Error("Failed to save language");
      }
      document.cookie = `NEXT_LOCALE=${lang};max-age=${60 * 60 * 24 * 365};path=/`;
      setSaveStatus("saved");
      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      setLoadError(getErrorMessage(err, "Failed to save language."));
      setSaveStatus("error");
    }
  };

  const saveBudgetSettings = useCallback(async () => {
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/budget/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(budgetSettings),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      setLoadError(getErrorMessage(err, "Failed to save budget settings."));
      setSaveStatus("error");
    }
  }, [budgetSettings]);

  const saveRegionPreference = useCallback(async (preferredRegion: PreferredRegion) => {
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/personas/region-preference", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredRegion }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || "Failed to save data residency preference");
      }
      const data = await res.json();
      setRegionPreference({
        preferredRegion: normalizePreferredRegion(data.preferredRegion),
        regionPinAvailable: Boolean(data.regionPinAvailable),
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      setLoadError(getErrorMessage(err, "Failed to save data residency preference."));
      setSaveStatus("error");
    }
  }, []);

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: "profile", label: t("dashboard.settingsPage.tabs.profile"), icon: <UserIcon className="w-4 h-4" /> },
    { id: "billing", label: t("dashboard.settingsPage.tabs.billing") || "Billing", icon: <CreditCardIcon className="w-4 h-4" /> },
    { id: "budget", label: t("dashboard.settingsPage.tabs.budget"), icon: <BudgetIcon className="w-4 h-4" /> },
    { id: "notifications", label: t("dashboard.settingsPage.tabs.notifications"), icon: <BellIcon className="w-4 h-4" /> },
    { id: "security", label: t("dashboard.settingsPage.tabs.security"), icon: <ShieldIcon className="w-4 h-4" /> },
    { id: "danger", label: t("dashboard.settingsPage.tabs.danger"), icon: <WarningIcon className="w-4 h-4" /> },
  ];

  // Check if any quota is critical
  const hasQuotaCritical = isUsageCritical(quotaData.memories.used, quotaData.memories.limit) ||
    isUsageCritical(quotaData.apiCalls.used, quotaData.apiCalls.limit) ||
    isUsageCritical(quotaData.apiKeys.used, quotaData.apiKeys.limit);

  const isSessionLoading = sessionStatus === "loading";
  const isUnauthenticated = sessionStatus === "unauthenticated";

  return (
    <div className="space-y-6">
      {isSessionLoading && (
        <div className="text-sm text-[var(--ink-600)]">{t("dashboard.settingsPage.loading")}</div>
      )}
      {isUnauthenticated && (
        <div className="rounded-lg border border-[var(--signal-conflict)] dark:border-[var(--signal-conflict)] bg-[var(--signal-conflict-soft)] dark:bg-[var(--signal-conflict-ink)]/20 p-3 sm:p-4">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-[var(--signal-conflict-soft)] dark:bg-[var(--signal-conflict-ink)]/40 text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)] flex-shrink-0">
                <UserIcon className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]">
                  {t("dashboard.settingsPage.loginRequired") || "Login required"}
                </p>
                <p className="text-xs text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)] mt-1">
                  {t("auth.login.subtitle")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => signIn(undefined, { callbackUrl: "/dashboard/settings" })}
              className="inline-flex items-center justify-center self-start rounded-lg bg-[var(--signal-conflict)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--signal-conflict)] transition-colors"
            >
              {t("auth.login.submit")}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--ink-600)]">{t("dashboard.settingsPage.title")}</p>
          <h1 className="text-2xl font-semibold text-[var(--ink-900)]">{t("dashboard.settingsPage.subtitle")}</h1>
        </div>
        {saveStatus === "saving" && <span className="text-sm text-[var(--ink-600)]">{t("dashboard.settingsPage.saving")}</span>}
        {saveStatus === "saved" && <span className="text-sm text-[var(--signal-canon)]">{t("dashboard.settingsPage.saved")}</span>}
        {saveStatus === "error" && <span className="text-sm text-[var(--signal-conflict-ink)]">{t("dashboard.settingsPage.saveFailed")}</span>}
      </header>

      {loadError && (
        <div className="rounded-lg border border-[var(--signal-pending)] bg-[var(--signal-pending-soft)] px-4 py-3 text-sm text-[var(--signal-pending-ink)] dark:border-[var(--signal-pending)]/60 dark:bg-[var(--signal-pending-ink)]/30 dark:text-[var(--signal-pending-soft)]">
          {loadError}
        </div>
      )}

      {/* Tabs */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-[var(--ink-50)] rounded-xl sm:flex sm:gap-1 sm:overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors sm:justify-start sm:px-4 ${
              activeTab === tab.id
                ? "bg-[var(--ink-0)] text-[var(--ink-900)] shadow-sm"
                : "text-[var(--ink-600)] hover:text-[var(--ink-900)]"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="szn-card border border-[var(--ink-200)] rounded-lg p-4 sm:p-6">
        {/* Profile Tab */}
        {activeTab === "profile" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-[var(--ink-900)] mb-4">
                {t("dashboard.settingsPage.account")}
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-[var(--ink-600)] mb-1">
                    {t("dashboard.settingsPage.email")}
                  </label>
                  <input
                    type="email"
                    value={profile.email || ""}
                    disabled
                    className="w-full px-4 py-2 rounded-xl border border-[var(--ink-200)] bg-[var(--ink-50)] text-[var(--ink-900)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--ink-600)] mb-1">
                    {t("dashboard.settingsPage.name")}
                  </label>
                  <input
                    type="text"
                    value={profile.name || ""}
                    disabled
                    className="w-full px-4 py-2 rounded-xl border border-[var(--ink-200)] bg-[var(--ink-50)] text-[var(--ink-900)]"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[var(--ink-200)]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-medium text-[var(--ink-900)]">{t("dashboard.language")}</h3>
                <span className="text-xs text-[var(--ink-600)]">{t("dashboard.settingsPage.languageHint")}</span>
              </div>
              <select
                value={language}
                onChange={(e) => {
                  const lang = e.target.value as Locale;
                  setLanguage(lang);
                  saveLanguage(lang);
                }}
                className="w-full max-w-xs rounded-xl border border-[var(--ink-200)] px-4 py-2 text-sm text-[var(--ink-600)] bg-[var(--ink-0)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-900)]"
              >
                {locales.map((l) => (
                  <option key={l} value={l}>
                    {localeNames[l]}
                  </option>
                ))}
              </select>
            </div>
            <div className="pt-4 border-t border-[var(--ink-200)]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-medium text-[var(--ink-900)]">{t("dashboard.theme.toggle")}</h3>
              </div>
              <ThemeToggle variant="dropdown" />
            </div>
          </div>
        )}

        {/* Billing Tab */}
        {activeTab === "billing" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-[var(--ink-900)] mb-2">
                {t("dashboard.settingsPage.billing.title") || "Billing & Quota"}
              </h2>
              <p className="text-sm text-[var(--ink-600)] mb-6">
                {t("dashboard.settingsPage.billing.subtitle") || "Manage your subscription and usage limits"}
              </p>
            </div>

            {quotaLoading ? (
              <div className="py-12 text-center text-[var(--ink-600)]">
                {t("dashboard.settingsPage.loading")}
              </div>
            ) : (
              <>
                {/* Quota Warning Banner */}
                {hasQuotaCritical && (
                  <div className="p-4 rounded-xl bg-[var(--signal-pending-soft)] dark:bg-[var(--signal-pending-ink)]/20 border border-[var(--signal-pending)] dark:border-[var(--signal-pending)] mb-6">
                    <div className="flex items-start gap-3">
                      <ExclamationIcon className="w-5 h-5 text-[var(--signal-pending-ink)] dark:text-[var(--signal-pending-soft)] mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-[var(--signal-pending-ink)] dark:text-[var(--signal-pending-soft)]">
                          {t("dashboard.settingsPage.billing.quotaWarningTitle") || "Approaching quota limit"}
                        </h4>
                        <p className="text-xs text-[var(--signal-pending-ink)] dark:text-[var(--signal-pending-soft)] mt-1">
                          {t("dashboard.settingsPage.billing.quotaWarningDesc") || "You are approaching your plan limits. Consider upgrading for more capacity."}
                        </p>
                        <Link
                          href="/pricing"
                          className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-[var(--signal-pending-ink)] dark:text-[var(--signal-pending-soft)] hover:text-[var(--signal-pending-ink)] dark:hover:text-[var(--signal-pending-soft)]"
                        >
                          {t("dashboard.settingsPage.billing.upgradeNow") || "Upgrade now"}
                          <ChevronRightIcon className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  </div>
                )}

                {/* Current Plan Card */}
                <div className="p-5 rounded-xl bg-[var(--ink-900)] text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm opacity-90">{t("dashboard.settingsPage.billing.currentPlan") || "Current Plan"}</p>
                      <h3 className="text-2xl font-bold capitalize mt-1">{quotaData.plan}</h3>
                      <p className="text-sm opacity-90 mt-1">
                        {t("dashboard.settingsPage.billing.monthlyPrice") || "Monthly"}: {PLAN_LIMITS[quotaData.plan]?.price || "$0"}
                      </p>
                    </div>
                    {quotaData.plan !== "enterprise" && (
                      <Link
                        href="/pricing"
                        className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white font-medium text-sm transition-colors flex items-center gap-2"
                      >
                        <UpgradeIcon className="w-4 h-4" />
                        {t("dashboard.settingsPage.billing.upgradePlan") || "Upgrade Plan"}
                      </Link>
                    )}
                  </div>
                </div>

                {(quotaData.plan === "pro" || quotaData.plan === "enterprise") && (
                  <div className="rounded-xl border border-szn-border bg-szn-card p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-szn-text-1">Dedicated Slack</h4>
                        <p className="mt-1 text-sm text-szn-text-2">
                          Open a private engineering channel for live ops, SSO, and incident coordination.
                        </p>
                      </div>
                      <a
                        href="mailto:pro@seizn.com?subject=Dedicated%20Slack%20channel%20setup"
                        className="inline-flex items-center justify-center rounded-lg border border-szn-border px-4 py-2 text-sm font-medium text-szn-text-1 transition-colors hover:bg-szn-bg"
                      >
                        Request Slack
                      </a>
                    </div>
                  </div>
                )}

                <DataResidencyPreference
                  value={regionPreference.preferredRegion}
                  regionPinAvailable={regionPreference.regionPinAvailable}
                  loading={regionLoading}
                  saving={saveStatus === "saving"}
                  onChange={saveRegionPreference}
                />

                {/* Usage Stats */}
                <div className="grid gap-4 md:grid-cols-3">
                  <UsageCard
                    title={t("dashboard.settingsPage.billing.memoriesUsage") || "Memories"}
                    icon={<MemoryIcon className="w-5 h-5" />}
                    used={quotaData.memories.used}
                    limit={quotaData.memories.limit}
                    t={t}
                  />
                  <UsageCard
                    title={t("dashboard.settingsPage.billing.apiCallsUsage") || "API Calls"}
                    icon={<ApiIcon className="w-5 h-5" />}
                    used={quotaData.apiCalls.used}
                    limit={quotaData.apiCalls.limit}
                    t={t}
                  />
                  <UsageCard
                    title={t("dashboard.settingsPage.billing.apiKeysUsage") || "API Keys"}
                    icon={<KeyIcon className="w-5 h-5" />}
                    used={quotaData.apiKeys.used}
                    limit={quotaData.apiKeys.limit}
                    t={t}
                  />
                </div>

                {/* Plan Comparison */}
                <div className="pt-6 border-t border-[var(--ink-200)]">
                  <h3 className="text-base font-medium text-[var(--ink-900)] mb-4">
                    {t("dashboard.settingsPage.billing.planComparison") || "Plan Comparison"}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[var(--ink-600)] border-b border-[var(--ink-200)]">
                          <th className="pb-3 font-medium">{t("dashboard.settingsPage.billing.feature") || "Feature"}</th>
                          <th className="pb-3 font-medium">Free</th>
                          <th className="pb-3 font-medium">Indie</th>
                          <th className="pb-3 font-medium">Studio</th>
                          <th className="pb-3 font-medium">Pro</th>
                          <th className="pb-3 font-medium">Enterprise</th>
                        </tr>
                      </thead>
                      <tbody className="text-[var(--ink-600)]">
                        <tr className="border-b border-[var(--ink-200)]">
                          <td className="py-3">{t("dashboard.settingsPage.billing.memoriesLabel") || "Memories"}</td>
                          <td className="py-3">10,000</td>
                          <td className="py-3">100,000</td>
                          <td className="py-3">1,000,000</td>
                          <td className="py-3">5,000,000</td>
                          <td className="py-3">{t("dashboard.settingsPage.billing.unlimited") || "Unlimited"}</td>
                        </tr>
                        <tr className="border-b border-[var(--ink-200)]">
                          <td className="py-3">{t("dashboard.settingsPage.billing.apiCallsLabel") || "API Calls/mo"}</td>
                          <td className="py-3">10,000</td>
                          <td className="py-3">100,000</td>
                          <td className="py-3">1,000,000</td>
                          <td className="py-3">{t("dashboard.settingsPage.billing.unlimited") || "Unlimited"}</td>
                          <td className="py-3">{t("dashboard.settingsPage.billing.unlimited") || "Unlimited"}</td>
                        </tr>
                        <tr className="border-b border-[var(--ink-200)]">
                          <td className="py-3">{t("dashboard.settingsPage.billing.apiKeysLabel") || "API Keys"}</td>
                          <td className="py-3">2</td>
                          <td className="py-3">3</td>
                          <td className="py-3">10</td>
                          <td className="py-3">25</td>
                          <td className="py-3">100</td>
                        </tr>
                        <tr>
                          <td className="py-3">{t("dashboard.settingsPage.billing.priceLabel") || "Price"}</td>
                          <td className="py-3">$0</td>
                          <td className="py-3">$39/mo</td>
                          <td className="py-3">$299/mo</td>
                          <td className="py-3">$999/mo</td>
                          <td className="py-3">{t("dashboard.settingsPage.billing.contactUs") || "Contact Us"}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Budget Tab */}
        {activeTab === "budget" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-[var(--ink-900)] mb-2">
                {t("dashboard.settingsPage.budget.title")}
              </h2>
              <p className="text-sm text-[var(--ink-600)] mb-6">
                {t("dashboard.settingsPage.budget.subtitle")}
              </p>
            </div>

            {budgetLoading ? (
              <div className="py-12 text-center text-[var(--ink-600)]">
                {t("dashboard.settingsPage.loading")}
              </div>
            ) : (
              <>
                {/* Budget Limits */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-[var(--ink-600)] mb-1">
                      {t("dashboard.settingsPage.budget.dailyLimit")}
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ink-500)]">$</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={budgetSettings.dailyBudgetUsd}
                        onChange={(e) => setBudgetSettings(prev => ({
                          ...prev,
                          dailyBudgetUsd: parseFloat(e.target.value) || 0
                        }))}
                        className="w-full pl-8 pr-4 py-2 rounded-xl border border-[var(--ink-200)] bg-[var(--ink-0)] text-[var(--ink-900)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-900)]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--ink-600)] mb-1">
                      {t("dashboard.settingsPage.budget.monthlyLimit")}
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ink-500)]">$</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={budgetSettings.monthlyBudgetUsd}
                        onChange={(e) => setBudgetSettings(prev => ({
                          ...prev,
                          monthlyBudgetUsd: parseFloat(e.target.value) || 0
                        }))}
                        className="w-full pl-8 pr-4 py-2 rounded-xl border border-[var(--ink-200)] bg-[var(--ink-0)] text-[var(--ink-900)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-900)]"
                      />
                    </div>
                  </div>
                </div>

                {/* Per-Query Limit */}
                <div>
                  <label className="block text-sm font-medium text-[var(--ink-600)] mb-1">
                    {t("dashboard.settingsPage.budget.perQueryMax")}
                  </label>
                  <div className="relative max-w-xs">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ink-500)]">$</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={budgetSettings.perQueryMaxUsd}
                      onChange={(e) => setBudgetSettings(prev => ({
                        ...prev,
                        perQueryMaxUsd: parseFloat(e.target.value) || 0
                      }))}
                      className="w-full pl-8 pr-4 py-2 rounded-xl border border-[var(--ink-200)] bg-[var(--ink-0)] text-[var(--ink-900)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-900)]"
                    />
                  </div>
                </div>

                {/* Alert Threshold */}
                <div>
                  <label className="block text-sm font-medium text-[var(--ink-600)] mb-1">
                    {t("dashboard.settingsPage.budget.alertThreshold")}
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min={50}
                      max={100}
                      step={5}
                      value={budgetSettings.alertAtPercent}
                      onChange={(e) => setBudgetSettings(prev => ({
                        ...prev,
                        alertAtPercent: parseInt(e.target.value)
                      }))}
                      className="flex-1 h-2 bg-[var(--ink-50)] rounded-lg appearance-none cursor-pointer accent-[var(--ink-900)]"
                    />
                    <span className="text-sm font-medium text-[var(--ink-600)] w-12 text-right">
                      {budgetSettings.alertAtPercent}%
                    </span>
                  </div>
                  <p className="text-xs text-[var(--ink-600)] mt-1">
                    {t("dashboard.settingsPage.budget.alertThresholdHint")}
                  </p>
                </div>

                {/* Budget Mode */}
                <div>
                  <label className="block text-sm font-medium text-[var(--ink-600)] mb-2">
                    {t("dashboard.settingsPage.budget.budgetMode")}
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="budgetMode"
                        value="soft"
                        checked={budgetSettings.mode === "soft"}
                        onChange={() => setBudgetSettings(prev => ({ ...prev, mode: "soft" }))}
                        className="w-4 h-4 text-[var(--ink-900)] focus:ring-[var(--ink-900)]"
                      />
                      <div>
                        <span className="text-sm font-medium text-[var(--ink-600)]">
                          {t("dashboard.settingsPage.budget.soft")}
                        </span>
                        <p className="text-xs text-[var(--ink-600)]">
                          {t("dashboard.settingsPage.budget.softDesc")}
                        </p>
                      </div>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="budgetMode"
                        value="hard"
                        checked={budgetSettings.mode === "hard"}
                        onChange={() => setBudgetSettings(prev => ({ ...prev, mode: "hard" }))}
                        className="w-4 h-4 text-[var(--ink-900)] focus:ring-[var(--ink-900)]"
                      />
                      <div>
                        <span className="text-sm font-medium text-[var(--ink-600)]">
                          {t("dashboard.settingsPage.budget.hard")}
                        </span>
                        <p className="text-xs text-[var(--ink-600)]">
                          {t("dashboard.settingsPage.budget.hardDesc")}
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Fallback Strategy */}
                <div>
                  <label className="block text-sm font-medium text-[var(--ink-600)] mb-2">
                    {t("dashboard.settingsPage.budget.fallbackStrategy")}
                  </label>
                  <select
                    value={budgetSettings.fallbackStrategy}
                    onChange={(e) => setBudgetSettings(prev => ({
                      ...prev,
                      fallbackStrategy: e.target.value as "degrade" | "reject" | "queue"
                    }))}
                    className="w-full max-w-xs rounded-xl border border-[var(--ink-200)] px-4 py-2 text-sm bg-[var(--ink-0)] text-[var(--ink-900)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-900)]"
                  >
                    <option value="degrade">{t("dashboard.settingsPage.budget.degrade")}</option>
                    <option value="reject">{t("dashboard.settingsPage.budget.reject")}</option>
                    <option value="queue">{t("dashboard.settingsPage.budget.queue")}</option>
                  </select>
                </div>

                {/* Save Button */}
                <div className="pt-4 border-t border-[var(--ink-200)]">
                  <button
                    onClick={saveBudgetSettings}
                    disabled={saveStatus === "saving"}
                    className="px-6 py-2 rounded-xl bg-[var(--ink-900)] text-white font-medium hover:from-[var(--ink-900)]/90 hover:to-[var(--ink-900)]/70 disabled:opacity-50 transition-all"
                  >
                    {saveStatus === "saving" ? t("dashboard.settingsPage.saving") : t("dashboard.settingsPage.save")}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === "notifications" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-[var(--ink-900)] mb-2">
                {t("dashboard.settingsPage.notifications.title")}
              </h2>
              <p className="text-sm text-[var(--ink-600)] mb-6">
                {t("dashboard.settingsPage.notifications.subtitle")}
              </p>
            </div>

            <div className="space-y-4">
              <NotificationToggle
                title={t("dashboard.settingsPage.notifications.emailAlerts")}
                description={t("dashboard.settingsPage.notifications.emailAlertsDesc")}
                checked={notifications.emailAlerts}
                onChange={(checked) => setNotifications(prev => ({ ...prev, emailAlerts: checked }))}
              />
              <NotificationToggle
                title={t("dashboard.settingsPage.notifications.usageAlerts")}
                description={t("dashboard.settingsPage.notifications.usageAlertsDesc")}
                checked={notifications.usageAlerts}
                onChange={(checked) => setNotifications(prev => ({ ...prev, usageAlerts: checked }))}
              />
              <NotificationToggle
                title={t("dashboard.settingsPage.notifications.weeklyDigest")}
                description={t("dashboard.settingsPage.notifications.weeklyDigestDesc")}
                checked={notifications.weeklyDigest}
                onChange={(checked) => setNotifications(prev => ({ ...prev, weeklyDigest: checked }))}
              />
              <NotificationToggle
                title={t("dashboard.settingsPage.notifications.securityAlerts")}
                description={t("dashboard.settingsPage.notifications.securityAlertsDesc")}
                checked={notifications.securityAlerts}
                onChange={(checked) => setNotifications(prev => ({ ...prev, securityAlerts: checked }))}
              />
            </div>

            {/* Telegram Connection (Future) */}
            <div className="pt-4 border-t border-[var(--ink-200)]">
              <h3 className="text-base font-medium text-[var(--ink-900)] mb-3">
                {t("dashboard.settingsPage.notifications.integrations")}
              </h3>
              <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--ink-50)] border border-[var(--ink-200)]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center">
                    <TelegramIcon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--ink-900)]">Telegram</p>
                    <p className="text-xs text-[var(--ink-600)]">{t("dashboard.settingsPage.notifications.telegramDesc")}</p>
                  </div>
                </div>
                <button
                  disabled
                  className="px-4 py-2 rounded-lg bg-[var(--ink-50)] text-[var(--ink-600)] text-sm font-medium cursor-not-allowed"
                >
                  {t("dashboard.settingsPage.notifications.comingSoon")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === "security" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-[var(--ink-900)] mb-2">
                {t("dashboard.settingsPage.security.title")}
              </h2>
              <p className="text-sm text-[var(--ink-600)] mb-6">
                {t("dashboard.settingsPage.security.subtitle")}
              </p>
            </div>

            {/* Password Change */}
            <div className="p-4 rounded-xl bg-[var(--ink-50)] border border-[var(--ink-200)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--ink-900)]">
                    {t("dashboard.settingsPage.security.changePassword")}
                  </p>
                  <p className="text-xs text-[var(--ink-600)]">
                    {t("dashboard.settingsPage.security.changePasswordDesc")}
                  </p>
                </div>
                <button
                  disabled
                  className="px-4 py-2 rounded-lg bg-[var(--ink-50)] text-[var(--ink-600)] text-sm font-medium cursor-not-allowed"
                >
                  {t("dashboard.settingsPage.notifications.comingSoon")}
                </button>
              </div>
            </div>

            {/* Two-Factor Auth */}
            <div className="p-4 rounded-xl bg-[var(--ink-50)] border border-[var(--ink-200)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--ink-900)]">
                    {t("dashboard.settingsPage.security.twoFactor")}
                  </p>
                  <p className="text-xs text-[var(--ink-600)]">
                    {t("dashboard.settingsPage.security.twoFactorDesc")}
                  </p>
                </div>
                <button
                  disabled
                  className="px-4 py-2 rounded-lg bg-[var(--ink-50)] text-[var(--ink-600)] text-sm font-medium cursor-not-allowed"
                >
                  {t("dashboard.settingsPage.notifications.comingSoon")}
                </button>
              </div>
            </div>

            {/* Session Management */}
            <div className="p-4 rounded-xl bg-[var(--ink-50)] border border-[var(--ink-200)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--ink-900)]">
                    {t("dashboard.settingsPage.security.sessions")}
                  </p>
                  <p className="text-xs text-[var(--ink-600)]">
                    {t("dashboard.settingsPage.security.sessionsDesc")}
                  </p>
                </div>
                <button
                  disabled
                  className="px-4 py-2 rounded-lg bg-[var(--ink-50)] text-[var(--ink-600)] text-sm font-medium cursor-not-allowed"
                >
                  {t("dashboard.settingsPage.notifications.comingSoon")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Danger Zone Tab */}
        {activeTab === "danger" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-[var(--signal-conflict-ink)] mb-2">
                {t("dashboard.settingsPage.dangerZone.title")}
              </h2>
              <p className="text-sm text-[var(--ink-600)] mb-6">
                {t("dashboard.settingsPage.dangerZone.titleDesc")}
              </p>
            </div>

            {/* Export Data */}
            <div className="p-4 rounded-xl border border-[var(--ink-200)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--ink-900)]">
                    {t("dashboard.settingsPage.dangerZone.exportData")}
                  </p>
                  <p className="text-xs text-[var(--ink-600)]">
                    {t("dashboard.settingsPage.dangerZone.exportDataDesc")}
                  </p>
                </div>
                <button
                  onClick={() => setShowExportModal(true)}
                  className="px-4 py-2 rounded-lg bg-[var(--ink-50)] text-[var(--ink-600)] text-sm font-medium hover:bg-[var(--ink-50)] transition-colors"
                >
                  {t("dashboard.settingsPage.dangerZone.exportData")}
                </button>
              </div>
            </div>

            {/* Delete All Memories */}
            <div className="p-4 rounded-xl border border-[var(--signal-conflict)] dark:border-[var(--signal-conflict)] bg-[var(--signal-conflict-soft)] dark:bg-[var(--signal-conflict-ink)]/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]">
                    {t("dashboard.settingsPage.dangerZone.deleteMemories")}
                  </p>
                  <p className="text-xs text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-ink)]">
                    {t("dashboard.settingsPage.dangerZone.deleteMemoriesDesc")}
                  </p>
                </div>
                <button
                  onClick={() => setShowDeleteMemoriesModal(true)}
                  className="px-4 py-2 rounded-lg bg-[var(--signal-conflict-soft)] dark:bg-[var(--signal-conflict-ink)]/40 text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)] text-sm font-medium hover:bg-[var(--signal-conflict-soft)] dark:hover:bg-[var(--signal-conflict-ink)]/60 transition-colors"
                >
                  {t("dashboard.settingsPage.dangerZone.deleteMemories")}
                </button>
              </div>
            </div>

            {/* Delete Account */}
            <div className="p-4 rounded-xl border border-[var(--signal-conflict)] dark:border-[var(--signal-conflict)] bg-[var(--signal-conflict-soft)] dark:bg-[var(--signal-conflict-ink)]/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]">
                    {t("dashboard.settingsPage.dangerZone.deleteAccount")}
                  </p>
                  <p className="text-xs text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-ink)]">
                    {t("dashboard.settingsPage.dangerZone.deleteAccountDesc")}
                  </p>
                </div>
                <button
                  onClick={() => setShowDeleteAccountModal(true)}
                  className="px-4 py-2 rounded-lg bg-[var(--signal-conflict)] text-white text-sm font-medium hover:bg-[var(--signal-conflict)] transition-colors"
                >
                  {t("dashboard.settingsPage.dangerZone.deleteAccount")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* RTBF Modals */}
      <DataExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
      />
      <DeleteMemoriesModal
        isOpen={showDeleteMemoriesModal}
        onClose={() => setShowDeleteMemoriesModal(false)}
      />
      <RTBFModal
        isOpen={showDeleteAccountModal}
        onClose={() => setShowDeleteAccountModal(false)}
      />
    </div>
  );
}

export function DataResidencyPreference({
  value,
  regionPinAvailable,
  loading = false,
  saving = false,
  onChange,
}: {
  value: PreferredRegion;
  regionPinAvailable: boolean;
  loading?: boolean;
  saving?: boolean;
  onChange: (value: PreferredRegion) => void;
}) {
  const disabled = loading || saving || !regionPinAvailable;

  return (
    <section className="rounded-xl border border-szn-border bg-szn-card p-4" data-region-preference="seoul">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-szn-text-1">Data residency preference</h4>
          <p className="mt-1 text-sm text-szn-text-2">
            Choose the compliance posture shown to Korean persona seeding workflows.
          </p>
          {!regionPinAvailable && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              Seoul residency preference requires Pro or Enterprise.
              {" "}
              <Link href="/pricing" className="font-medium underline underline-offset-2">
                Upgrade
              </Link>
            </p>
          )}
        </div>
        <label className="flex w-full flex-col gap-1 text-sm text-szn-text-2 md:w-64">
          <span>Preferred region</span>
          <select
            aria-label="Data residency preference"
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(normalizePreferredRegion(event.target.value))}
            className="w-full rounded-xl border border-szn-border bg-szn-bg px-3 py-2 text-sm text-szn-text-1 focus:outline-none focus:ring-2 focus:ring-szn-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {REGION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

function UsageCard({
  title,
  icon,
  used,
  limit,
  t,
}: {
  title: string;
  icon: React.ReactNode;
  used: number;
  limit: number;
  t: (key: string) => string;
}) {
  const percent = getUsagePercent(used, limit);
  const critical = isUsageCritical(used, limit);
  const warning = isUsageWarning(used, limit);

  return (
    <div className={`p-4 rounded-xl border ${
      critical
        ? "border-[var(--signal-conflict)] dark:border-[var(--signal-conflict)] bg-[var(--signal-conflict-soft)] dark:bg-[var(--signal-conflict-ink)]/20"
        : warning
        ? "border-[var(--signal-pending)] dark:border-[var(--signal-pending)] bg-[var(--signal-pending-soft)] dark:bg-[var(--signal-pending-ink)]/20"
        : "border-[var(--ink-200)] bg-[var(--ink-50)]"
    }`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={critical ? "text-[var(--signal-conflict-ink)] dark:text-[var(--signal-conflict-soft)]" : warning ? "text-[var(--signal-pending-ink)] dark:text-[var(--signal-pending-soft)]" : "text-[var(--ink-600)]"}>
          {icon}
        </span>
        <span className="text-sm font-medium text-[var(--ink-900)]">{title}</span>
      </div>
      <div className="flex items-end justify-between mb-2">
        <span className="text-2xl font-bold text-[var(--ink-900)]">
          {used.toLocaleString()}
        </span>
        <span className="text-sm text-[var(--ink-600)]">
          / {limit === -1 ? (t("dashboard.settingsPage.billing.unlimited") || "Unlimited") : limit.toLocaleString()}
        </span>
      </div>
      {limit !== -1 && (
        <div className="w-full h-2 bg-[var(--ink-50)] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              critical ? "bg-[var(--signal-conflict)]" : warning ? "bg-[var(--signal-pending)]" : "bg-[var(--ink-900)]"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}

function NotificationToggle({
  title,
  description,
  checked,
  onChange
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--ink-50)] border border-[var(--ink-200)]">
      <div>
        <p className="text-sm font-medium text-[var(--ink-900)]">{title}</p>
        <p className="text-xs text-[var(--ink-600)]">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          checked ? "bg-[var(--ink-900)]" : "bg-[var(--ink-50)]"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}

// Icons
function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}

function CreditCardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  );
}

function BudgetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  );
}

function ExclamationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}

function UpgradeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function MemoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
  );
}

function ApiIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}
