'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DATA_RETENTION, REFUND_POLICY, formatDays } from '@/lib/policy';

interface ReconsentClientProps {
  currentVersion: string;
  acceptedVersion: string | null;
  acceptedAt: string | null;
  upToDate: boolean;
}

const refundWindowHyphen = `${REFUND_POLICY.GUARANTEE_DAYS}-day`;
const readOnlyWindow = formatDays(DATA_RETENTION.ACCOUNT_DELETION_DAYS);

const CHANGE_LIST = [
  {
    title: 'Resend transactional email — added',
    body: 'Email delivery now goes through Plus Five Five Inc. (dba Resend), an EU-US DPF certified processor. Listed in §6 sub-processors and the new sub-processor list.',
  },
  {
    title: 'Self-hosted observability — substituted',
    body: 'Sentry SaaS replaced with self-hosted GlitchTip on Hetzner (Germany). Plausible Analytics moved to self-hosted Community Edition on the same host. Both are first-party from a data-flow perspective.',
  },
  {
    title: 'EU AI Act Article 50 disclosure — added',
    body: 'New /legal/ai-disclosure documents what AI models we use, when AI interactions are signaled, and your rights. Effective Article 50: 2026-08-02.',
  },
  {
    title: 'Refund policy — added',
    body: `Standalone /legal/refund page with ${refundWindowHyphen} annual refund + monthly cancel-anytime + Charter mechanics.`,
  },
  {
    title: 'Cookie consent — added',
    body: '3-tier banner (Necessary / Analytics / Marketing). Plausible exempt because it is cookieless. Google Consent Mode v2 wired throughout.',
  },
];

export function ReconsentClient({ currentVersion, acceptedVersion, acceptedAt, upToDate }: ReconsentClientProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(upToDate);

  const onAccept = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/legal/reconsent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptedVersion: currentVersion }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (response.status === 409) {
          setError('Versions changed while you were reviewing. Please refresh and try again.');
        } else {
          setError(data?.error ?? 'Failed to record consent');
        }
        return;
      }
      setDone(true);
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-[var(--radius-lg)] border p-8 text-center"
        style={{
          borderColor: 'var(--signal-canon-soft)',
          background: 'var(--signal-canon-soft)',
          color: 'var(--signal-canon-ink)',
        }}
      >
        <h1 className="author-serif text-2xl">Thank you</h1>
        <p className="mt-2 text-sm">
          Your consent for the current Terms ({currentVersion}) is recorded
          {acceptedAt ? ` (${new Date(acceptedAt).toLocaleString()})` : ''}. You can continue using
          all Seizn features.
        </p>
        <Link
          href="/dashboard"
          className="author-btn mt-6 inline-flex px-4 py-2 text-sm"
          style={{ background: 'var(--accent-primary)', color: 'var(--accent-on-primary)' }}
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <article>
      <header>
        <p className="author-eyebrow" style={{ color: 'var(--text-tertiary)' }}>
          Founding Member · Re-consent
        </p>
        <h1 className="author-serif mt-2 text-3xl" style={{ color: 'var(--text-primary)' }}>
          We updated our Terms and Privacy Policy
        </h1>
        <p className="mt-3 text-base leading-7" style={{ color: 'var(--text-secondary)' }}>
          You signed up under <strong>{acceptedVersion ?? 'an earlier version'}</strong>. Please review
          the changes below and re-confirm your consent. You can keep your Charter pricing locked
          in.
        </p>
      </header>

      <section className="mt-8 space-y-4">
        {CHANGE_LIST.map((change) => (
          <div
            key={change.title}
            className="rounded-[var(--radius-md)] border p-4"
            style={{ borderColor: 'var(--ink-100)', background: 'var(--bg-elevated)' }}
          >
            <h2 className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>
              {change.title}
            </h2>
            <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              {change.body}
            </p>
          </div>
        ))}
      </section>

      <section className="mt-6 flex flex-col gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <p>
          Read in full:{' '}
          <Link href="/legal/terms" className="underline" style={{ color: 'var(--accent-primary)' }}>
            Terms
          </Link>
          ,{' '}
          <Link href="/legal/privacy" className="underline" style={{ color: 'var(--accent-primary)' }}>
            Privacy
          </Link>
          ,{' '}
          <Link
            href="/legal/subprocessors"
            className="underline"
            style={{ color: 'var(--accent-primary)' }}
          >
            Sub-processors
          </Link>
          ,{' '}
          <Link
            href="/legal/ai-disclosure"
            className="underline"
            style={{ color: 'var(--accent-primary)' }}
          >
            AI Transparency
          </Link>
          .
        </p>
      </section>

      <div className="mt-8 flex items-center gap-4">
        <button
          type="button"
          onClick={onAccept}
          disabled={submitting}
          className="author-btn px-5 py-3 text-sm font-medium"
          style={{
            background: submitting ? 'var(--ink-200)' : 'var(--accent-primary)',
            color: 'var(--accent-on-primary)',
            cursor: submitting ? 'wait' : 'pointer',
          }}
        >
          {submitting ? 'Recording…' : 'I agree — apply new Terms'}
        </button>
        <Link
          href="/dashboard"
          className="text-sm"
          style={{ color: 'var(--text-secondary)' }}
        >
          Decide later
        </Link>
      </div>

      {error ? (
        <p className="mt-4 text-sm" role="alert" style={{ color: 'var(--signal-conflict-ink)' }}>
          {error}
        </p>
      ) : null}

      <p className="mt-8 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        If you decline, your account stays active in read-only mode for {readOnlyWindow}, then continues to
        be readable until you delete the account. No data is removed without your explicit action.
      </p>
    </article>
  );
}
