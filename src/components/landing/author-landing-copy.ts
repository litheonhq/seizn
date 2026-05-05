import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import type { CheckoutLegalCopy } from "@/lib/checkout-copy";
import type { AuthorBillingTier } from "@/lib/stripe-config";

export const ENGINE_SURFACE_URL = "https://engine.seizn.com";

export interface AuthorLandingCopy {
  nav: {
    workflow: string;
    demo: string;
    pricing: string;
    docs: string;
    signIn: string;
    start: string;
    menu: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    italic: string;
    titleEnd: string;
    subtitle: string;
    trialNote: string;
    byokNote: string;
    yearly: string;
    startPlan: string;
    comparePlans: string;
  };
  workflow: {
    eyebrow: string;
    title: string;
    subtitle: string;
    steps: Array<{ number: string; title: string; subtitle: string; body: string; chips: string[] }>;
  };
  inputs: {
    eyebrow: string;
    title: string;
    subtitle: string;
    modes: Array<{ id: "native" | "docx" | "plain" | "gdocs"; name: string; subtitle: string; body: string }>;
  };
  conflicts: {
    eyebrow: string;
    title: string;
    subtitle: string;
    graphNote: string;
    items: Array<{ severity: "critical" | "major" | "minor"; rule: string; fact: string; against: string; cited: string[] }>;
  };
  simulation: {
    eyebrow: string;
    title: string;
    subtitle: string;
    tokenDiff: string;
    replayReady: string;
    candidates: Array<{ side: "safe" | "risk"; label: string; score: number; title: string; body: string; tokens: string[] }>;
  };
  trust: {
    eyebrow: string;
    title: string;
    subtitle: string;
    items: Array<{ icon: "lock" | "key" | "archive" | "shield"; title: string; body: string }>;
  };
  pricing: {
    eyebrow: string;
    title: string;
    subtitle: string;
    byok: string;
    yearly: string;
    start: string;
    contact: string;
    mostPicked: string;
    features: Record<AuthorBillingTier, string[]>;
    blurbs: Record<AuthorBillingTier, string>;
  };
  faq: {
    eyebrow: string;
    title: string;
    items: Array<{ q: string; a: string }>;
  };
  footer: {
    tagline: string;
    product: string;
    company: string;
    tools: string;
    developers: string;
    links: {
      workflow: string;
      demo: string;
      pricing: string;
      docs: string;
      about: string;
      trust: string;
      privacy: string;
      terms: string;
      beta: string;
      status: string;
      contact: string;
      ledger: string;
      replay: string;
      byok: string;
      changelog: string;
      engine: string;
      sdk: string;
      mcp: string;
    };
    entity: string;
    version: string;
  };
  engine: {
    badge: string;
    body: string;
    cta: string;
  };
  checkout: CheckoutLegalCopy;
}

export function isAuthorEngineSurfaceLive(value = process.env.NEXT_PUBLIC_ENGINE_SURFACE_LIVE): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

export async function getAuthorLandingCopy(locale: Locale): Promise<AuthorLandingCopy> {
  const dict = await getDictionary(locale);
  return (dict as unknown as { authorLanding: AuthorLandingCopy }).authorLanding;
}
