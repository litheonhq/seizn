import type { Locale } from "@/i18n/config";
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

export const AUTHOR_LANDING_COPY: AuthorLandingCopy = {
  nav: {
    workflow: "Workflow",
    demo: "Demo",
    pricing: "Pricing",
    docs: "Docs",
    signIn: "Sign in",
    start: "Start trial",
    menu: "Open navigation",
  },
  hero: {
    eyebrow: "01 / author memory",
    title: "Catch every",
    italic: "contradiction",
    titleEnd: "before it ships.",
    subtitle:
      "Type a fact. Seizn reconciles it against your canon: 8 characters, 22 rules, and a 30 day timeline. Your review is the verdict.",
    trialNote: "30-day trial, no card",
    byokNote: "BYOK 50% off",
    yearly: "Yearly saves 15%",
    startPlan: "Start",
    comparePlans: "Compare Pro, Studio, and Enterprise",
  },
  workflow: {
    eyebrow: "02 / workflow",
    title: "Three steps. One ledger.",
    subtitle: "Import, review, and write with the same canon behind every keystroke.",
    steps: [
      {
        number: "01",
        title: "Import",
        subtitle: "Bring your canon in.",
        body:
          "Drop a manuscript, point at a Google Doc, or sync a worldbuilding file. Seizn parses characters, locations, and rules into a structured ledger.",
        chips: ["DOCX", "Plain text", "Google Docs", "Native"],
      },
      {
        number: "02",
        title: "Review",
        subtitle: "Your verdict, recorded.",
        body:
          "Every fact lands with a verdict: accepted, queued, or in conflict. Your review becomes the source of truth, replayable on demand.",
        chips: ["canon 142", "pending 8", "conflict 3"],
      },
      {
        number: "03",
        title: "Write",
        subtitle: "Draft inside the ledger.",
        body:
          "Compose new scenes alongside the graph. Contradictions surface the moment they appear, with the rule cited and one click to override.",
        chips: ["Scene draft", "Live check", "Replay"],
      },
    ],
  },
  inputs: {
    eyebrow: "03 / inputs",
    title: "Meet your work where it lives.",
    subtitle: "Four ingest modes. Same ledger, same review, same canon.",
    modes: [
      {
        id: "native",
        name: "Native editor",
        subtitle: "Author inside Seizn.",
        body: "Write directly in the canon-aware editor. Every paragraph is checked against the ledger as you type.",
      },
      {
        id: "docx",
        name: "DOCX import",
        subtitle: "Bring a manuscript.",
        body: "Drag in a .docx, .rtf, or .odt file. Seizn extracts characters, scenes, and dialogue into the ledger.",
      },
      {
        id: "plain",
        name: "Plain text",
        subtitle: "Markdown-friendly.",
        body: "Paste or upload .md and .txt. Headings become scenes; mentions become entities. Round-trip is lossless.",
      },
      {
        id: "gdocs",
        name: "Google Docs",
        subtitle: "Sync, do not copy.",
        body: "Connect a Doc once. Seizn keeps the ledger in sync and surfaces conflicts as comment threads.",
      },
    ],
  },
  conflicts: {
    eyebrow: "04 / conflicts",
    title: "Every contradiction, cited and ranked.",
    subtitle:
      "Severity is signal, not noise. Critical breaks canon outright. Minor flags a soft drift you may want to keep.",
    graphNote:
      "The graph is not cosmetic. Every conflict points to the exact node and edge that broke.",
    items: [
      {
        severity: "critical",
        rule: "character.han_iseul.eye_color",
        fact: "Chapter 11: Han Iseul has gray eyes.",
        against: "Canon in chapter 2 says brown.",
        cited: ["scene.2.1", "character.han_iseul"],
      },
      {
        severity: "major",
        rule: "rule.r03 rooftop access",
        fact: "Chapter 7: Park Jio enters the rooftop on day 9.",
        against: "Rule r03 locks rooftop access until day 14.",
        cited: ["rule.r03", "scene.7.4"],
      },
      {
        severity: "minor",
        rule: "character.yun_hana.club",
        fact: "Chapter 18: Yun Hana attends astronomy club.",
        against: "Canon says photo club. It may be a transfer event.",
        cited: ["character.yun_hana"],
      },
    ],
  },
  simulation: {
    eyebrow: "05 / simulation",
    title: "Replay before you commit.",
    subtitle:
      "Stage a scene against the ledger. Seizn projects downstream impact at the token level: safe paths and risk paths, ranked.",
    tokenDiff: "token-level diff: scene 14.observatory.draft",
    replayReady: "replay ready",
    candidates: [
      {
        side: "safe",
        label: "Safe path",
        score: 92,
        title: "Han Iseul stays at the observatory until dawn.",
        body: "Honors r02 and r04. No new conflicts. Continuity stays intact.",
        tokens: ["scene.continues", "rule.r02", "rule.r04"],
      },
      {
        side: "risk",
        label: "Risk path",
        score: 41,
        title: "Han Iseul leaves before the eclipse peak.",
        body: "Drops r02 anchoring. Two downstream scenes lose their grounding event.",
        tokens: ["drops.r02", "scene.16.orphan", "scene.21.orphan"],
      },
    ],
  },
  trust: {
    eyebrow: "06 / trust",
    title: "Author-grade by default.",
    subtitle: "Decisions you can defend, infrastructure you can audit, separation rules you can prove.",
    items: [
      { icon: "lock", title: "Workspace-isolated", body: "Sample IP is synthetic. Your manuscript never trains a public model." },
      { icon: "key", title: "BYOK supported", body: "Bring your own Anthropic key. 50% off list price, unlimited tokens." },
      { icon: "archive", title: "Replayable canon", body: "Every verdict is logged. Roll back, branch, or audit any decision." },
      { icon: "shield", title: "SFW-only policy", body: "Litheon LLC operates Seizn under a strict safe-for-work content rule." },
    ],
  },
  pricing: {
    eyebrow: "07 / pricing",
    title: "Pay for the ledger, not the LLM.",
    subtitle: "BYOK halves the price and lifts the token cap. Yearly saves 15%. 30-day trial on every tier.",
    byok: "BYOK 50% off",
    yearly: "Yearly saves 15%",
    start: "Start",
    contact: "Contact sales",
    mostPicked: "most picked",
    blurbs: {
      indie: "For solo authors holding their own canon.",
      pro: "For pro authors and small studios shipping multiple IPs.",
      studio: "Multi-IP, multi-author. Audit log, role permissions, dedicated review queue.",
      enterprise: "Custom data residency, SSO, on-prem replay archive, premium SLA.",
    },
    features: {
      indie: ["1 IP project", "Canon ledger and replay", "Unlimited reviews", "30-day trial, no card"],
      pro: ["5 IP projects", "Branch and diff canon", "Priority conflict review", "Team-of-3 collaboration", "BYOK 50% off"],
      studio: ["20M tokens / mo", "Studio review operations", "Usage review for larger launches"],
      enterprise: ["Unlimited scale", "BYOK required", "Custom security and procurement support"],
    },
  },
  faq: {
    eyebrow: "08 / faq",
    title: "Five things authors ask first.",
    items: [
      {
        q: "How is Seizn different from Sudowrite or NovelCrafter?",
        a: "Seizn is not a writing assistant. It is a canon ledger. We do not generate your prose; we hold your facts to the letter and surface contradictions as they appear.",
      },
      {
        q: "What does BYOK actually unlock?",
        a: "Bring your own Anthropic key and pay 50% of list price with unlimited tokens.",
      },
      {
        q: "Can I export my canon?",
        a: "Always. Every ledger exports as structured JSON, plain markdown, or DOCX. No lock-in. Cancel anytime and leave with your work.",
      },
      {
        q: "What happens to my manuscript?",
        a: "Your work is isolated from sample IPs and from any public model training. The Saebyeok demo on this page is synthetic data, not a real customer.",
      },
      {
        q: "Does the trial need a credit card?",
        a: "No. 30 days, no card. After day 30, pick a tier or your project archives in read-only mode for another 60 days.",
      },
    ],
  },
  footer: {
    tagline: "Author memory, held to the letter. SFW-only. Built for canon authority.",
    product: "Product",
    company: "Company",
    tools: "Author tools",
    links: {
      workflow: "Workflow",
      demo: "Demo",
      pricing: "Pricing",
      docs: "Docs",
      about: "About",
      trust: "Trust and privacy",
      privacy: "Privacy",
      terms: "Terms",
      beta: "Beta Disclosure",
      status: "Status",
      contact: "Contact",
      ledger: "Canon ledger",
      replay: "Replay",
      byok: "BYOK guide",
      changelog: "Changelog",
    },
    entity: "\u00a9 2026 Seizn by Litheon LLC \u00b7 Wyoming",
    version: "v1.0 \u00b7 saebyeok demo is synthetic data",
  },
  engine: {
    badge: "new",
    body: "Building game NPC AI? The same canon engine, exposed as an SDK.",
    cta: "engine.seizn.com",
  },
  checkout: {
    prefix: "I agree to the",
    terms: "Terms of Service",
    connector: "and",
    privacy: "Privacy Policy",
    suffix: ".",
    loading: "Opening Stripe...",
    error: "Checkout could not start.",
  },
};

export function isAuthorEngineSurfaceLive(value = process.env.NEXT_PUBLIC_ENGINE_SURFACE_LIVE): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

export function getAuthorLandingCopy(_locale: Locale): AuthorLandingCopy {
  return AUTHOR_LANDING_COPY;
}
