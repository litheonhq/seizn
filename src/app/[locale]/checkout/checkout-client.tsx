'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import {
  type AuthorBillingTier,
  type AuthorBillingTierConfig,
  type BillingCadence,
  type BillingColumn,
  CHARTER_WINDOW_END_AT,
} from '@/lib/stripe-config';
import {
  CHECKOUT_LEGAL_VERSIONS,
  DEFAULT_CHECKOUT_LEGAL_COPY,
} from '@/lib/checkout-copy';
import type { Locale } from '@/i18n/config';
import { REFUND_POLICY, formatDays } from '@/lib/policy';

interface CheckoutClientProps {
  locale: Locale;
  tier: AuthorBillingTier;
  cadence: BillingCadence;
  column: BillingColumn;
  planConfig: AuthorBillingTierConfig;
}

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)seizn_csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function resolvePrice(plan: AuthorBillingTierConfig, column: BillingColumn, cadence: BillingCadence) {
  if (column === 'managed') {
    if (cadence === 'monthly') {
      return {
        active: plan.managedMonthlyCharterUsd ?? plan.managedMonthlyUsd,
        regular: plan.managedMonthlyUsd,
      };
    }
    return {
      active: plan.managedAnnualCharterUsd ?? plan.managedAnnualUsd,
      regular: plan.managedAnnualUsd,
    };
  }
  if (cadence === 'monthly') {
    return {
      active: plan.byokMonthlyCharterUsd ?? plan.byokMonthlyUsd ?? plan.managedMonthlyUsd,
      regular: plan.byokMonthlyUsd ?? plan.managedMonthlyUsd,
    };
  }
  return {
    active: plan.byokAnnualCharterUsd ?? plan.byokAnnualUsd ?? plan.managedAnnualUsd,
    regular: plan.byokAnnualUsd ?? plan.managedAnnualUsd,
  };
}

function formatUsd(amount: number): string {
  return amount.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

const refundWindow = formatDays(REFUND_POLICY.GUARANTEE_DAYS);

export function CheckoutClient({ locale, tier, cadence, column, planConfig }: CheckoutClientProps) {
  const agreementId = useId();
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const price = resolvePrice(planConfig, column, cadence);
  const isCharter = price.active < price.regular;
  const charterEndDate = new Date(CHARTER_WINDOW_END_AT).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const handleSubmit = async () => {
    if (!accepted || loading) return;
    setError(null);
    setLoading(true);

    try {
      const csrfToken = getCsrfToken();
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({
          tier,
          cadence,
          column,
          successUrl: '/dashboard/billing?success=true',
          cancelUrl: `/${locale}/pricing`,
          legalAccepted: true,
          legalVersions: CHECKOUT_LEGAL_VERSIONS,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        const callbackUrl = `${window.location.pathname}${window.location.search}${window.location.hash}` || '/';
        window.open(
          `/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`,
          '_self',
          'noopener,noreferrer'
        );
        return;
      }
      if (!response.ok || typeof data.url !== 'string') {
        throw new Error(typeof data.error === 'string' ? data.error : DEFAULT_CHECKOUT_LEGAL_COPY.error);
      }
      window.open(data.url, '_self', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : DEFAULT_CHECKOUT_LEGAL_COPY.error);
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
      {/* Plan summary */}
      <section className="rounded-[var(--radius-lg)] border p-6 md:p-8" style={{ borderColor: 'var(--ink-200)', background: 'var(--bg-elevated)' }}>
        <p className="author-eyebrow mb-3" style={{ color: 'var(--text-tertiary)' }}>
          Order summary
        </p>
        <h2 className="author-serif text-3xl" style={{ color: 'var(--text-primary)' }}>
          {planConfig.label}
        </h2>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {column === 'managed' ? 'Managed AI (we cover inference)' : 'BYOK (bring your own API key)'}
          {' · '}
          {cadence === 'monthly' ? 'Monthly' : 'Annual'}
        </p>

        <div className="mt-6 flex items-baseline gap-3">
          <span className="text-[40px] font-medium leading-none" style={{ color: 'var(--text-primary)' }}>
            {formatUsd(price.active)}
          </span>
          {isCharter ? (
            <span className="text-sm line-through" style={{ color: 'var(--text-tertiary)' }}>
              {formatUsd(price.regular)}
            </span>
          ) : null}
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            / {cadence === 'monthly' ? 'month' : 'year'}
          </span>
        </div>

        {isCharter ? (
          <div className="mt-4 rounded-md p-3 text-xs" style={{ background: 'var(--sev-p2-bg)', color: 'var(--sev-p2-text)', border: `1px solid var(--sev-p2-border)` }}>
            Charter pricing locked until {charterEndDate}. After that, the regular rate applies on renewal.
          </div>
        ) : null}

        <ul className="mt-6 space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <li>
            Token cap:{' '}
            {planConfig.tokenCapMonth != null
              ? `${planConfig.tokenCapMonth.toLocaleString()} / month`
              : 'unlimited (contact sales)'}
          </li>
          <li>{column === 'managed' ? 'Managed inference included' : 'BYOK — bring your own API key'}</li>
          <li>Cancel anytime · {refundWindow} refund on annual</li>
        </ul>
      </section>

      {/* Checkout form */}
      <section className="flex flex-col gap-6">
        <div>
          <h1 className="author-serif text-3xl" style={{ color: 'var(--text-primary)' }}>
            Confirm and pay
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            We open Stripe in this window. You can change card and cancel any time from the customer portal.
          </p>
        </div>

        <label htmlFor={agreementId} className="flex items-start gap-3 cursor-pointer text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
          <input
            id={agreementId}
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.currentTarget.checked)}
            className="mt-1 h-4 w-4"
            style={{ accentColor: 'var(--accent-primary)' }}
          />
          <span>
            I agree to the{' '}
            <Link href={`/legal/terms`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>
              Terms of Service
            </Link>
            {' and '}
            <Link href={`/legal/privacy`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>
              Privacy Policy
            </Link>
            . Legal documents are in English (governing law: Wyoming, USA).
          </span>
        </label>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!accepted || loading}
          className="author-btn w-full px-4 py-3 text-sm font-medium"
          style={{
            background: accepted && !loading ? 'var(--accent-primary)' : 'var(--ink-200)',
            color: accepted && !loading ? 'var(--accent-on-primary)' : 'var(--text-tertiary)',
            cursor: accepted && !loading ? 'pointer' : 'not-allowed',
          }}
        >
          {loading ? 'Opening Stripe…' : 'Continue to Stripe'}
        </button>

        {error ? (
          <p className="text-sm" role="alert" style={{ color: 'var(--signal-conflict-ink)' }}>
            {error}
          </p>
        ) : null}

        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Tax (if applicable) is calculated by Stripe at checkout. Receipt is emailed to your account address.
          <br />
          Cancel anytime — no proration penalties on monthly plans.
        </p>
      </section>
    </div>
  );
}
