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
// NEXT_PUBLIC_* env vars can override defaults per deployment.
const STARTER_MONTHLY_PRICE_ID =
  process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_MONTHLY?.trim() || "pri_starter_monthly";
const STARTER_YEARLY_PRICE_ID =
  process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_YEARLY?.trim() || "pri_starter_yearly";
const PLUS_MONTHLY_PRICE_ID =
  process.env.NEXT_PUBLIC_PADDLE_PRICE_PLUS_MONTHLY?.trim() || "pri_plus_monthly";
const PLUS_YEARLY_PRICE_ID =
  process.env.NEXT_PUBLIC_PADDLE_PRICE_PLUS_YEARLY?.trim() || "pri_plus_yearly";
const PRO_MONTHLY_PRICE_ID =
  process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_MONTHLY?.trim() || "pri_pro_monthly";
const PRO_YEARLY_PRICE_ID =
  process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_YEARLY?.trim() || "pri_pro_yearly";

export const PLAN_PRICES = {
  starter: {
    monthly: STARTER_MONTHLY_PRICE_ID,
    yearly: STARTER_YEARLY_PRICE_ID,
  },
  plus: {
    monthly: PLUS_MONTHLY_PRICE_ID,
    yearly: PLUS_YEARLY_PRICE_ID,
  },
  pro: {
    monthly: PRO_MONTHLY_PRICE_ID,
    yearly: PRO_YEARLY_PRICE_ID,
  },
} as const;

// Legacy variant mapping for backward compatibility during migration
// Can be removed after full migration to Paddle
export const PLAN_VARIANTS = {
  starter: PLAN_PRICES.starter.monthly,
  plus: PLAN_PRICES.plus.monthly,
  pro: PLAN_PRICES.pro.monthly,
} as const;
