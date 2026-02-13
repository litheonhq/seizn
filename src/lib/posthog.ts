import type posthogJs from "posthog-js";

type PostHogClient = typeof posthogJs;

let loadPromise: Promise<PostHogClient | null> | null = null;
let initialized = false;

function isEnabled() {
  return typeof window !== "undefined" && !!process.env.NEXT_PUBLIC_POSTHOG_KEY;
}

async function getClient(): Promise<PostHogClient | null> {
  if (!isEnabled()) return null;

  if (!loadPromise) {
    loadPromise = import("posthog-js")
      .then((mod) => {
        const client = mod.default as PostHogClient;

        if (!initialized) {
          client.init(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
            api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
            person_profiles: "identified_only",
            capture_pageview: false, // tracked via router events in PostHogProvider
            capture_pageleave: true,
          });

          // Preserve old behavior: never capture in dev.
          if (process.env.NODE_ENV === "development") {
            client.opt_out_capturing();
          }

          initialized = true;
        }

        return client;
      })
      .catch((err) => {
        console.warn("[PostHog] Failed to load posthog-js:", err);
        return null;
      });
  }

  return loadPromise;
}

export function ensurePostHogLoaded() {
  void getClient();
}

export function capture(event: string, properties?: Record<string, unknown>) {
  void getClient().then((client) => client?.capture(event, properties));
}

export function identify(userId: string, properties?: Record<string, unknown>) {
  void getClient().then((client) => client?.identify(userId, properties));
}

export function reset() {
  void getClient().then((client) => client?.reset());
}

