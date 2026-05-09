import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import type { CheckoutLegalCopy } from "@/lib/checkout-copy";
import type { AuthorBillingTier } from "@/lib/stripe-config";

export interface AuthorProgramCopy {
  badge: string;
  body: string;
  cta: string;
  footerLabel: string;
}

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
      program: string;
      sdk: string;
      mcp: string;
    };
    entity: string;
    version: string;
  };
  program: AuthorProgramCopy;
  checkout: CheckoutLegalCopy;
}

type RawAuthorLandingCopy = Omit<AuthorLandingCopy, "program" | "footer"> & {
  program?: AuthorProgramCopy;
  footer: Omit<AuthorLandingCopy["footer"], "links"> & {
    links: Omit<AuthorLandingCopy["footer"]["links"], "program"> & {
      program?: string;
    };
  };
};

const DEFAULT_PROGRAM_COPY: AuthorProgramCopy = {
  badge: "in development",
  body: "Seizn Program is our native writing app for manuscripts, canon, review, and local files in one workspace.",
  cta: "Join Program waitlist",
  footerLabel: "Program",
};

const PROGRAM_COPY_BY_LOCALE: Partial<Record<Locale, AuthorProgramCopy>> = {
  ko: {
    badge: "개발 중",
    body: "한글이나 스크리브너처럼 쓰는 Seizn Program을 준비 중입니다. 원고, 캐논, 검수를 한 작업 공간에 둡니다.",
    cta: "Program 대기명단",
    footerLabel: "Program",
  },
  ja: {
    badge: "開発中",
    body: "Scrivenerのように使える執筆アプリ、Seizn Programを準備中です。原稿、正典、レビューを一つの作業空間に置きます。",
    cta: "Programの待機リスト",
    footerLabel: "Program",
  },
  "zh-hans": {
    badge: "开发中",
    body: "Seizn Program 是面向长篇写作的本地写作程序，把原稿、正典和校对放在同一个工作区。",
    cta: "加入 Program 等候名单",
    footerLabel: "Program",
  },
  "zh-hant": {
    badge: "開發中",
    body: "Seizn Program 是面向長篇寫作的本地寫作程式，把原稿、正典和校對放在同一個工作區。",
    cta: "加入 Program 等候名單",
    footerLabel: "Program",
  },
};

export function getAuthorProgramCopy(locale: Locale): AuthorProgramCopy {
  return PROGRAM_COPY_BY_LOCALE[locale] ?? DEFAULT_PROGRAM_COPY;
}

export async function getAuthorLandingCopy(locale: Locale): Promise<AuthorLandingCopy> {
  const dict = await getDictionary(locale);
  const raw = (dict as unknown as { authorLanding: RawAuthorLandingCopy }).authorLanding;
  const program = raw.program ?? getAuthorProgramCopy(locale);
  const landingCopy = raw;
  const {
    program: programFooterLabel,
    ...footerLinks
  } = raw.footer.links;

  return {
    ...landingCopy,
    program,
    footer: {
      ...raw.footer,
      links: {
        ...footerLinks,
        program: programFooterLabel ?? program.footerLabel,
      },
    },
  };
}
