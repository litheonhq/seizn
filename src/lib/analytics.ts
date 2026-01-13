// Analytics utility for tracking events
// Focused on TTFS (Time To First Success) measurement
import { posthog } from "@/components/posthog-provider";

// Track API usage events (server-side, use in API routes)
export function trackApiEvent(event: string, properties?: Record<string, unknown>) {
  // For server-side, we could use PostHog Node SDK
  // For now, we'll just log - client events are captured automatically
  if (process.env.NODE_ENV === "development") {
    console.log(`[Analytics] ${event}`, properties);
  }
}

// ============================================
// TTFS (Time To First Success) Events
// ============================================
// These events track the user journey from signup to first successful API call
// Target: TTFS < 5 minutes

export const ttfsEvents = {
  // Step 1: User completed signup
  signupCompleted: () => {
    posthog?.capture("ttfs_signup_completed", {
      timestamp: new Date().toISOString(),
    });
  },

  // Step 2: Organization created (if applicable)
  orgCreated: (orgName: string) => {
    posthog?.capture("ttfs_org_created", {
      org_name: orgName,
      timestamp: new Date().toISOString(),
    });
  },

  // Step 3: API key created
  apiKeyCreated: (keyName: string) => {
    posthog?.capture("ttfs_api_key_created", {
      key_name: keyName,
      timestamp: new Date().toISOString(),
    });
  },

  // Step 4: First API request sent (regardless of success)
  firstRequestSent: (endpoint: string) => {
    posthog?.capture("ttfs_first_request_sent", {
      endpoint,
      timestamp: new Date().toISOString(),
    });
  },

  // Step 5: First successful API response - THE KEY METRIC
  firstSuccessResponse: (endpoint: string, latencyMs: number) => {
    posthog?.capture("ttfs_first_success_response", {
      endpoint,
      latency_ms: latencyMs,
      timestamp: new Date().toISOString(),
    });
  },

  // Step 6: Trace viewed (understanding the debug value)
  traceViewOpened: (traceId: string) => {
    posthog?.capture("ttfs_trace_view_opened", {
      trace_id: traceId,
      timestamp: new Date().toISOString(),
    });
  },

  // Step 7: SDK install command copied
  sdkInstallCopy: (sdk: "npm" | "pip" | "curl") => {
    posthog?.capture("ttfs_sdk_install_copy", {
      sdk,
      timestamp: new Date().toISOString(),
    });
  },

  // Onboarding wizard interactions
  onboardingStepCompleted: (step: string, stepNumber: number) => {
    posthog?.capture("ttfs_onboarding_step_completed", {
      step,
      step_number: stepNumber,
      timestamp: new Date().toISOString(),
    });
  },

  onboardingDismissed: (completedSteps: number, totalSteps: number) => {
    posthog?.capture("ttfs_onboarding_dismissed", {
      completed_steps: completedSteps,
      total_steps: totalSteps,
      timestamp: new Date().toISOString(),
    });
  },

  onboardingCompleted: () => {
    posthog?.capture("ttfs_onboarding_completed", {
      timestamp: new Date().toISOString(),
    });
  },
};

// ============================================
// Conversion Funnel Events
// ============================================

export const conversionEvents = {
  // Pricing page viewed
  pricingViewed: (source: string) => {
    posthog?.capture("conversion_pricing_viewed", { source });
  },

  // Checkout opened
  checkoutOpened: (plan: string, billingCycle: "monthly" | "yearly") => {
    posthog?.capture("conversion_checkout_opened", { plan, billing_cycle: billingCycle });
  },

  // Purchase completed
  purchaseCompleted: (plan: string, amount: number, currency: string) => {
    posthog?.capture("conversion_purchase_completed", {
      plan,
      amount,
      currency,
      timestamp: new Date().toISOString(),
    });
  },
};

// Client-side event tracking
export const analytics = {
  // User signed up
  signUp: (method: string) => {
    posthog?.capture("user_signed_up", { method });
  },

  // User signed in
  signIn: (method: string) => {
    posthog?.capture("user_signed_in", { method });
  },

  // API key created
  apiKeyCreated: (keyName: string) => {
    posthog?.capture("api_key_created", { key_name: keyName });
  },

  // API key revoked
  apiKeyRevoked: () => {
    posthog?.capture("api_key_revoked");
  },

  // Plan upgraded
  planUpgraded: (fromPlan: string, toPlan: string) => {
    posthog?.capture("plan_upgraded", { from_plan: fromPlan, to_plan: toPlan });
  },

  // Checkout started
  checkoutStarted: (plan: string) => {
    posthog?.capture("checkout_started", { plan });
  },

  // Docs page viewed
  docsViewed: (page: string) => {
    posthog?.capture("docs_viewed", { page });
  },

  // Feature used
  featureUsed: (feature: string, details?: Record<string, unknown>) => {
    posthog?.capture("feature_used", { feature, ...details });
  },

  // Error occurred
  errorOccurred: (errorType: string, message: string) => {
    posthog?.capture("error_occurred", { error_type: errorType, message });
  },

  // Identify user
  identify: (userId: string, properties?: Record<string, unknown>) => {
    posthog?.identify(userId, properties);
  },

  // Reset (on logout)
  reset: () => {
    posthog?.reset();
  },
};
