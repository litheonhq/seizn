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

type Plan = {
  name: string;
  price: string;
  cadence: string;
  scope: string;
  summary: string;
  details: string[];
  ctaLabel: string;
  ctaHref: string;
  featured?: boolean;
};

type MatrixRow = {
  label: string;
  free: string;
  studio: string;
  enterprise: string;
};

type FAQItem = {
  q: string;
  a: string;
};

type Copy = {
  eyebrow: string;
  title: string;
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
  eyebrow: "NPC pricing",
  title: "Price memory by world scale, not by seat count.",
  subtitle:
    "Seizn meters the persistent graph behind your NPCs: entities, relations, and event throughput. Keep Inworld, Convai, ACE, or your own dialogue stack.",
  helper:
    "Studio starts at $499/month for one live title. Enterprise covers multi-title rollout, self-hosting, private networking, and procurement-heavy launches.",
  primaryCta: "Book a demo",
  secondaryCta: "View integrations",
  statChips: [
    "No seat tax for writers, quest designers, or QA.",
    "Works beside Inworld, Convai, ACE, or your own runtime.",
    "Built for teams moving from 10 NPC prototypes to 10,000 NPC worlds.",
  ],
  plansTitle: "Plans for prototype, launch, and live ops",
  plansSubtitle:
    "Use Free to prove the retrieval loop. Move to Studio when one title needs persistent memory in production.",
  plans: [
    {
      name: "Free",
      price: "$0",
      cadence: "Dev tier",
      scope: "Up to 250 NPC entities",
      summary:
        "Prototype memory recall, faction relations, and event logging in a vertical slice without paying for seats.",
      details: [
        "Raw HTTP plus JavaScript and Python setup",
        "One prototype world with manual tuning",
        "Docs-led onboarding",
      ],
      ctaLabel: "Read the docs",
      ctaHref: "/docs/quickstart",
    },
    {
      name: "Studio",
      price: "From $499",
      cadence: "per month / per title",
      scope: "For one live project",
      summary:
        "Ship persistent memory into a production game with room for thousands of NPC entities and always-on event streams.",
      details: [
        "Sizing around entity graph and monthly event writes",
        "Unity, Unreal, or Godot integration guidance",
        "Launch planning before content spikes and seasonal events",
      ],
      ctaLabel: "Book a sizing call",
      ctaHref: "/enterprise",
      featured: true,
    },
    {
      name: "Enterprise",
      price: "Custom",
      cadence: "multi-title / self-hosted",
      scope: "Publisher and platform scope",
      summary:
        "For shared memory infrastructure, regional deployment, SSO, or private networking requirements across studios or titles.",
      details: [
        "Self-hosted or controlled deployment options",
        "SSO / SAML and procurement support",
        "Priority support plus architecture review",
      ],
      ctaLabel: "Talk to Seizn",
      ctaHref: "/enterprise",
    },
  ],
  matrixTitle: "How teams usually size the jump",
  matrixSubtitle: "The meter is the graph and event flow, not the number of people touching the tool.",
  matrixRows: [
    {
      label: "Typical NPC footprint",
      free: "Up to 250 entities in a prototype",
      studio: "Thousands per live title",
      enterprise: "10,000+ across titles or shards",
    },
    {
      label: "Event write pattern",
      free: "Quest-state and dialogue test data",
      studio: "Always-on world events and witness logs",
      enterprise: "Cross-region live ops and backfills",
    },
    {
      label: "Dialogue stack",
      free: "Raw HTTP or thin wrapper",
      studio: "Keep Inworld, Convai, ACE, or your own stack",
      enterprise: "Custom adapters and platform review",
    },
    {
      label: "Support model",
      free: "Docs and async support",
      studio: "Launch planning and direct response",
      enterprise: "Dedicated channel and success plan",
    },
    {
      label: "Deployment shape",
      free: "Managed cloud",
      studio: "Managed cloud for one shipped title",
      enterprise: "Private networking or self-hosted",
    },
    {
      label: "Best fit",
      free: "Prototype and vertical slice",
      studio: "Shipping one memory-heavy game",
      enterprise: "Publisher, platform, or regulated live ops",
    },
  ],
  faqTitle: "FAQ for game teams",
  faqSubtitle: "The questions studios ask before memory goes into production.",
  faq: [
    {
      q: "How does pricing work when we reach 10,000 NPCs?",
      a: "We scope on active entity graph size, relation fan-out, and monthly event writes. Studio covers one live title. Enterprise is the path when you need multi-title rollout, private networking, or custom capacity planning.",
    },
    {
      q: "What counts as an entity?",
      a: "Anything you want retrievable across turns: NPCs, factions, households, guilds, locations, quest objects, or named items. Seats for writers, designers, QA, or narrative tools are not billed.",
    },
    {
      q: "Do we need to replace Inworld, Convai, or NVIDIA ACE?",
      a: "No. Seizn sits beside your dialogue engine. Keep voices and behavior where they already live; Seizn handles persistent memory, relation graph updates, and retrieval.",
    },
    {
      q: "What happens during launch spikes or seasonal events?",
      a: "We size plans around expected event throughput and pre-warm headroom before launches. If world-state writes ramp faster than forecast, capacity is raised without forcing you into seat-based upgrades.",
    },
    {
      q: "When do we need Enterprise?",
      a: "Choose Enterprise when security review, SSO / SAML, data residency, self-hosting, or multi-title memory infrastructure enters the conversation.",
    },
  ],
  finalCtaTitle: "Need a world-size estimate?",
  finalCtaSubtitle:
    "Bring your NPC count, event rate, and dialogue stack. We will map the right tier and integration path.",
  finalCtaPrimary: "Book a demo",
  finalCtaSecondary: "Read the docs",
};

