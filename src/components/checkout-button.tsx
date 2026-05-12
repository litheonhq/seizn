"use client";

import { useId, useState } from "react";
import type { AuthorBillingTier, BillingCadence, BillingColumn } from "@/lib/stripe-config";
import type { V9Track2Tier } from "@/lib/billing/v9-products";
import {
  CHECKOUT_LEGAL_VERSIONS,
  DEFAULT_CHECKOUT_LEGAL_COPY,
  type CheckoutLegalCopy,
} from "@/lib/checkout-copy";
import { readApiJson } from "@/lib/client/api-json";

interface CheckoutButtonProps {
  children: React.ReactNode;
  className?: string;
  channel?: "author" | "track2";
  tier?: AuthorBillingTier;
  track2Tier?: V9Track2Tier;
  cadence?: BillingCadence;
  column?: BillingColumn;
  priceId?: string;
  quantity?: number;
  successUrl?: string;
  cancelUrl?: string;
  disabled?: boolean;
  requireLegalAgreement?: boolean;
  privacyHref?: string;
  termsHref?: string;
  legalCopy?: CheckoutLegalCopy;
}

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)seizn_csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function isAuthorTier(value: unknown): value is AuthorBillingTier {
  return value === "indie" || value === "pro" || value === "studio" || value === "enterprise";
}

function getCheckoutAuthRedirectUrl(): string {
  if (typeof window === "undefined") return "/signup";
  const callbackUrl = `${window.location.pathname}${window.location.search}${window.location.hash}` || "/";
  return `/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

export function CheckoutButton({
  children,
  className = "",
  channel = "author",
  tier,
  track2Tier,
  cadence = "monthly",
  column = "managed",
  priceId,
  successUrl,
  cancelUrl,
  disabled = false,
  requireLegalAgreement = true,
  privacyHref = "/en/legal/privacy",
  termsHref = "/en/legal/terms",
  legalCopy = DEFAULT_CHECKOUT_LEGAL_COPY,
}: CheckoutButtonProps) {
  const agreementId = useId();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [legalAgreementAccepted, setLegalAgreementAccepted] = useState(false);
  const canCheckout = !disabled && !isLoading && (!requireLegalAgreement || legalAgreementAccepted);

  const handleCheckout = async () => {
    if (!canCheckout) return;
    setError(null);
    setIsLoading(true);

    try {
      const csrfToken = getCsrfToken();
      const legacyTier = isAuthorTier(priceId) ? priceId : null;
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({
          ...(channel === "track2"
            ? { channel, tier: track2Tier, cadence }
            : legacyTier
              ? { tier: legacyTier, cadence }
              : priceId
                ? { priceId }
                : { tier, cadence }),
          ...(channel === "track2" ? {} : { column }),
          ...(successUrl ? { successUrl } : {}),
          ...(cancelUrl ? { cancelUrl } : {}),
          ...(requireLegalAgreement
            ? {
                legalAccepted: legalAgreementAccepted,
                legalVersions: CHECKOUT_LEGAL_VERSIONS,
              }
            : {}),
        }),
      });

      if (response.status === 401) {
        setIsLoading(false);
        window.open(getCheckoutAuthRedirectUrl(), "_self", "noopener,noreferrer");
        return;
      }

      const data = await readApiJson<{ url?: string }>(response, legalCopy.error);
      if (typeof data.url !== "string") {
        throw new Error(legalCopy.error);
      }

      window.open(data.url, "_self", "noopener,noreferrer");
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : legalCopy.error);
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      {requireLegalAgreement ? (
        <div className="flex items-start gap-2 text-left text-xs leading-5 text-[var(--checkout-copy-color,var(--szn-text-2,var(--ink-600)))]">
          <input
            id={agreementId}
            type="checkbox"
            checked={legalAgreementAccepted}
            onChange={(event) => setLegalAgreementAccepted(event.currentTarget.checked)}
            aria-describedby={`${agreementId}-copy`}
            className="mt-0.5 h-4 w-4 rounded border-[var(--ink-200)] text-[var(--ink-900)] focus:ring-[var(--ink-900)]"
          />
          <span id={`${agreementId}-copy`}>
            {legalCopy.prefix ? (
              <label htmlFor={agreementId} className="cursor-pointer">
                {legalCopy.prefix}{" "}
              </label>
            ) : null}
            <a
              href={termsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--checkout-link-color,var(--signal-canon-ink))] underline underline-offset-2"
            >
              {legalCopy.terms}
            </a>{" "}
            <label htmlFor={agreementId} className="cursor-pointer">
              {legalCopy.connector}{" "}
            </label>
            <a
              href={privacyHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--checkout-link-color,var(--signal-canon-ink))] underline underline-offset-2"
            >
              {legalCopy.privacy}
            </a>
            {legalCopy.suffix ? (
              <label htmlFor={agreementId} className="cursor-pointer">
                {legalCopy.suffix}
              </label>
            ) : null}
          </span>
        </div>
      ) : null}
      <button
        type="button"
        onClick={handleCheckout}
        disabled={!canCheckout}
        className={className}
        aria-busy={isLoading}
      >
        {isLoading ? legalCopy.loading : children}
      </button>
      {error ? (
        <p className="text-xs text-[var(--signal-conflict-ink)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const AUTHOR_PLAN_VARIANTS = {
  indie: { tier: "indie", cadence: "monthly" },
  pro: { tier: "pro", cadence: "monthly" },
  studio: { tier: "studio", cadence: "monthly" },
  enterprise: { tier: "enterprise", cadence: "monthly" },
} as const;

// Legacy export retained while older entry points move off Paddle IDs.
export const PLAN_VARIANTS = {
  starter: "indie",
  plus: "pro",
  pro: "studio",
} as const;
