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
    untilLabel: "Beta period until",
  },
  ko: {
    title: "Seizn Author는 베타입니다",
    body: "일부 스토리지 인프라는 Litheon LLC 이전 전까지 베타 기간에 임시 운영됩니다.",
    link: "베타 고지 보기",
    dismiss: "닫기",
    untilLabel: "베타 기간 종료일",
  },
  ja: {
    title: "Seizn Authorはベータ版です",
    body: "一部のストレージ基盤は、Litheon LLCへの移行前のベータ期間中に暫定運用されています。",
    link: "ベータ開示を読む",
    dismiss: "閉じる",
    untilLabel: "ベータ期間終了日",
  },
  zh: {
    title: "Seizn Author 仍处于 Beta 阶段",
    body: "部分存储基础设施在迁移至 Litheon LLC 前，会在 Beta 期间临时运行。",
    link: "阅读 Beta 披露",
    dismiss: "关闭",
    untilLabel: "Beta 期限",
  },
};

interface BetaDisclosureBannerProps {
  betaUntil?: string | null;
  now?: Date | string;
}

export function BetaDisclosureBanner({ betaUntil, now }: BetaDisclosureBannerProps = {}) {
  const { locale } = useDashboardTranslation();
  const dismissedByCookie = useSyncExternalStore(subscribeCookieSnapshot, hasDismissedCookie, () => true);
  const [dismissedInSession, setDismissedInSession] = useState(false);
  const dismissed = dismissedByCookie || dismissedInSession;
  const contentLocale = resolveLegalContentLocale(locale);
  const copy = BANNER_COPY[contentLocale];
  const betaUntilDate = parseBetaUntilDate(betaUntil);

  if (dismissed || !isBetaDisclosureActive(betaUntil, now)) return null;

  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950" role="status">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold">{copy.title}</p>
          <p className="mt-1 text-sm leading-6">{copy.body}</p>
          {betaUntil && betaUntilDate ? (
            <p className="mt-1 text-xs leading-5">
              {copy.untilLabel}:{" "}
              <time dateTime={betaUntil}>{formatBetaUntilDate(betaUntilDate, contentLocale)}</time>
            </p>
          ) : null}
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

export function isBetaDisclosureActive(
  betaUntil: string | null | undefined,
  now: Date | string = new Date()
): boolean {
  const betaUntilDate = parseBetaUntilDate(betaUntil);
  if (!betaUntilDate) return true;

  const currentDate = typeof now === "string" ? new Date(now) : now;
  if (Number.isNaN(currentDate.getTime())) return true;
  return currentDate.getTime() <= betaUntilDate.getTime();
}

function parseBetaUntilDate(betaUntil: string | null | undefined): Date | null {
  if (!betaUntil || !/^\d{4}-\d{2}-\d{2}$/.test(betaUntil)) return null;
  const date = new Date(`${betaUntil}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatBetaUntilDate(date: Date, locale: string): string {
  const normalizedLocale = locale === "zh" ? "zh-hans" : locale;
  return new Intl.DateTimeFormat(normalizedLocale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function subscribeCookieSnapshot(): () => void {
  return () => undefined;
}
