"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import { locales, localeNames, type Locale } from "@/i18n/config";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";

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

type SettingsTab = "profile" | "budget" | "notifications" | "security" | "danger";

export function SettingsClient() {
  const { status: sessionStatus } = useSession();
  const { t } = useDashboardTranslation();
  const [profile, setProfile] = useState<ProfileData>({});
  const [language, setLanguage] = useState<Locale>("en");
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

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

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await fetch("/api/me", { credentials: "include" });
        if (res.status === 401) return;
        const data = await res.json();
        setProfile({
          email: data?.user?.email,
          name: data?.user?.name,
          language: data?.user?.language || "en",
        });
        setLanguage((data?.user?.language as Locale) || "en");
      } catch (err) {
        console.error("Failed to load profile", err);
      }
    };
    loadProfile();
  }, []);

  // Load budget settings
  useEffect(() => {
    const loadBudgetSettings = async () => {
      try {
        const res = await fetch("/api/budget/settings", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.settings) {
            setBudgetSettings(data.settings);
          }
        }
      } catch (err) {
        console.error("Failed to load budget settings", err);
      } finally {
        setBudgetLoading(false);
      }
    };
    loadBudgetSettings();
  }, []);

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
      console.error(err);
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
      console.error(err);
      setSaveStatus("error");
    }
  }, [budgetSettings]);

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: "profile", label: t("dashboard.settingsPage.tabs.profile"), icon: <UserIcon className="w-4 h-4" /> },
    { id: "budget", label: t("dashboard.settingsPage.tabs.budget"), icon: <BudgetIcon className="w-4 h-4" /> },
    { id: "notifications", label: t("dashboard.settingsPage.tabs.notifications"), icon: <BellIcon className="w-4 h-4" /> },
    { id: "security", label: t("dashboard.settingsPage.tabs.security"), icon: <ShieldIcon className="w-4 h-4" /> },
    { id: "danger", label: t("dashboard.settingsPage.tabs.danger"), icon: <WarningIcon className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      {sessionStatus === "loading" && (
        <div className="text-sm text-gray-500">{t("dashboard.settingsPage.loading")}</div>
      )}
      {sessionStatus === "unauthenticated" && (
        <div className="text-sm text-red-600">{t("dashboard.settingsPage.loginRequired")}</div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">{t("dashboard.settingsPage.title")}</p>
          <h1 className="text-2xl font-semibold text-gray-900">{t("dashboard.settingsPage.subtitle")}</h1>
        </div>
        {saveStatus === "saving" && <span className="text-sm text-gray-500">{t("dashboard.settingsPage.saving")}</span>}
        {saveStatus === "saved" && <span className="text-sm text-emerald-600">{t("dashboard.settingsPage.saved")}</span>}
        {saveStatus === "error" && <span className="text-sm text-red-600">{t("dashboard.settingsPage.saveFailed")}</span>}
      </header>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="glass-card border border-gray-200 rounded-2xl p-6">
        {/* Profile Tab */}
        {activeTab === "profile" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {t("dashboard.settingsPage.account")}
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("dashboard.settingsPage.email")}
                  </label>
                  <input
                    type="email"
                    value={profile.email || ""}
                    disabled
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 bg-gray-50 text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("dashboard.settingsPage.name")}
                  </label>
                  <input
                    type="text"
                    value={profile.name || ""}
                    disabled
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 bg-gray-50 text-gray-500"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-medium text-gray-900">{t("dashboard.language")}</h3>
                <span className="text-xs text-gray-500">{t("dashboard.settingsPage.languageHint")}</span>
              </div>
              <select
                value={language}
                onChange={(e) => {
                  const lang = e.target.value as Locale;
                  setLanguage(lang);
                  saveLanguage(lang);
                }}
                className="w-full max-w-xs rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {locales.map((l) => (
                  <option key={l} value={l}>
                    {localeNames[l]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Budget Tab */}
        {activeTab === "budget" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                {t("dashboard.settingsPage.budgetTitle")}
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                {t("dashboard.settingsPage.budgetDesc")}
              </p>
            </div>

            {budgetLoading ? (
              <div className="py-12 text-center text-gray-500">
                {t("dashboard.settingsPage.loading")}
              </div>
            ) : (
              <>
                {/* Budget Limits */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t("dashboard.settingsPage.dailyBudget")}
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={budgetSettings.dailyBudgetUsd}
                        onChange={(e) => setBudgetSettings(prev => ({
                          ...prev,
                          dailyBudgetUsd: parseFloat(e.target.value) || 0
                        }))}
                        className="w-full pl-8 pr-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t("dashboard.settingsPage.monthlyBudget")}
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={budgetSettings.monthlyBudgetUsd}
                        onChange={(e) => setBudgetSettings(prev => ({
                          ...prev,
                          monthlyBudgetUsd: parseFloat(e.target.value) || 0
                        }))}
                        className="w-full pl-8 pr-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Per-Query Limit */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("dashboard.settingsPage.perQueryMax")}
                  </label>
                  <div className="relative max-w-xs">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={budgetSettings.perQueryMaxUsd}
                      onChange={(e) => setBudgetSettings(prev => ({
                        ...prev,
                        perQueryMaxUsd: parseFloat(e.target.value) || 0
                      }))}
                      className="w-full pl-8 pr-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>

                {/* Alert Threshold */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("dashboard.settingsPage.alertThreshold")}
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
                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-500"
                    />
                    <span className="text-sm font-medium text-gray-700 w-12 text-right">
                      {budgetSettings.alertAtPercent}%
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {t("dashboard.settingsPage.alertThresholdHint")}
                  </p>
                </div>

                {/* Budget Mode */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t("dashboard.settingsPage.budgetMode")}
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="budgetMode"
                        value="soft"
                        checked={budgetSettings.mode === "soft"}
                        onChange={() => setBudgetSettings(prev => ({ ...prev, mode: "soft" }))}
                        className="w-4 h-4 text-teal-500 focus:ring-teal-500"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-700">
                          {t("dashboard.settingsPage.modeSoft")}
                        </span>
                        <p className="text-xs text-gray-500">
                          {t("dashboard.settingsPage.modeSoftDesc")}
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
                        className="w-4 h-4 text-teal-500 focus:ring-teal-500"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-700">
                          {t("dashboard.settingsPage.modeHard")}
                        </span>
                        <p className="text-xs text-gray-500">
                          {t("dashboard.settingsPage.modeHardDesc")}
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Fallback Strategy */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t("dashboard.settingsPage.fallbackStrategy")}
                  </label>
                  <select
                    value={budgetSettings.fallbackStrategy}
                    onChange={(e) => setBudgetSettings(prev => ({
                      ...prev,
                      fallbackStrategy: e.target.value as "degrade" | "reject" | "queue"
                    }))}
                    className="w-full max-w-xs rounded-xl border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="degrade">{t("dashboard.settingsPage.strategyDegrade")}</option>
                    <option value="reject">{t("dashboard.settingsPage.strategyReject")}</option>
                    <option value="queue">{t("dashboard.settingsPage.strategyQueue")}</option>
                  </select>
                </div>

                {/* Save Button */}
                <div className="pt-4 border-t border-gray-200">
                  <button
                    onClick={saveBudgetSettings}
                    disabled={saveStatus === "saving"}
                    className="px-6 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-medium hover:from-teal-600 hover:to-cyan-600 disabled:opacity-50 transition-all"
                  >
                    {saveStatus === "saving" ? t("dashboard.settingsPage.saving") : t("dashboard.settingsPage.saveChanges")}
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
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                {t("dashboard.settingsPage.notificationsTitle")}
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                {t("dashboard.settingsPage.notificationsDesc")}
              </p>
            </div>

            <div className="space-y-4">
              <NotificationToggle
                title={t("dashboard.settingsPage.emailAlerts")}
                description={t("dashboard.settingsPage.emailAlertsDesc")}
                checked={notifications.emailAlerts}
                onChange={(checked) => setNotifications(prev => ({ ...prev, emailAlerts: checked }))}
              />
              <NotificationToggle
                title={t("dashboard.settingsPage.usageAlerts")}
                description={t("dashboard.settingsPage.usageAlertsDesc")}
                checked={notifications.usageAlerts}
                onChange={(checked) => setNotifications(prev => ({ ...prev, usageAlerts: checked }))}
              />
              <NotificationToggle
                title={t("dashboard.settingsPage.weeklyDigest")}
                description={t("dashboard.settingsPage.weeklyDigestDesc")}
                checked={notifications.weeklyDigest}
                onChange={(checked) => setNotifications(prev => ({ ...prev, weeklyDigest: checked }))}
              />
              <NotificationToggle
                title={t("dashboard.settingsPage.securityAlerts")}
                description={t("dashboard.settingsPage.securityAlertsDesc")}
                checked={notifications.securityAlerts}
                onChange={(checked) => setNotifications(prev => ({ ...prev, securityAlerts: checked }))}
              />
            </div>

            {/* Telegram Connection (Future) */}
            <div className="pt-4 border-t border-gray-200">
              <h3 className="text-base font-medium text-gray-900 mb-3">
                {t("dashboard.settingsPage.integrations")}
              </h3>
              <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center">
                    <TelegramIcon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Telegram</p>
                    <p className="text-xs text-gray-500">{t("dashboard.settingsPage.telegramDesc")}</p>
                  </div>
                </div>
                <button
                  disabled
                  className="px-4 py-2 rounded-lg bg-gray-200 text-gray-500 text-sm font-medium cursor-not-allowed"
                >
                  {t("dashboard.settingsPage.comingSoon")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === "security" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                {t("dashboard.settingsPage.securityTitle")}
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                {t("dashboard.settingsPage.securityDesc")}
              </p>
            </div>

            {/* Password Change */}
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {t("dashboard.settingsPage.password")}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t("dashboard.settingsPage.passwordDesc")}
                  </p>
                </div>
                <button className="px-4 py-2 rounded-lg bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  {t("dashboard.settingsPage.changePassword")}
                </button>
              </div>
            </div>

            {/* Two-Factor Auth */}
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {t("dashboard.settingsPage.twoFactor")}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t("dashboard.settingsPage.twoFactorDesc")}
                  </p>
                </div>
                <button
                  disabled
                  className="px-4 py-2 rounded-lg bg-gray-200 text-gray-500 text-sm font-medium cursor-not-allowed"
                >
                  {t("dashboard.settingsPage.comingSoon")}
                </button>
              </div>
            </div>

            {/* Session Management */}
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {t("dashboard.settingsPage.activeSessions")}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t("dashboard.settingsPage.activeSessionsDesc")}
                  </p>
                </div>
                <button className="px-4 py-2 rounded-lg bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  {t("dashboard.settingsPage.manageSessions")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Danger Zone Tab */}
        {activeTab === "danger" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-red-600 mb-2">
                {t("dashboard.settingsPage.dangerZone")}
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                {t("dashboard.settingsPage.dangerZoneDesc")}
              </p>
            </div>

            {/* Export Data */}
            <div className="p-4 rounded-xl border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {t("dashboard.settingsPage.exportData")}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t("dashboard.settingsPage.exportDataDesc")}
                  </p>
                </div>
                <button className="px-4 py-2 rounded-lg bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  {t("dashboard.settingsPage.export")}
                </button>
              </div>
            </div>

            {/* Delete All Memories */}
            <div className="p-4 rounded-xl border border-red-200 bg-red-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-red-700">
                    {t("dashboard.settingsPage.deleteMemories")}
                  </p>
                  <p className="text-xs text-red-600">
                    {t("dashboard.settingsPage.deleteMemoriesDesc")}
                  </p>
                </div>
                <button className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">
                  {t("dashboard.settingsPage.deleteAll")}
                </button>
              </div>
            </div>

            {/* Delete Account */}
            <div className="p-4 rounded-xl border border-red-200 bg-red-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-red-700">
                    {t("dashboard.settingsPage.deleteAccount")}
                  </p>
                  <p className="text-xs text-red-600">
                    {t("dashboard.settingsPage.deleteAccountDesc")}
                  </p>
                </div>
                <button className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">
                  {t("dashboard.settingsPage.delete")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
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
    <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-200">
      <div>
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          checked ? "bg-teal-500" : "bg-gray-300"
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
