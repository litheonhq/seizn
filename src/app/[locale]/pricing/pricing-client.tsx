"use client";

import { useState } from "react";
import Link from "next/link";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";

interface PricingClientProps {
  dict: Dictionary;
  locale: Locale;
}

type PlanDetail =
  | string
  | {
      text: string;
      href: string;
    };

type Plan = {
  name: string;
  price: string;
  priceSub: string;
  annual?: string;
  cadence: string;
  scope: string;
  summary: string;
  details: PlanDetail[];
  ctaLabel: string;
  ctaHref: string;
  featured?: boolean;
};

type MatrixRow = {
  label: string;
  free: string;
  indie: string;
  studio: string;
  pro: string;
  enterprise: string;
};

type FAQItem = {
  q: string;
  a: string;
};

type Copy = {
  eyebrow: string;
  title: string;
  titleItalic: string;
  subtitle: string;
  helper: string;
  primaryCta: string;
  secondaryCta: string;
  statChips: string[];
  plansTitle: string;
  plansSubtitle: string;
  plans: Plan[];
  matrixTitle: string;
  matrixSubtitle: string;
  matrixRows: MatrixRow[];
  faqTitle: string;
  faqSubtitle: string;
  faq: FAQItem[];
  finalCtaTitle: string;
  finalCtaSubtitle: string;
  finalCtaPrimary: string;
  finalCtaSecondary: string;
};

