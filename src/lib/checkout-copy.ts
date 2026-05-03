export interface CheckoutLegalCopy {
  prefix: string;
  terms: string;
  connector: string;
  privacy: string;
  suffix: string;
  loading: string;
  error: string;
}

export const CHECKOUT_LEGAL_VERSIONS = {
  terms: "terms-of-service:v1",
  privacy: "privacy-policy:v1",
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
