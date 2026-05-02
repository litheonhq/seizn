"use client";

import { useId, useState } from "react";
import type { AuthorBillingTier, BillingCadence } from "@/lib/stripe-config";
import {
  DEFAULT_CHECKOUT_LEGAL_COPY,
  type CheckoutLegalCopy,
} from "@/lib/checkout-copy";

interface CheckoutButtonProps {
  children: React.ReactNode;
  className?: string;
  tier?: AuthorBillingTier;
  cadence?: BillingCadence;
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
  tier,
  cadence = "monthly",
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
          ...(legacyTier ? { tier: legacyTier, cadence } : priceId ? { priceId } : { tier, cadence }),
          ...(successUrl ? { successUrl } : {}),
          ...(cancelUrl ? { cancelUrl } : {}),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setIsLoading(false);
        window.open(getCheckoutAuthRedirectUrl(), "_self", "noopener,noreferrer");
        return;
      }

      if (!response.ok || typeof data.url !== "string") {
        throw new Error(typeof data.error === "string" ? data.error : legalCopy.error);
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
        <div className="flex items-start gap-2 text-left text-xs leading-5 text-szn-text-2">
          <input
            id={agreementId}
            type="checkbox"
            checked={legalAgreementAccepted}
            onChange={(event) => setLegalAgreementAccepted(event.currentTarget.checked)}
            aria-describedby={`${agreementId}-copy`}
            className="mt-0.5 h-4 w-4 rounded border-szn-border text-szn-accent focus:ring-szn-accent"
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
              className="font-medium text-cyan-700 underline-offset-2 hover:underline"
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
              className="font-medium text-cyan-700 underline-offset-2 hover:underline"
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
        <p className="text-xs text-red-600" role="alert">
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