const COPY_EN: Copy = {
  eyebrow: "01 / PRICING",
  title: "Memory priced by the",
  titleItalic: "world",
  subtitle:
    "Seizn meters the persistent graph behind your NPCs — entities, relations, and event throughput — not the number of seats on your team. Keep Inworld, Convai, ACE, or your own dialogue stack.",
  helper:
    "Start free, ship an Indie prototype at $39, scale to Studio and Pro as worlds grow. Enterprise for self-hosting, custom SLA, and multi-title infrastructure.",
  primaryCta: "Start building",
  secondaryCta: "Talk to sales",
  statChips: [
    "No seat tax for writers, quest designers, or QA.",
    "Works beside Inworld, Convai, ACE, or your own runtime.",
    "From 10-NPC prototypes to 10,000-NPC live worlds.",
  ],
  plansTitle: "Five tiers, one graph-based meter",
  plansSubtitle:
    "Free for prototypes. Indie for jam-scale. Studio when a game ships. Pro for live ops at scale. Enterprise for publisher-wide infrastructure.",
  plans: [
    {
      name: "Free",
      price: "$0",
      priceSub: "",
      cadence: "Dev tier",
      scope: "Up to 10K memories",
      summary:
        "Prototype memory recall, faction relations, and event logging in a vertical slice. No credit card, no seat tax.",
      details: [
        "10K memories · 10K ops/month",
        "1 project · 1 environment",
        "Docs-led onboarding",
      ],
      ctaLabel: "Start free",
      ctaHref: "/docs/quickstart",
    },
    {
      name: "Indie",
      price: "$39",
      priceSub: "/mo",
      cadence: "Solo or small team",
      scope: "Up to 100K memories",
      summary:
        "For jam games, indie launches, and small teams testing persistent NPCs in production before committing to Studio scale.",
      details: [
        "100K memories · 100K ops/month",
        "3 projects · dev + prod",
        "Async email support",
        "All 2026 memory primitives included",
        "Korean persona seed (1K sample)",
      ],
      ctaLabel: "Start Indie",
      ctaHref: "/enterprise",
    },
    {
      name: "Studio",
      price: "$299",
      priceSub: "/mo",
      cadence: "For one live title",
      scope: "Up to 1M memories",
      summary:
        "Ship persistent memory into a production game. Thousands of NPCs, always-on event streams, with room to ramp through a seasonal launch.",
      details: [
        "1M memories · 1M ops/month",
        "10 projects · unlimited environments",
        "Direct response support",
        "Deterministic replay + audit log export",
        "Full Nemotron-Personas-Korea access (7M)",
      ],
      ctaLabel: "Book a sizing call",
      ctaHref: "/enterprise",
      featured: true,
    },
    {
      name: "Pro",
      price: "$999",
      priceSub: "/mo",
      annual: "$8,991/yr (25% off)",
      cadence: "Live ops at scale",
      scope: "Up to 5M memories",
      summary:
        "Multi-title live ops with a public SLA and production escalation path. Built for teams that need guarantees, review workflows, and incident support.",
      details: [
        "5M memories · unlimited ops",
        "Unlimited projects and environments",
        { text: "99.9% uptime SLA", href: "/sla" },
        "SSO included",
        "2 post-mortem reports/quarter",
        "Priority Chaos Monkey queue",
        "Canon Lock team review workflow",
        "Dedicated Slack with engineering",
        "Korean data residency option",
      ],
      ctaLabel: "Upgrade to Pro",
      ctaHref: "/enterprise",
    },
    {
      name: "Enterprise",
      price: "From $2,500",
      priceSub: "/mo + usage",
      cadence: "Publisher scope",
      scope: "Self-hosted or private cloud",
      summary:
        "Shared memory infrastructure across studios and titles. Regional deployment, private networking, and procurement-ready contracts.",
      details: [
        "Custom memory and ops caps",
        "Self-hosted or dedicated private cloud",
        "SSO / SAML included",
        "Custom SLA > 99.9%",
        "Dedicated support engineer",
        "Custom BAA / DPA",
      ],
      ctaLabel: "Talk to Seizn",
      ctaHref: "/enterprise",
    },
  ],
  matrixTitle: "How teams usually size the jump",
  matrixSubtitle: "The meter is the graph and event flow, not the number of people touching the tool.",
  matrixRows: [
    {
      label: "Memories",
      free: "10K",
      indie: "100K",
      studio: "1M",
      pro: "5M",
      enterprise: "Custom",
    },
    {
      label: "Ops / month",
      free: "10K",
      indie: "100K",
      studio: "1M",
      pro: "Unlimited",
      enterprise: "Custom",
    },
    {
      label: "Projects",
      free: "1",
      indie: "3",
      studio: "10",
      pro: "Unlimited",
      enterprise: "Unlimited",
    },
    {
      label: "Support",
      free: "Docs only",
      indie: "Async email",
      studio: "Direct response",
      pro: "SLA + dedicated Slack",
      enterprise: "Dedicated engineer",
    },
    {
      label: "Deployment",
      free: "Managed cloud",
      indie: "Managed cloud",
      studio: "Managed cloud",
      pro: "Managed cloud",
      enterprise: "Self-host or private",
    },
    {
      label: "Best fit",
      free: "Prototype",
      indie: "Jam games · indie launches",
      studio: "One shipped title",
      pro: "Multi-title live ops",
      enterprise: "Publisher / regulated",
    },
  ],
  faqTitle: "FAQ for game teams",
  faqSubtitle: "What studios ask before memory goes into production.",
  faq: [
    {
      q: "What counts as a memory?",
      a: "Any persisted fact, event, relation, or observation that your runtime can recall later. NPCs, factions, items, quests, witness events — anything retrievable across turns. Seats for writers, designers, and QA are never billed.",
    },
    {
      q: "What happens when we exceed the memory cap?",
      a: "On Free and Indie, writes pause until the next billing cycle or you upgrade. On Studio and Pro, we raise capacity first and reconcile on the next invoice — no hard stops during a launch.",
    },
    {
      q: "Do we need to replace Inworld, Convai, or NVIDIA ACE?",
      a: "No. Seizn sits beside your dialogue engine. Keep voices and behavior where they already live; Seizn handles persistent memory, relation graph updates, and retrieval.",
    },
    {
      q: "Why is Indie so cheap compared to Studio?",
      a: "Indie is discovery-priced to let small teams and jam builders ship in production before committing. Studio pricing reflects launch-scale capacity, direct support, and production features like deterministic replay.",
    },
    {
      q: "When do we need Enterprise?",
      a: "Choose Enterprise when custom SLA above 99.9%, a dedicated support engineer, custom BAA / DPA, data residency, self-hosting, or publisher-wide memory infrastructure enters the conversation.",
    },
    {
      q: "Annual billing or yearly discount?",
      a: "Pro annual is $8,991/year, a 25% discount from monthly billing. Enterprise contracts are annual and negotiated case by case.",
    },
  ],
  finalCtaTitle: "Ready to price your world?",
  finalCtaSubtitle:
    "Bring your NPC count, event rate, and dialogue stack. We will map the right tier and integration path in one call.",
  finalCtaPrimary: "Book a demo",
  finalCtaSecondary: "Read the docs",
};

