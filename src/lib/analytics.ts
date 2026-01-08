// Analytics utility for tracking events
import { posthog } from "@/components/posthog-provider";

// Track API usage events (server-side, use in API routes)
export function trackApiEvent(event: string, properties?: Record<string, unknown>) {
  // For server-side, we could use PostHog Node SDK
  // For now, we'll just log - client events are captured automatically
  if (process.env.NODE_ENV === "development") {
    console.log(`[Analytics] ${event}`, properties);
  }
}

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
