"use client";

import Script from "next/script";
import { useSyncExternalStore } from "react";
import { readConsent } from "@/lib/consent";

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const IS_PRODUCTION_BUILD = process.env.NODE_ENV === "production";
const IS_E2E_MODE = process.env.NEXT_PUBLIC_E2E_MODE === "true";

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

/**
 * Google Analytics with Consent Mode v2 (W3.8).
 *
 * We always inject the gtag init with consent defaults set to `denied`. When
 * the user accepts analytics in the banner, `writeConsent` dispatches a
 * `seizn-consent-change` event AND calls `gtag('consent','update',...)`. This
 * follows Google's recommended Consent Mode v2 pattern — analytics_storage
 * stays denied until explicit user consent.
 */
export function GoogleAnalytics() {
  const analyticsConsent = useSyncExternalStore(
    subscribeConsent,
    getAnalyticsConsentSnapshot,
    getServerSnapshot
  );

  if (!GA_MEASUREMENT_ID || !IS_PRODUCTION_BUILD || IS_E2E_MODE) {
    return null;
  }

  // Inject gtag.js + Consent Mode v2 default state on every render. The
  // `analytics_storage` flag stays denied until user consents — gtag respects
  // this by not setting first-party cookies and aggregating server-side only.
  // The `config` call is conditional on consent so we don't fire pageviews
  // before opt-in.
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-consent-defaults" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\nwindow.gtag = window.gtag || gtag;\ngtag('js', new Date());\ngtag('consent', 'default', {\n  ad_storage: 'denied',\n  analytics_storage: 'denied',\n  ad_user_data: 'denied',\n  ad_personalization: 'denied',\n  wait_for_update: 500\n});`}
      </Script>
      {analyticsConsent ? (
        <Script id="ga4-init" strategy="afterInteractive">
          {`gtag('config', '${GA_MEASUREMENT_ID}', { anonymize_ip: true });`}
        </Script>
      ) : null}
    </>
  );
}