const COPY_KO: Copy = {
  eyebrow: "01 / PRICING",
  title: "세계 규모로 과금되는",
  titleItalic: "메모리",
  subtitle:
    "Seizn은 NPC 뒤의 지속 메모리 그래프 — 엔티티, 관계, 이벤트 처리량 — 을 기준으로 과금합니다. 팀 좌석 수와 무관하며 Inworld, Convai, ACE, 자체 대화 스택을 그대로 유지합니다.",
  helper:
    "Free로 시작하고 $39 Indie에서 첫 출시, 규모가 커지면 Studio와 Pro로 이동합니다. Enterprise는 셀프호스트, 커스텀 SLA, 멀티 타이틀 인프라를 커버합니다.",
  primaryCta: "무료로 시작",
  secondaryCta: "영업팀 상담",
  statChips: [
    "작가·퀘스트 디자이너·QA 좌석에는 과금 없음.",
    "Inworld·Convai·ACE 또는 자체 런타임과 나란히.",
    "NPC 10개 프로토타입부터 10,000개 라이브 월드까지.",
  ],
  plansTitle: "5개 티어, 하나의 그래프 기반 미터",
  plansSubtitle:
    "Free로 프로토타입, Indie로 잼 스케일, Studio로 출시, Pro로 라이브 옵스 스케일, Enterprise로 퍼블리셔 전체 인프라.",
  plans: [
    {
      name: "Free",
      price: "$0",
      priceSub: "",
      cadence: "개발용 티어",
      scope: "메모리 최대 10K",
      summary:
        "카드 없이, 좌석 과금 없이 버티컬 슬라이스에서 메모리 회수·관계 그래프·이벤트 기록을 먼저 검증합니다.",
      details: [
        "메모리 10K · 월 10K ops",
        "프로젝트 1개 · 환경 1개",
        "문서 중심 온보딩",
      ],
      ctaLabel: "무료 시작",
      ctaHref: "/docs/quickstart",
    },
    {
      name: "Indie",
      price: "$39",
      priceSub: "/월",
      cadence: "솔로·소규모 팀",
      scope: "메모리 최대 100K",
      summary:
        "잼 게임, 인디 런칭, Studio 규모로 가기 전 프로덕션에서 지속 NPC를 실험하는 소규모 팀용.",
      details: [
        "메모리 100K · 월 100K ops",
        "프로젝트 3개 · 개발+운영 환경",
        "비동기 이메일 지원",
        "2026 메모리 프리미티브 전부 포함",
        "한국어 페르소나 seed (1K 샘플)",
      ],
      ctaLabel: "Indie 시작",
      ctaHref: "/enterprise",
    },
    {
      name: "Studio",
      price: "$299",
      priceSub: "/월",
      cadence: "라이브 타이틀 1개",
      scope: "메모리 최대 1M",
      summary:
        "실제 게임에 지속 메모리를 투입. 수천 개 NPC, 상시 이벤트 스트림, 시즌 런칭을 버티는 헤드룸.",
      details: [
        "메모리 1M · 월 1M ops",
        "프로젝트 10개 · 무제한 환경",
        "직접 응답 지원",
        "Deterministic replay + 감사 로그 export",
        "Nemotron-Personas-Korea 전체 접근 (7M)",
      ],
      ctaLabel: "사이징 상담",
      ctaHref: "/enterprise",
      featured: true,
    },
    {
      name: "Pro",
      price: "$999",
      priceSub: "/월",
      annual: "연 $8,991 (25% 할인)",
      cadence: "스케일 라이브옵스",
      scope: "메모리 최대 5M",
      summary:
        "공개 SLA와 프로덕션 에스컬레이션 경로가 필요한 멀티 타이틀 라이브옵스용 플랜입니다.",
      details: [
        "메모리 5M · 무제한 ops",
        "무제한 프로젝트·환경",
        { text: "99.9% 가동률 SLA", href: "/sla" },
        "SSO 포함",
        "분기당 포스트모템 리포트 2건",
        "Chaos Monkey 우선 큐",
        "Canon Lock 팀 리뷰 워크플로",
        "엔지니어링 전용 Slack",
        "한국 데이터 레지던시 옵션",
      ],
      ctaLabel: "Pro 업그레이드",
      ctaHref: "/enterprise",
    },
    {
      name: "Enterprise",
      price: "$2,500+",
      priceSub: "/월부터",
      cadence: "퍼블리셔 범위",
      scope: "셀프호스트 또는 프라이빗 클라우드",
      summary:
        "스튜디오·타이틀 전반의 공용 메모리 인프라. 지역 배포, 프라이빗 네트워킹, 조달 대응 계약.",
      details: [
        "커스텀 메모리·ops 캡",
        "셀프호스트 또는 전용 프라이빗 클라우드",
        "SSO / SAML 포함",
        "99.9% 초과 커스텀 SLA",
        "전담 지원 엔지니어",
        "커스텀 BAA / DPA",
      ],
      ctaLabel: "Seizn 상담",
      ctaHref: "/enterprise",
    },
  ],
  matrixTitle: "어느 시점에 다음 티어로 가는가",
  matrixSubtitle: "사람 수가 아니라 그래프 규모와 이벤트 흐름을 기준으로 봅니다.",
  matrixRows: [
    {
      label: "메모리",
      free: "10K",
      indie: "100K",
      studio: "1M",
      pro: "5M",
      enterprise: "커스텀",
    },
    {
      label: "월 ops",
      free: "10K",
      indie: "100K",
      studio: "1M",
      pro: "무제한",
      enterprise: "커스텀",
    },
    {
      label: "프로젝트",
      free: "1",
      indie: "3",
      studio: "10",
      pro: "무제한",
      enterprise: "무제한",
    },
    {
      label: "지원",
      free: "문서만",
      indie: "비동기 이메일",
      studio: "직접 응답",
      pro: "SLA + 전용 Slack",
      enterprise: "전담 엔지니어",
    },
    {
      label: "배포 형태",
      free: "관리형 클라우드",
      indie: "관리형 클라우드",
      studio: "관리형 클라우드",
      pro: "관리형 클라우드",
      enterprise: "셀프호스트 또는 프라이빗",
    },
    {
      label: "적합한 팀",
      free: "프로토타입",
      indie: "잼 게임·인디 런칭",
      studio: "출시 타이틀 1종",
      pro: "멀티 타이틀 라이브옵스",
      enterprise: "퍼블리셔·규제 환경",
    },
  ],
  faqTitle: "게임 팀이 가장 먼저 묻는 질문",
  faqSubtitle: "메모리를 실제 서비스에 넣기 전에 확인하는 항목들.",
  faq: [
    {
      q: "메모리 단위는 어떻게 세나요?",
      a: "런타임이 나중에 회수할 수 있도록 저장된 사실·이벤트·관계·관찰 모두 해당합니다. NPC, 팩션, 아이템, 퀘스트, witness 이벤트 등 다음 턴에서 다시 꺼내 쓰는 모든 노드입니다. 작가·디자이너·QA 좌석은 과금 대상이 아닙니다.",
    },
    {
      q: "메모리 상한을 넘기면 어떻게 되나요?",
      a: "Free와 Indie에서는 다음 결제 주기 또는 업그레이드 시까지 쓰기가 일시 중단됩니다. Studio와 Pro에서는 용량을 먼저 확장하고 다음 청구서에서 정산합니다 — 런칭 중 hard stop 없음.",
    },
    {
      q: "Inworld·Convai·NVIDIA ACE를 바꿔야 하나요?",
      a: "아닙니다. Seizn은 대화 엔진 옆에 붙습니다. 음성·퍼스널리티·행동은 기존 엔진에 두고, Seizn이 지속 메모리·관계 그래프 업데이트·회수를 맡습니다.",
    },
    {
      q: "Indie가 왜 Studio보다 훨씬 저렴한가요?",
      a: "Indie는 소규모 팀·잼 빌더가 Studio로 가기 전 프로덕션에서 먼저 출시할 수 있도록 discovery 가격으로 책정됐습니다. Studio 가격은 런칭 규모 용량, 직접 응답 지원, deterministic replay 같은 프로덕션 기능을 반영합니다.",
    },
    {
      q: "어떤 경우에 Enterprise가 필요한가요?",
      a: "99.9%를 초과하는 커스텀 SLA, 전담 지원 엔지니어, 커스텀 BAA / DPA, 데이터 레지던시, 셀프호스트, 퍼블리셔 전반의 메모리 인프라가 필요할 때 Enterprise가 맞습니다.",
    },
    {
      q: "연간 결제 할인이 있나요?",
      a: "Pro 연간 결제는 월 결제 대비 25% 할인된 $8,991/년입니다. Enterprise 계약은 항상 연간이며 케이스별 협상입니다.",
    },
  ],
  finalCtaTitle: "세계 규모 산정이 필요하신가요?",
  finalCtaSubtitle:
    "NPC 수, 이벤트 발생률, 대화 스택을 알려주시면 한 번의 미팅에서 맞는 티어와 연동 경로를 바로 잡아드립니다.",
  finalCtaPrimary: "데모 예약",
  finalCtaSecondary: "문서 보기",
};

