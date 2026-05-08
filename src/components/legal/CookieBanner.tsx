'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { readConsent, writeConsent, type ConsentState } from '@/lib/consent';

function subscribeConsent(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener('seizn-consent-change', listener);
  return () => window.removeEventListener('seizn-consent-change', listener);
}

function getConsentSnapshot(): ConsentState | null {
  return readConsent();
}

function getServerSnapshot(): ConsentState | null {
  return null;
}

interface CookieBannerProps {
  locale?: string;
}

interface BannerCopy {
  headline: string;
  body: string;
  acceptAll: string;
  rejectAll: string;
  customize: string;
  necessaryLabel: string;
  necessaryDesc: string;
  analyticsLabel: string;
  analyticsDesc: string;
  marketingLabel: string;
  marketingDesc: string;
  save: string;
  privacyLink: string;
  alwaysOn: string;
}

const COPY: Record<string, BannerCopy> = {
  en: {
    headline: 'Cookies and tracking',
    body: 'We use cookies for sign-in and a few optional analytics services. You can opt out of anything that is not strictly necessary. See our',
    acceptAll: 'Accept all',
    rejectAll: 'Reject all',
    customize: 'Customize',
    necessaryLabel: 'Strictly necessary',
    necessaryDesc: 'Auth, CSRF token, locale. Required to use Seizn.',
    analyticsLabel: 'Analytics',
    analyticsDesc: 'Google Analytics + PostHog. Helps us improve the product. (Plausible is cookieless — always exempt.)',
    marketingLabel: 'Marketing',
    marketingDesc: 'Currently unused. Reserved for any future ad attribution pixels.',
    save: 'Save preferences',
    privacyLink: 'Privacy Policy',
    alwaysOn: 'Always on',
  },
  ko: {
    headline: '쿠키 및 추적',
    body: '로그인을 위한 필수 쿠키와 일부 선택적 분석 서비스를 사용합니다. 필수가 아닌 항목은 거부할 수 있습니다. 자세한 내용은',
    acceptAll: '전체 수락',
    rejectAll: '전체 거부',
    customize: '맞춤 설정',
    necessaryLabel: '필수',
    necessaryDesc: '로그인, CSRF 토큰, 로케일. Seizn 사용에 필수입니다.',
    analyticsLabel: '분석',
    analyticsDesc: 'Google Analytics + PostHog. 제품 개선을 위해 사용합니다. (Plausible은 쿠키 없이 동작하므로 항상 면제)',
    marketingLabel: '마케팅',
    marketingDesc: '현재 미사용. 향후 광고 추적 픽셀을 위해 예약.',
    save: '설정 저장',
    privacyLink: '개인정보 처리방침',
    alwaysOn: '항상 켜짐',
  },
};

export function CookieBanner({ locale = 'en' }: CookieBannerProps) {
  const copy = COPY[locale] ?? COPY.en;
  const state = useSyncExternalStore(
    subscribeConsent,
    getConsentSnapshot,
    getServerSnapshot
  );
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Defer all setState calls into setTimeout to avoid synchronous effect setState.
    if (!state) {
      const id = window.setTimeout(() => setOpen(true), 100);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(id);
  }, [state]);

  const apply = (analytics: boolean, marketing: boolean) => {
    writeConsent({ analytics, marketing });
    setOpen(false);
  };

  if (!open && state) return null;

  return (
    <div
      role="dialog"
      aria-label={copy.headline}
      aria-modal="false"
      className="fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-3xl rounded-[var(--radius-lg)] border p-5 md:p-6"
      style={{
        borderColor: 'var(--ink-200)',
        background: 'var(--bg-elevated)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="md:max-w-[60%]">
          <p className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>
            {copy.headline}
          </p>
          <p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
            {copy.body}{' '}
            <Link
              href="/legal/privacy"
              className="underline-offset-2 hover:underline"
              style={{ color: 'var(--accent-primary)' }}
            >
              {copy.privacyLink}
            </Link>
            .
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => apply(false, false)}
            className="author-btn px-4 py-2 text-sm"
            style={{ background: 'var(--bg)', color: 'var(--text-primary)', border: '1px solid var(--ink-200)' }}
          >
            {copy.rejectAll}
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="author-btn px-4 py-2 text-sm"
            style={{ background: 'var(--bg)', color: 'var(--text-primary)', border: '1px solid var(--ink-200)' }}
            aria-expanded={expanded ? 'true' : 'false'}
          >
            {copy.customize}
          </button>
          <button
            type="button"
            onClick={() => apply(true, true)}
            className="author-btn px-4 py-2 text-sm font-medium"
            style={{ background: 'var(--accent-primary)', color: 'var(--accent-on-primary)' }}
          >
            {copy.acceptAll}
          </button>
        </div>
      </div>

      {expanded ? (
        <CustomizePanel
          copy={copy}
          onSave={(analytics, marketing) => apply(analytics, marketing)}
        />
      ) : null}
    </div>
  );
}

function CustomizePanel({
  copy,
  onSave,
}: {
  copy: BannerCopy;
  onSave: (analytics: boolean, marketing: boolean) => void;
}) {
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(false);

  return (
    <div className="mt-5 grid gap-3 border-t pt-4" style={{ borderColor: 'var(--ink-100)' }}>
      <ConsentRow
        label={copy.necessaryLabel}
        desc={copy.necessaryDesc}
        checked
        disabled
        rightLabel={copy.alwaysOn}
        onChange={() => undefined}
      />
      <ConsentRow
        label={copy.analyticsLabel}
        desc={copy.analyticsDesc}
        checked={analytics}
        onChange={setAnalytics}
      />
      <ConsentRow
        label={copy.marketingLabel}
        desc={copy.marketingDesc}
        checked={marketing}
        onChange={setMarketing}
      />
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={() => onSave(analytics, marketing)}
          className="author-btn px-4 py-2 text-sm font-medium"
          style={{ background: 'var(--accent-primary)', color: 'var(--accent-on-primary)' }}
        >
          {copy.save}
        </button>
      </div>
    </div>
  );
}

function ConsentRow({
  label,
  desc,
  checked,
  disabled,
  rightLabel,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  rightLabel?: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border p-3" style={{ borderColor: 'var(--ink-100)' }}>
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {label}
        </p>
        <p className="mt-1 text-xs leading-5" style={{ color: 'var(--text-tertiary)' }}>
          {desc}
        </p>
      </div>
      <div className="flex items-center gap-2 whitespace-nowrap">
        {rightLabel ? (
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {rightLabel}
          </span>
        ) : null}
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={label}
          className="h-4 w-4"
          style={{ accentColor: 'var(--accent-primary)' }}
        />
      </div>
    </div>
  );
}
