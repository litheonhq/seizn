export interface CheckoutLegalCopy {
  prefix: string;
  terms: string;
  connector: string;
  privacy: string;
  suffix: string;
  loading: string;
  error: string;
}

export function formatCheckoutLegalVersion(docType: string, version: string): `${string}:${string}` {
  return `${docType}:${version}`;
}

export const CHECKOUT_LEGAL_VERSIONS = {
  // Bumped 2026-05-09 (Wave 2 / W3.7) — adds Resend, GlitchTip, Plausible
  // self-hosted, EU AI Act §50 disclosure, refund policy, sub-processor list.
  // Founding members must re-consent via /dashboard/legal/reconsent.
  terms: formatCheckoutLegalVersion("terms-of-service", "v2"),
  privacy: formatCheckoutLegalVersion("privacy-policy", "v2"),
} as const;

/**
 * Concatenated string used as the `legal_version_accepted` column value on
 * profiles. Compare lexicographically to detect whether a user must re-consent.
 */
export const CURRENT_LEGAL_VERSION_STAMP = `${CHECKOUT_LEGAL_VERSIONS.terms};${CHECKOUT_LEGAL_VERSIONS.privacy}`;

export const DEFAULT_CHECKOUT_LEGAL_COPY: CheckoutLegalCopy = {
  prefix: "I agree to the",
  terms: "Terms of Service",
  connector: "and",
  privacy: "Privacy Policy",
  suffix: ".",
  loading: "Opening Stripe...",
  error: "Checkout could not start.",
};