function getCopy(locale: Locale): Copy {
  if (locale === "ko") return COPY_KO;
  return COPY_EN;
}

export function PricingClient({ dict, locale }: PricingClientProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const copy = getCopy(locale);
  const compareLabel = dict.extremeHome?.nav?.compare || "Integrations";
  const enterpriseLabel = dict.extremeHome?.nav?.enterprise || "For Studios";
  const batchBProDetails = [
    dict.pricing.pro.replayRerun,
    dict.pricing.pro.dsrAutomation,
    dict.pricing.pro.memoryTiering,
  ].filter((detail): detail is string => Boolean(detail));

  return (
    <div className="dark bg-szn-bg text-szn-text-1 min-h-screen">
      <nav className="sticky top-0 z-50 border-b border-szn-border-subtle bg-szn-bg/80 backdrop-blur-xl" aria-label="Pricing navigation">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href={`/${locale}`} className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/seizn-mark-256.png" alt="Seizn" className="h-7 w-7" />
            <span className="font-medium text-[15px] tracking-[-0.01em] text-szn-text-1">Seizn</span>
          </Link>

          <div className="flex items-center gap-5">
            <Link href={`/${locale}/pricing`} className="hidden text-[13px] font-medium text-szn-text-1 md:block">
              {dict.nav.pricing}
            </Link>
            <Link href={`/${locale}/comparison`} className="hidden text-[13px] text-szn-text-2 transition-colors hover:text-szn-text-1 md:block">
              {compareLabel}
            </Link>
            <Link href={`/${locale}/enterprise`} className="hidden text-[13px] text-szn-text-2 transition-colors hover:text-szn-text-1 md:block">
              {enterpriseLabel}
            </Link>
            <Link href={`/${locale}/docs`} className="hidden text-[13px] text-szn-text-2 transition-colors hover:text-szn-text-1 md:block">
              {dict.nav.docs}
            </Link>
            <LanguageSwitcher currentLocale={locale} />
            <Link
              href={`/${locale}/enterprise`}
              className="rounded-md bg-szn-signal px-4 py-2 text-[13px] font-medium text-szn-signal-fg transition-colors hover:bg-szn-signal-hover"
            >
              {dict.nav.getStarted}
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-szn-border-subtle">
          <div className="absolute inset-0 szn-glow-signal opacity-50 pointer-events-none" aria-hidden="true" />
          <div className="relative mx-auto max-w-6xl px-6 py-24 lg:py-32">
            <div className="max-w-4xl">
              <div className="szn-section-number mb-6">{copy.eyebrow}</div>
              <h1 className="szn-serif text-[clamp(44px,7vw,96px)] leading-[1.0] text-szn-text-1 tracking-[-0.03em]">
                {copy.title}{" "}
                <em className="italic text-szn-signal font-normal">{copy.titleItalic}</em>.
              </h1>
              <p className="mt-8 max-w-3xl text-[17px] leading-[1.55] text-szn-text-2">{copy.subtitle}</p>
              <p className="mt-4 max-w-3xl text-[14px] leading-[1.6] text-szn-text-3">{copy.helper}</p>

              <div className="mt-10 flex flex-wrap gap-3">
                <Link href={`/${locale}/docs/quickstart`} className="szn-btn-signal">
                  {copy.primaryCta}
                </Link>
                <Link href={`/${locale}/enterprise`} className="szn-btn-ghost">
                  {copy.secondaryCta}
                </Link>
              </div>
            </div>

            <div className="mt-16 grid gap-px bg-szn-border-subtle border-y border-szn-border-subtle md:grid-cols-3">
              {copy.statChips.map((chip) => (
                <div key={chip} className="bg-szn-bg px-5 py-5 text-[13px] leading-[1.6] text-szn-text-2">
                  {chip}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Plans */}
        <section className="border-b border-szn-border-subtle">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="mb-16 max-w-2xl">
              <div className="szn-section-number mb-6">02 / PLANS</div>
              <h2 className="szn-serif text-[clamp(32px,4.2vw,56px)] leading-[1.05] text-szn-text-1">
                {copy.plansTitle}
              </h2>
              <p className="mt-5 text-[15px] leading-[1.6] text-szn-text-2">{copy.plansSubtitle}</p>
            </div>

            <div className="grid gap-px bg-szn-border-subtle border-y border-szn-border-subtle lg:grid-cols-5">
              {copy.plans.map((plan, i) => (
                <div
                  key={plan.name}
                  className={`relative flex h-full flex-col bg-szn-bg p-6 transition-colors ${
                    plan.featured ? "bg-szn-signal-soft" : ""
                  }`}
                >
                  {plan.featured && (
                    <span
                      className="absolute left-0 top-6 bottom-6 w-px bg-szn-signal"
                      aria-hidden="true"
                    />
                  )}
                  <div className="mb-5">
                    <div className="szn-eyebrow mb-3">{`0${i + 1} / ${plan.name.toUpperCase()}`}</div>
                    <div className="flex items-baseline gap-1">
                      <span className="font-mono text-[30px] tabular-nums tracking-[-0.02em] text-szn-text-1">
                        {plan.price}
                      </span>
                      {plan.priceSub && (
                        <span className="font-mono text-[13px] text-szn-text-3">{plan.priceSub}</span>
                      )}
                    </div>
                    <p className="mt-2 text-[12px] text-szn-text-3 font-mono uppercase tracking-[0.12em]">
                      {plan.cadence}
                    </p>
                    {plan.annual && (
                      <p className="mt-2 font-mono text-[13px] text-szn-signal">{plan.annual}</p>
                    )}
                  </div>

                  <p className="text-[13px] leading-[1.6] text-szn-text-2 mb-6">{plan.summary}</p>

                  <ul className="mb-8 flex-1 space-y-2.5">
                    {(plan.name === "Pro" ? [...plan.details, ...batchBProDetails] : plan.details).map((detail) => (
                      <li
                        key={typeof detail === "string" ? detail : detail.text}
                        className="flex items-start gap-2 text-[12px] leading-[1.55] text-szn-text-2"
                      >
                        <span className="mt-1.5 h-1 w-1 rounded-full bg-szn-signal shrink-0" />
                        {typeof detail === "string" ? (
                          <span>{detail}</span>
                        ) : (
                          <Link href={`/${locale}${detail.href}`} className="text-szn-signal hover:text-szn-text-1">
                            {detail.text}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={`/${locale}${plan.ctaHref}`}
                    className={
                      plan.featured
                        ? "szn-btn-signal justify-center"
                        : "szn-btn-ghost justify-center"
                    }
                  >
                    {plan.ctaLabel}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Matrix */}
        <section className="border-b border-szn-border-subtle">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="mb-12 max-w-2xl">
              <div className="szn-section-number mb-6">03 / SIZING</div>
              <h2 className="szn-serif text-[clamp(28px,3.6vw,44px)] leading-[1.1] text-szn-text-1">
                {copy.matrixTitle}
              </h2>
              <p className="mt-4 text-[14px] leading-[1.6] text-szn-text-2">{copy.matrixSubtitle}</p>
            </div>

            <div className="overflow-x-auto border-y border-szn-border-subtle">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="border-b border-szn-border-subtle">
                    <th className="px-4 py-4 text-left szn-eyebrow">Scope</th>
                    <th className="px-4 py-4 text-left szn-eyebrow">Free</th>
                    <th className="px-4 py-4 text-left szn-eyebrow">Indie</th>
                    <th className="px-4 py-4 text-left szn-eyebrow text-szn-signal">Studio</th>
                    <th className="px-4 py-4 text-left szn-eyebrow">Pro</th>
                    <th className="px-4 py-4 text-left szn-eyebrow">Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {copy.matrixRows.map((row) => (
                    <tr key={row.label} className="border-b border-szn-border-subtle last:border-b-0">
                      <th className="px-4 py-4 text-left text-[13px] font-medium text-szn-text-1">
                        {row.label}
                      </th>
                      <td className="px-4 py-4 font-mono text-[12px] leading-[1.6] text-szn-text-2 tabular-nums">
                        {row.free}
                      </td>
                      <td className="px-4 py-4 font-mono text-[12px] leading-[1.6] text-szn-text-2 tabular-nums">
                        {row.indie}
                      </td>
                      <td className="px-4 py-4 font-mono text-[12px] leading-[1.6] text-szn-text-1 tabular-nums">
                        {row.studio}
                      </td>
                      <td className="px-4 py-4 font-mono text-[12px] leading-[1.6] text-szn-text-2 tabular-nums">
                        {row.pro}
                      </td>
                      <td className="px-4 py-4 font-mono text-[12px] leading-[1.6] text-szn-text-2 tabular-nums">
                        {row.enterprise}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-b border-szn-border-subtle">
          <div className="mx-auto max-w-4xl px-6 py-24">
            <div className="mb-12 max-w-2xl">
              <div className="szn-section-number mb-6">04 / FAQ</div>
              <h2 className="szn-serif text-[clamp(28px,3.6vw,44px)] leading-[1.1] text-szn-text-1">
                {copy.faqTitle}
              </h2>
              <p className="mt-4 text-[14px] leading-[1.6] text-szn-text-2">{copy.faqSubtitle}</p>
            </div>

            <div className="border-y border-szn-border-subtle">
              {copy.faq.map((item, index) => {
                const isOpen = openFaq === index;
                return (
                  <div key={item.q} className="border-b border-szn-border-subtle last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : index)}
                      className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left hover:bg-szn-surface-1 transition-colors"
                      aria-expanded={isOpen ? "true" : "false"}
                    >
                      <span className="text-[15px] font-medium text-szn-text-1">{item.q}</span>
                      <span className="font-mono text-[16px] text-szn-signal">
                        {isOpen ? "−" : "+"}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-6 text-[13px] leading-[1.7] text-szn-text-2">{item.a}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 szn-glow-signal opacity-40 pointer-events-none" aria-hidden="true" />
          <div className="relative mx-auto max-w-6xl px-6 py-28">
            <div className="max-w-3xl">
              <div className="szn-section-number mb-6">05 / SHIP IT</div>
              <h2 className="szn-serif text-[clamp(36px,5vw,68px)] leading-[1.02] text-szn-text-1 tracking-[-0.025em]">
                {copy.finalCtaTitle}
              </h2>
              <p className="mt-5 max-w-2xl text-[15px] leading-[1.6] text-szn-text-2">
                {copy.finalCtaSubtitle}
              </p>
              <div className="mt-10 flex flex-wrap gap-3">
                <Link href={`/${locale}/enterprise`} className="szn-btn-signal">
                  {copy.finalCtaPrimary}
                </Link>
                <Link href={`/${locale}/docs/quickstart`} className="szn-btn-ghost">
                  {copy.finalCtaSecondary}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-szn-border-subtle">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-10 md:flex-row md:items-center md:justify-between">
          <Link href={`/${locale}`} className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/seizn-mark-256.png" alt="Seizn" className="h-6 w-6" />
            <span className="text-[13px] font-medium text-szn-text-1">Seizn</span>
          </Link>

          <div className="font-mono text-[12px] tracking-tight text-szn-text-3">
            {dict.footer.copyright.replace("{year}", new Date().getFullYear().toString())}
          </div>

          <nav className="flex flex-wrap items-center gap-5">
            <Link href={`/${locale}/privacy`} className="text-[13px] text-szn-text-3 transition-colors hover:text-szn-text-1">
              {dict.footer.privacy}
            </Link>
            <Link href={`/${locale}/terms`} className="text-[13px] text-szn-text-3 transition-colors hover:text-szn-text-1">
              {dict.footer.terms}
            </Link>
            <Link href={`/${locale}/sla`} className="text-[13px] text-szn-text-3 transition-colors hover:text-szn-text-1">
              {dict.footer.sla}
            </Link>
            <Link href={`/${locale}/status`} className="text-[13px] text-szn-text-3 transition-colors hover:text-szn-text-1">
              {dict.footer.status}
            </Link>
            <Link href={`/${locale}/enterprise`} className="text-[13px] text-szn-text-3 transition-colors hover:text-szn-text-1">
              {dict.footer.contact}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
