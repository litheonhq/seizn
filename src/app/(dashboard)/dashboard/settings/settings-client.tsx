"use client";

import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { locales, localeNames, type Locale } from "@/i18n/config";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";

interface ProfileData {
  email?: string | null;
  name?: string | null;
  language?: Locale;
}

export function SettingsClient() {
  const { status: sessionStatus } = useSession();
  const { t, locale: currentLocale } = useDashboardTranslation();
  const [profile, setProfile] = useState<ProfileData>({});
  const [language, setLanguage] = useState<Locale>("en");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

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
      // Reload page to apply new language
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
    }
  };

  return (
    <div className="space-y-6">
      {sessionStatus === "loading" && (
        <div className="text-sm text-gray-500">{t("dashboard.settingsPage.loading")}</div>
      )}
      {sessionStatus === "unauthenticated" && (
        <div className="text-sm text-red-600">{t("dashboard.settingsPage.loginRequired")}</div>
      )}
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">{t("dashboard.settingsPage.title")}</p>
          <h1 className="text-2xl font-semibold text-gray-900">{t("dashboard.settingsPage.subtitle")}</h1>
        </div>
        {saveStatus === "saving" && <span className="text-sm text-gray-500">{t("dashboard.settingsPage.saving")}</span>}
        {saveStatus === "saved" && <span className="text-sm text-emerald-600">{t("dashboard.settingsPage.saved")}</span>}
        {saveStatus === "error" && <span className="text-sm text-red-600">{t("dashboard.settingsPage.saveFailed")}</span>}
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white/80 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("dashboard.settingsPage.account")}</h2>
          <div className="space-y-2 text-sm text-gray-700">
            <div className="flex justify-between"><span>{t("dashboard.settingsPage.email")}</span><span className="font-medium">{profile.email || "-"}</span></div>
            <div className="flex justify-between"><span>{t("dashboard.settingsPage.name")}</span><span className="font-medium">{profile.name || "-"}</span></div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white/80 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">{t("dashboard.language")}</h2>
            <span className="text-xs text-gray-500">{t("dashboard.settingsPage.languageHint")}</span>
          </div>
          <select
            value={language}
            onChange={(e) => {
              const lang = e.target.value as Locale;
              setLanguage(lang);
              saveLanguage(lang);
            }}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {locales.map((l) => (
              <option key={l} value={l}>
                {localeNames[l]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
