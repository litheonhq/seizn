"use client";

import { useState } from "react";
import type { AuthorBillingTier, BillingCadence } from "@/lib/stripe-config";

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
}

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)seizn_csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function isAuthorTier(value: unknown): value is AuthorBillingTier {
  return value === "indie" || value === "pro" || value === "studio" || value === "enterprise";
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
}: CheckoutButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async () => {
    if (disabled || isLoading) return;
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
      if (!response.ok || typeof data.url !== "string") {
        throw new Error(typeof data.error === "string" ? data.error : "Checkout could not start.");
      }

      window.open(data.url, "_self", "noopener,noreferrer");
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout could not start.");
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleCheckout}
        disabled={disabled || isLoading}
        className={className}
        aria-busy={isLoading}
      >
        {isLoading ? "Opening Stripe..." : children}
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
