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
  terms: formatCheckoutLegalVersion("terms-of-service", "v1"),
  privacy: formatCheckoutLegalVersion("privacy-policy", "v1"),
} as const;

export const DEFAULT_CHECKOUT_LEGAL_COPY: CheckoutLegalCopy = {
  prefix: "I agree to the",
  terms: "Terms of Service",
  connector: "and",
  privacy: "Privacy Policy",
  suffix: ".",
  loading: "Opening Stripe...",
  error: "Checkout could not start.",
};