const COPY_KO: Copy = {
  eyebrow: "NPC 가격",
  title: "좌석 수가 아니라 세계 규모에 맞춰 메모리를 과금합니다.",
  subtitle:
    "Seizn은 NPC 뒤의 지속 메모리 그래프를 기준으로 요금이 정해집니다. 엔티티, 관계, 이벤트 처리량을 보고 산정하며 Inworld, Convai, ACE, 자체 대화 스택은 그대로 유지할 수 있습니다.",
  helper:
    "Studio는 타이틀당 월 $499부터 시작합니다. 멀티 타이틀, 셀프호스트, 프라이빗 네트워킹, 조달 심사가 들어가는 경우는 Enterprise에서 다룹니다.",
  primaryCta: "데모 예약",
  secondaryCta: "통합 보기",
  statChips: [
    "작가, 퀘스트 디자이너, QA 좌석에는 과금하지 않습니다.",
    "Inworld, Convai, ACE, 자체 런타임과 나란히 붙습니다.",
    "NPC 10개 프로토타입부터 10,000개 월드까지 맞춰 설계합니다.",
  ],
  plansTitle: "프로토타입, 출시, 라이브옵스를 위한 세 단계",
  plansSubtitle:
    "Free로 회수 루프를 검증하고, 실제 타이틀에 지속 메모리를 넣는 시점에 Studio로 올라갑니다.",
  plans: [
    {
      name: "Free",
      price: "$0",
      cadence: "개발용 티어",
      scope: "최대 250개 NPC 엔티티",
      summary:
        "좌석 과금 없이 버티컬 슬라이스에서 메모리 회수, 관계 그래프, 이벤트 기록을 먼저 검증합니다.",
      details: [
        "Raw HTTP와 JavaScript, Python 시작 경로",
        "프로토타입 월드 1개 기준 수동 튜닝",
        "문서 중심 온보딩",
      ],
      ctaLabel: "문서 보기",
      ctaHref: "/docs/quickstart",
    },
    {
      name: "Studio",
      price: "월 $499부터",
      cadence: "타이틀 기준",
      scope: "라이브 프로젝트 1개",
      summary:
        "수천 개 NPC 엔티티와 상시 이벤트 스트림을 다루는 실제 게임에 지속 메모리를 넣기 위한 구간입니다.",
      details: [
        "엔티티 그래프와 월간 이벤트 쓰기량 기준 산정",
        "Unity, Unreal, Godot 연동 가이드",
        "시즌 이벤트와 런칭 스파이크 전 사전 용량 계획",
      ],
      ctaLabel: "사이징 상담 예약",
      ctaHref: "/enterprise",
      featured: true,
    },
    {
      name: "Enterprise",
      price: "별도 협의",
      cadence: "멀티 타이틀 / 셀프호스트",
      scope: "퍼블리셔 및 플랫폼 범위",
      summary:
        "스튜디오나 타이틀을 넘나드는 공용 메모리 인프라, 지역 배포, SSO, 프라이빗 네트워킹이 필요한 경우입니다.",
      details: [
        "셀프호스트 및 통제 배포 옵션",
        "SSO / SAML과 조달 대응",
        "우선 지원과 아키텍처 리뷰",
      ],
      ctaLabel: "Seizn과 상담",
      ctaHref: "/enterprise",
    },
  ],
  matrixTitle: "어느 시점에 다음 티어로 가는가",
  matrixSubtitle: "사람 수가 아니라 그래프 규모와 이벤트 흐름을 기준으로 봅니다.",
  matrixRows: [
    {
      label: "일반적인 NPC 규모",
      free: "프로토타입 기준 최대 250개 엔티티",
      studio: "타이틀당 수천 개 규모",
      enterprise: "타이틀 또는 샤드 합산 10,000개 이상",
    },
    {
      label: "이벤트 쓰기 패턴",
      free: "퀘스트 상태와 대화 테스트 데이터",
      studio: "상시 월드 이벤트와 witness 로그",
      enterprise: "지역 단위 라이브옵스와 대량 백필",
    },
    {
      label: "대화 스택",
      free: "Raw HTTP 또는 얇은 래퍼",
      studio: "Inworld, Convai, ACE, 자체 스택 유지",
      enterprise: "커스텀 어댑터와 플랫폼 리뷰",
    },
    {
      label: "지원 방식",
      free: "문서와 비동기 지원",
      studio: "런칭 계획과 직접 응답",
      enterprise: "전용 채널과 성공 계획",
    },
    {
      label: "배포 형태",
      free: "관리형 클라우드",
      studio: "단일 타이틀용 관리형 클라우드",
      enterprise: "프라이빗 네트워킹 또는 셀프호스트",
    },
    {
      label: "적합한 팀",
      free: "프로토타입과 버티컬 슬라이스",
      studio: "메모리 비중이 높은 게임 1종 출시",
      enterprise: "퍼블리셔, 플랫폼, 규제 환경 라이브옵스",
    },
  ],
  faqTitle: "게임 팀이 가장 먼저 묻는 질문",
  faqSubtitle: "메모리를 실제 서비스에 넣기 전에 확인하는 항목들입니다.",
  faq: [
    {
      q: "NPC가 10,000개까지 가면 요금은 어떻게 잡히나요?",
      a: "활성 엔티티 그래프 크기, 관계 fan-out, 월간 이벤트 쓰기량을 기준으로 범위를 잡습니다. Studio는 라이브 타이틀 1개 기준이고, 멀티 타이틀 확장이나 프라이빗 네트워킹, 맞춤 용량 계획이 필요하면 Enterprise로 넘어갑니다.",
    },
    {
      q: "엔티티에는 무엇이 포함되나요?",
      a: "대화 중 다시 꺼내 써야 하는 모든 노드가 대상입니다. NPC, 팩션, 가문, 길드, 장소, 퀘스트 오브젝트, 이름이 붙은 아이템까지 포함할 수 있습니다. 작가나 디자이너 좌석은 과금 대상이 아닙니다.",
    },
    {
      q: "Inworld, Convai, NVIDIA ACE를 바꿔야 하나요?",
      a: "아닙니다. Seizn은 대화 엔진 옆에 붙습니다. 음성, 퍼스널리티, 행동은 기존 엔진에 두고, Seizn이 지속 메모리, 관계 그래프 업데이트, 회수를 맡습니다.",
    },
    {
      q: "런칭 스파이크나 시즌 이벤트가 오면 어떻게 되나요?",
      a: "예상 이벤트 처리량을 기준으로 사전에 용량을 잡고, 런칭 전에 헤드룸을 확보합니다. 월드 상태 쓰기가 예상보다 빨라져도 좌석 기반 업셀 없이 용량부터 조정합니다.",
    },
    {
      q: "어떤 경우에 Enterprise가 필요한가요?",
      a: "보안 심사, SSO / SAML, 데이터 레지던시, 셀프호스트, 멀티 타이틀 메모리 인프라가 논의되기 시작하면 Enterprise가 맞습니다.",
    },
  ],
  finalCtaTitle: "세계 규모 산정이 필요하신가요?",
  finalCtaSubtitle:
    "NPC 수, 이벤트 발생률, 대화 스택을 알려주시면 맞는 티어와 연동 경로를 바로 잡아드립니다.",
  finalCtaPrimary: "데모 예약",
  finalCtaSecondary: "문서 보기",
};

