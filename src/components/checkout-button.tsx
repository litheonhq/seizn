"use client";

// Paddle.js TypeScript definitions
declare global {
  interface Window {
    Paddle?: {
      Checkout: {
        open: (options: PaddleCheckoutOptions) => void;
      };
      Environment: {
        set: (env: "sandbox" | "production") => void;
      };
      Initialize: (options: PaddleInitOptions) => void;
    };
  }
}

interface PaddleInitOptions {
  token: string;
  checkout?: {
    settings?: PaddleCheckoutSettings;
  };
}

interface PaddleCheckoutSettings {
  displayMode?: "overlay" | "inline";
  theme?: "light" | "dark";
  locale?: string;
  allowLogout?: boolean;
  showAddDiscounts?: boolean;
  showAddTaxId?: boolean;
  frameTarget?: string;
  frameInitialHeight?: number;
  frameStyle?: string;
  successUrl?: string;
}

interface PaddleCheckoutOptions {
  items: PaddleCheckoutItem[];
  customer?: {
    email?: string;
    address?: {
      countryCode?: string;
      postalCode?: string;
    };
  };
  customData?: Record<string, string>;
  settings?: PaddleCheckoutSettings;
}

interface PaddleCheckoutItem {
  priceId: string;
  quantity?: number;
}

interface CheckoutButtonProps {
  priceId: string;
  children: React.ReactNode;
  className?: string;
  email?: string;
  userId?: string;
  quantity?: number;
  successUrl?: string;
}

export function CheckoutButton({
  priceId,
  children,
  className = "",
  email,
  userId,
  quantity = 1,
  successUrl,
}: CheckoutButtonProps) {
  const handleCheckout = () => {
    // Build checkout options for Paddle
    const checkoutOptions: PaddleCheckoutOptions = {
      items: [
        {
          priceId,
          quantity,
        },
      ],
    };

    // Prefill customer email if available
    if (email) {
      checkoutOptions.customer = {
        email,
      };
    }

    // Add custom data for webhook handling (e.g., user ID)
    if (userId) {
      checkoutOptions.customData = {
        user_id: userId,
      };
    }

    // Add success URL if provided
    if (successUrl) {
      checkoutOptions.settings = {
        successUrl,
      };
    }

    // Use Paddle overlay checkout if available
    if (window.Paddle?.Checkout?.open) {
      window.Paddle.Checkout.open(checkoutOptions);
    } else {
      console.error(
        "Paddle.js not loaded. Please check that the Paddle script is included in the page."
      );
    }
  };

  return (
    <button onClick={handleCheckout} className={className}>
      {children}
    </button>
  );
}

// Price IDs for each plan (Paddle uses pri_* format)
// Replace these with actual Paddle price IDs after account setup
export const PLAN_PRICES = {
  plus: {
    monthly: "pri_placeholder_plus_monthly",
    yearly: "pri_placeholder_plus_yearly",
  },
  pro: {
    monthly: "pri_placeholder_pro_monthly",
    yearly: "pri_placeholder_pro_yearly",
  },
} as const;

// Legacy variant mapping for backward compatibility during migration
// Can be removed after full migration to Paddle
export const PLAN_VARIANTS = {
  plus: PLAN_PRICES.plus.monthly,
  pro: PLAN_PRICES.pro.monthly,
} as const;
