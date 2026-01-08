"use client";

declare global {
  interface Window {
    LemonSqueezy?: {
      Url: {
        Open: (url: string) => void;
      };
    };
    createLemonSqueezy?: () => void;
  }
}

interface CheckoutButtonProps {
  variantId: string;
  children: React.ReactNode;
  className?: string;
  email?: string;
  userId?: string;
}

export function CheckoutButton({
  variantId,
  children,
  className = "",
  email,
  userId,
}: CheckoutButtonProps) {
  const handleCheckout = () => {
    // Build checkout URL with optional prefill data
    let checkoutUrl = `https://seizn.lemonsqueezy.com/checkout/buy/${variantId}`;

    const params = new URLSearchParams();

    // Prefill email if available
    if (email) {
      params.append("checkout[email]", email);
    }

    // Add custom data for webhook handling
    if (userId) {
      params.append("checkout[custom][user_id]", userId);
    }

    // Enable overlay mode
    params.append("embed", "1");

    const queryString = params.toString();
    if (queryString) {
      checkoutUrl += `?${queryString}`;
    }

    // Use Lemon Squeezy overlay if available, otherwise redirect
    if (window.LemonSqueezy?.Url?.Open) {
      window.LemonSqueezy.Url.Open(checkoutUrl);
    } else {
      // Fallback to redirect
      window.location.href = checkoutUrl;
    }
  };

  return (
    <button onClick={handleCheckout} className={className}>
      {children}
    </button>
  );
}

// Variant IDs for each plan
export const PLAN_VARIANTS = {
  plus: "1201299",
  pro: "1201303",
} as const;