function getCopy(locale: Locale): Copy {
  if (locale === "ko") return COPY_KO;
  return COPY_EN;
}

function planCardStyle(featured?: boolean): string {
  if (featured) {
    return "border-cyan-400/40 bg-cyan-400/10";
  }

  return "border-white/10 bg-white/5";
}

export function PricingClient({ dict, locale }: PricingClientProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const copy = getCopy(locale);
  const compareLabel = dict.extremeHome?.nav?.compare || "Integrations";
  const enterpriseLabel = dict.extremeHome?.nav?.enterprise || "For Studios";

  return (
    <div className="min-h-screen bg-[#08111f] text-white">
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#08111f]/95 backdrop-blur" aria-label="Pricing navigation">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href={`/${locale}`} className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-cyan-400 text-sm font-semibold text-[#08111f]">
              S
            </div>
            <span className="text-lg font-semibold text-white">Seizn</span>
          </Link>

          <div className="flex items-center gap-5">
            <Link href={`/${locale}/pricing`} className="hidden text-sm font-medium text-white md:block">
              {dict.nav.pricing}
            </Link>
            <Link href={`/${locale}/comparison`} className="hidden text-sm text-slate-300 transition-colors hover:text-white md:block">
              {compareLabel}
            </Link>
            <Link href={`/${locale}/enterprise`} className="hidden text-sm text-slate-300 transition-colors hover:text-white md:block">
              {enterpriseLabel}
            </Link>
            <Link href={`/${locale}/docs`} className="hidden text-sm text-slate-300 transition-colors hover:text-white md:block">
              {dict.nav.docs}
            </Link>
            <LanguageSwitcher currentLocale={locale} />
            <Link
              href={`/${locale}/enterprise`}
              className="rounded-md bg-cyan-400 px-4 py-2 text-sm font-medium text-[#08111f] transition-colors hover:bg-cyan-300"
            >
              {dict.nav.getStarted}
            </Link>
          </div>
        </div>
      </nav>

      <main>
        <section className="border-b border-white/10">
          <div className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
            <div className="max-w-4xl">
              <p className="text-sm font-medium uppercase tracking-[0.08em] text-cyan-300">{copy.eyebrow}</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white md:text-6xl">{copy.title}</h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">{copy.subtitle}</p>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">{copy.helper}</p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={`/${locale}/enterprise`}
                  className="rounded-md bg-cyan-400 px-5 py-3 text-sm font-medium text-[#08111f] transition-colors hover:bg-cyan-300"
                >
                  {copy.primaryCta}
                </Link>
                <Link
                  href={`/${locale}/comparison`}
                  className="rounded-md border border-white/15 px-5 py-3 text-sm font-medium text-white transition-colors hover:border-white/25 hover:bg-white/5"
                >
                  {copy.secondaryCta}
                </Link>
              </div>
            </div>

            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {copy.statChips.map((chip) => (
                <div key={chip} className="border border-white/10 bg-white/5 px-4 py-4 text-sm leading-6 text-slate-200">
                  {chip}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-white/10">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-semibold text-white md:text-4xl">{copy.plansTitle}</h2>
              <p className="mt-4 text-lg leading-8 text-slate-300">{copy.plansSubtitle}</p>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {copy.plans.map((plan) => (
                <div key={plan.name} className={`flex h-full flex-col border px-6 py-6 ${planCardStyle(plan.featured)}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium uppercase tracking-[0.08em] text-slate-300">{plan.name}</p>
                      <h3 className="mt-3 text-3xl font-semibold text-white">{plan.price}</h3>
                      <p className="mt-2 text-sm text-slate-400">{plan.cadence}</p>
                    </div>
                    <span className="rounded-md border border-white/10 px-3 py-1 text-xs font-medium text-slate-200">
                      {plan.scope}
                    </span>
                  </div>

                  <p className="mt-6 text-sm leading-7 text-slate-300">{plan.summary}</p>

                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.details.map((detail) => (
                      <li key={detail} className="flex items-start gap-3 text-sm leading-6 text-slate-200">
                        <span className="mt-1 h-2 w-2 rounded-full bg-cyan-300" />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={`/${locale}${plan.ctaHref}`}
                    className={`mt-8 rounded-md px-4 py-3 text-center text-sm font-medium transition-colors ${
                      plan.featured
                        ? "bg-cyan-400 text-[#08111f] hover:bg-cyan-300"
                        : "border border-white/15 text-white hover:border-white/25 hover:bg-white/5"
                    }`}
                  >
                    {plan.ctaLabel}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-white/10">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-semibold text-white md:text-4xl">{copy.matrixTitle}</h2>
              <p className="mt-4 text-lg leading-8 text-slate-300">{copy.matrixSubtitle}</p>
            </div>

            <div className="mt-10 overflow-x-auto border border-white/10">
              <table className="min-w-full border-collapse">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-4 text-left text-sm font-medium text-slate-300">Scope</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-slate-300">Free</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-slate-300">Studio</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-slate-300">Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {copy.matrixRows.map((row) => (
                    <tr key={row.label} className="border-t border-white/10">
                      <th className="px-4 py-4 text-left text-sm font-medium text-white">{row.label}</th>
                      <td className="px-4 py-4 text-sm leading-6 text-slate-300">{row.free}</td>
                      <td className="px-4 py-4 text-sm leading-6 text-slate-300">{row.studio}</td>
                      <td className="px-4 py-4 text-sm leading-6 text-slate-300">{row.enterprise}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="border-b border-white/10">
          <div className="mx-auto max-w-4xl px-6 py-20">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-semibold text-white md:text-4xl">{copy.faqTitle}</h2>
              <p className="mt-4 text-lg leading-8 text-slate-300">{copy.faqSubtitle}</p>
            </div>

            <div className="mt-10 space-y-3">
              {copy.faq.map((item, index) => {
                const isOpen = openFaq === index;

                return (
                  <div key={item.q} className="border border-white/10 bg-white/5">
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : index)}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                    >
                      <span className="text-base font-medium text-white">{item.q}</span>
                      <span className="text-sm text-slate-400">{isOpen ? "-" : "+"}</span>
                    </button>
                    {isOpen ? (
                      <div className="border-t border-white/10 px-5 py-4 text-sm leading-7 text-slate-300">{item.a}</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <h2 className="text-3xl font-semibold text-white md:text-4xl">{copy.finalCtaTitle}</h2>
                <p className="mt-4 text-lg leading-8 text-slate-300">{copy.finalCtaSubtitle}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/${locale}/enterprise`}
                  className="rounded-md bg-cyan-400 px-5 py-3 text-sm font-medium text-[#08111f] transition-colors hover:bg-cyan-300"
                >
                  {copy.finalCtaPrimary}
                </Link>
                <Link
                  href={`/${locale}/docs/quickstart`}
                  className="rounded-md border border-white/15 px-5 py-3 text-sm font-medium text-white transition-colors hover:border-white/25 hover:bg-white/5"
                >
                  {copy.finalCtaSecondary}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-10 md:flex-row md:items-center md:justify-between">
          <Link href={`/${locale}`} className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-400 text-sm font-semibold text-[#08111f]">
              S
            </div>
            <span className="text-sm font-medium text-white">Seizn</span>
          </Link>

          <div className="text-sm text-slate-400">
            {dict.footer.copyright.replace("{year}", new Date().getFullYear().toString())}
          </div>

          <nav className="flex flex-wrap items-center gap-5">
            <Link href={`/${locale}/privacy`} className="text-sm text-slate-400 transition-colors hover:text-white">
              {dict.footer.privacy}
            </Link>
            <Link href={`/${locale}/terms`} className="text-sm text-slate-400 transition-colors hover:text-white">
              {dict.footer.terms}
            </Link>
            <Link href={`/${locale}/enterprise`} className="text-sm text-slate-400 transition-colors hover:text-white">
              {dict.footer.contact}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
