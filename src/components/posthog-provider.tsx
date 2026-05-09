"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { capture, ensurePostHogLoaded } from "@/lib/posthog";
import { readConsent } from "@/lib/consent";

function subscribeConsent(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("seizn-consent-change", listener);
  return () => window.removeEventListener("seizn-consent-change", listener);
}

function getAnalyticsConsentSnapshot(): boolean {
  return readConsent()?.analytics ?? false;
}

function getServerSnapshot(): boolean {
  return false;
}

function PostHogPageView({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const lastCapturedUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (pathname) {
      let url = window.origin + pathname;
      if (search && pathname !== "/dashboard/author") {
        url = url + `?${search}`;
      }
      if (lastCapturedUrl.current === url) return;
      lastCapturedUrl.current = url;
      capture("$pageview", { $current_url: url });
    }
  }, [enabled, pathname, search]);

  return null;
}

/**
 * PostHog provider gated by W3.8 cookie consent. PostHog is only loaded after
 * `analytics` consent is granted. Subscribed via useSyncExternalStore so SSR
 * sees `denied` and the client hydrates the real value after mount.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const analyticsConsent = useSyncExternalStore(
    subscribeConsent,
    getAnalyticsConsentSnapshot,
    getServerSnapshot
  );

  // Side effect: load PostHog when consent transitions to true. Safe inside
  // useEffect because it only runs externally on consent change, not on every
  // render.
  useEffect(() => {
    if (analyticsConsent) ensurePostHogLoaded();
  }, [analyticsConsent]);

  return (
    <>
      <PostHogPageView enabled={analyticsConsent} />
      {children}
    </>
  );
}
