'use client';

import { useState } from 'react';
import type { Locale } from '@/i18n/config';

interface PricingTrack3SectionProps {
  locale: Locale;
}

interface Track3Copy {
  badge: string;
  headline: string;
  subheadline: string;
  releaseTarget: string;
  emailLabel: string;
  emailPlaceholder: string;
  submitLabel: string;
  submittingLabel: string;
  successHeadline: string;
  successBody: string;
  errorGeneric: string;
  errorRateLimited: string;
  errorInvalidEmail: string;
  benefitsTitle: string;
  benefit1: string;
  benefit2: string;
  benefit3: string;
}

const COPY: Record<'en' | 'ko', Track3Copy> = {
  en: {
    badge: 'Coming Soon',
    headline: 'Seizn Desktop',
    subheadline: 'Native desktop authoring app with offline-first memory, mouse-gesture commands, and direct local file integration.',
    releaseTarget: 'Targeting Q3 2026 — sign up to be among the first invited.',
    emailLabel: 'Email',
    emailPlaceholder: 'you@example.com',
    submitLabel: 'Join the waitlist',
    submittingLabel: 'Submitting…',
    successHeadline: "You're on the list",
    successBody: "We've sent a confirmation email. Click the link inside to lock in your spot.",
    errorGeneric: 'Something went wrong. Please try again.',
    errorRateLimited: 'Too many requests. Please try again in a minute.',
    errorInvalidEmail: 'Please enter a valid email address.',
    benefitsTitle: 'What waitlist members get',
    benefit1: 'First invites when Desktop opens',
    benefit2: 'Charter pricing eligibility (locked until 2027-05-01)',
    benefit3: 'Free tier preserved with offline-only mode',
  },
  ko: {
    badge: '준비 중',
    headline: 'Seizn Desktop',
    subheadline: '오프라인 우선 메모리, 마우스 제스처 명령어, 로컬 파일 직접 연동을 갖춘 네이티브 데스크톱 작가 앱.',
    releaseTarget: '2026년 3분기 목표 — 첫 초대 대상으로 등록하세요.',
    emailLabel: '이메일',
    emailPlaceholder: 'you@example.com',
    submitLabel: '대기 명단 등록',
    submittingLabel: '등록 중…',
    successHeadline: '대기 명단에 등록되었습니다',
    successBody: '확인 메일을 보냈습니다. 메일 안의 링크를 눌러 등록을 완료해주세요.',
    errorGeneric: '문제가 발생했습니다. 다시 시도해주세요.',
    errorRateLimited: '요청이 너무 많습니다. 1분 후 다시 시도해주세요.',
    errorInvalidEmail: '유효한 이메일 주소를 입력해주세요.',
    benefitsTitle: '대기 명단 등록 시 혜택',
    benefit1: 'Desktop 출시 시 첫 초대 대상',
    benefit2: '차터 가격 적용 자격 (2027-05-01까지 락인)',
    benefit3: '오프라인 전용 모드로 무료 티어 유지',
  },
};

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function PricingTrack3Section({ locale }: PricingTrack3SectionProps) {
  const copy = locale === 'ko' ? COPY.ko : COPY.en;
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'submitting') return;

    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setStatus('error');
      setErrorMessage(copy.errorInvalidEmail);
      return;
    }

    setStatus('submitting');
    setErrorMessage('');

    try {
      const response = await fetch('/api/waitlist/desktop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmed,
          locale: locale === 'ko' ? 'ko' : 'en',
          source_utm: typeof window !== 'undefined'
            ? Object.fromEntries(new URL(window.location.href).searchParams.entries())
            : null,
        }),
      });

      if (response.status === 429) {
        setStatus('error');
        setErrorMessage(copy.errorRateLimited);
        return;
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus('error');
        setErrorMessage(copy.errorGeneric);
        return;
      }

      setStatus('success');
      setEmail('');
      // Track funnel event would go here (W5.1 extension).
      void data;
    } catch {
      setStatus('error');
      setErrorMessage(copy.errorGeneric);
    }
  };

  return (
    <div className="rounded-[var(--radius-lg)] border p-8 md:p-12" style={{ borderColor: 'var(--ink-200)', background: 'var(--bg-elevated)' }}>
      <span
        className="author-badge"
        style={{ background: 'var(--sev-p2-bg)', color: 'var(--sev-p2-text)', border: '1px solid var(--sev-p2-border)' }}
      >
        <span className="author-badge-dot" />
        {copy.badge}
      </span>
      <h2 className="author-serif mt-6 text-4xl" style={{ color: 'var(--text-primary)' }}>
        {copy.headline}
      </h2>
      <p className="mt-3 text-base leading-relaxed" style={{ color: 'var(--text-secondary)', maxWidth: '52ch' }}>
        {copy.subheadline}
      </p>
      <p className="mt-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
        {copy.releaseTarget}
      </p>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        {/* Email form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
          <label htmlFor="track3-email" className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {copy.emailLabel}
          </label>
          <input
            id="track3-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={copy.emailPlaceholder}
            required
            disabled={status === 'submitting' || status === 'success'}
            className="rounded-[var(--radius-md)] border px-4 py-3 text-sm"
            style={{
              borderColor: status === 'error' ? 'var(--signal-conflict)' : 'var(--ink-200)',
              background: 'var(--bg)',
              color: 'var(--text-primary)',
            }}
          />
          <button
            type="submit"
            disabled={status === 'submitting' || status === 'success'}
            className="author-btn px-4 py-3 text-sm font-medium"
            style={{
              background: status === 'success' ? 'var(--signal-canon)' : 'var(--accent-primary)',
              color: 'var(--accent-on-primary)',
              cursor: status === 'submitting' || status === 'success' ? 'not-allowed' : 'pointer',
            }}
          >
            {status === 'submitting' ? copy.submittingLabel : status === 'success' ? '✓' : copy.submitLabel}
          </button>

          {status === 'success' ? (
            <div className="mt-2 rounded-md p-3 text-sm" style={{ background: 'var(--signal-canon-soft)', color: 'var(--signal-canon-ink)' }}>
              <p className="font-medium">{copy.successHeadline}</p>
              <p className="mt-1">{copy.successBody}</p>
            </div>
          ) : null}

          {status === 'error' && errorMessage ? (
            <p className="text-sm" role="alert" style={{ color: 'var(--signal-conflict-ink)' }}>
              {errorMessage}
            </p>
          ) : null}
        </form>

        {/* Benefits */}
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {copy.benefitsTitle}
          </p>
          <ul className="mt-3 space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <li className="flex gap-2">
              <span style={{ color: 'var(--signal-canon)' }}>•</span>
              <span>{copy.benefit1}</span>
            </li>
            <li className="flex gap-2">
              <span style={{ color: 'var(--signal-canon)' }}>•</span>
              <span>{copy.benefit2}</span>
            </li>
            <li className="flex gap-2">
              <span style={{ color: 'var(--signal-canon)' }}>•</span>
              <span>{copy.benefit3}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
