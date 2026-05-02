"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";
import { getLegalPath, resolveLegalContentLocale } from "@/lib/legal-routes";

const COOKIE_NAME = "seizn_beta_disclosure_dismissed";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const BANNER_COPY = {
  en: {
    title: "Seizn Author is in beta",
    body: "Some storage infrastructure is temporarily operated during beta before migration to Litheon LLC.",
    link: "Read beta disclosure",
    dismiss: "Dismiss",
  },
  ko: {
    title: "Seizn Author는 베타입니다",
    body: "일부 스토리지 인프라는 Litheon LLC 이전 전까지 베타 기간에 임시 운영됩니다.",
    link: "베타 고지 보기",
    dismiss: "닫기",
  },
  ja: {
    title: "Seizn Author はベータ版です",
    body: "一部のストレージ基盤は Litheon LLC への移行前にベータ期間中の暫定運用となります。",
    link: "ベータ開示を見る",
    dismiss: "閉じる",
  },
  zh: {
    title: "Seizn Author 处于 beta 阶段",
    body: "部分存储基础设施在迁移至 Litheon LLC 之前会在 beta 期间临时运行。",
    link: "查看 beta 披露",
    dismiss: "关闭",
  },
};

export function BetaDisclosureBanner() {
  const { locale } = useDashboardTranslation();
  const dismissedByCookie = useSyncExternalStore(subscribeCookieSnapshot, hasDismissedCookie, () => true);
  const [dismissedInSession, setDismissedInSession] = useState(false);
  const dismissed = dismissedByCookie || dismissedInSession;
  const contentLocale = resolveLegalContentLocale(locale);
  const copy = BANNER_COPY[contentLocale];

  if (dismissed) return null;

  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950" role="status">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold">{copy.title}</p>
          <p className="mt-1 text-sm leading-6">{copy.body}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={getLegalPath(locale, "beta-disclosure")}
            className="rounded-lg bg-amber-900 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800"
          >
            {copy.link}
          </Link>
          <button
            type="button"
            onClick={() => {
              document.cookie = `${COOKIE_NAME}=1; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax`;
              setDismissedInSession(true);
            }}
            className="rounded-lg border border-amber-600 px-3 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100"
          >
            {copy.dismiss}
          </button>
        </div>
      </div>
    </div>
  );
}

export function hasDismissedCookie(): boolean {
  if (typeof document === "undefined") return true;
  return document.cookie.split(";").some((entry) => entry.trim() === `${COOKIE_NAME}=1`);
}

function subscribeCookieSnapshot(): () => void {
  return () => undefined;
}
