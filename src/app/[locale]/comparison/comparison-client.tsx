"use client";

import Link from "next/link";
import { LandingNav } from "@/components/shared/site-nav";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";

interface ComparisonClientProps {
  dict: Dictionary;
  locale: Locale;
}

type MatrixRow = {
  feature: string;
  seizn: string;
  inworld: string;
  convai: string;
  ace: string;
};

type Principle = {
  title: string;
  body: string;
};

type Copy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  helper: string;
  primaryCta: string;
  secondaryCta: string;
  tableTitle: string;
  tableSubtitle: string;
  rows: MatrixRow[];
  principlesTitle: string;
  principlesSubtitle: string;
  principles: Principle[];
  finalCtaTitle: string;
  finalCtaSubtitle: string;
  finalPrimary: string;
  finalSecondary: string;
};

const COPY_EN: Copy = {
  eyebrow: "Integration matrix",
  title: "You keep your dialogue engine. Seizn handles the memory graph.",
  subtitle:
    "This page is not a head-to-head takedown. It shows where Seizn fits when a studio already uses Inworld, Convai, NVIDIA ACE, or its own runtime.",
  helper:
    "Use Seizn alone when you own dialogue orchestration. Add Seizn beside Inworld, Convai, or ACE when the missing layer is persistent memory, relations, and world-state recall.",
  primaryCta: "Read integration docs",
  secondaryCta: "Talk to Seizn",
  tableTitle: "How the stack changes by setup",
  tableSubtitle: "The combination changes the dialogue layer. The memory graph remains in Seizn.",
  rows: [
    {
      feature: "Primary dialogue layer",
      seizn: "Bring your own LLM or custom runtime",
      inworld: "Inworld handles character dialogue",
      convai: "Convai handles voice and interaction loop",
      ace: "ACE stack handles runtime orchestration",
    },
    {
      feature: "Persistent memory + relations",
      seizn: "Seizn owns the graph",
      inworld: "Seizn owns the graph",
      convai: "Seizn owns the graph",
      ace: "Seizn owns the graph",
    },
    {
      feature: "Factions, witness chains, world state",
      seizn: "Native in Seizn",
      inworld: "Tracked in Seizn and surfaced back to characters",
      convai: "Tracked in Seizn and injected into agent context",
      ace: "Tracked in Seizn and fed into orchestration layer",
    },
    {
      feature: "Next-turn retrieval path",
      seizn: "Direct Seizn API call before response",
      inworld: "Inject Seizn recall into Inworld session context",
      convai: "Inject Seizn recall into Convai agent context",
      ace: "Inject Seizn recall into ACE middleware or tools",
    },
    {
      feature: "Best fit",
      seizn: "Studios building a custom NPC stack",
      inworld: "Teams already committed to Inworld characters",
      convai: "Teams built around Convai interactions",
      ace: "Teams using ACE with graphics-heavy runtime pipelines",
    },
    {
      feature: "Why teams add Seizn",
      seizn: "To avoid rebuilding memory and relation storage",
      inworld: "To persist memory across sessions and generations",
      convai: "To retain world-state and relationship history",
      ace: "To add long-lived graph memory behind real-time runtime systems",
    },
  ],
  principlesTitle: "Three integration rules",
  principlesSubtitle: "The stack works when responsibilities stay clear.",
  principles: [
    {
      title: "1. Keep the dialogue layer where it already works",
      body: "Inworld, Convai, ACE, or your own runtime can keep voices, animation hooks, and turn-level behavior.",
    },
    {
      title: "2. Put long-lived memory in Seizn",
      body: "Entities, relations, witness logs, faction memory, and world-state recall stay in one graph instead of being reimplemented per engine.",
    },
    {
      title: "3. Retrieve before every important turn",
      body: "The only integration requirement is a deterministic place to ask Seizn for recall before the next NPC response is generated.",
    },
  ],
  finalCtaTitle: "Need help choosing the stack?",
  finalCtaSubtitle: "Bring the engine you already ship, the memory problems you have, and the world scale you expect.",
  finalPrimary: "View pricing",
  finalSecondary: "Book a demo",
};

const COPY_KO: Copy = {
  eyebrow: "통합 매트릭스",
  title: "대화 엔진은 그대로 두고, 메모리 그래프는 Seizn이 맡습니다.",
  subtitle:
    "이 페이지는 정면 경쟁 비교가 아닙니다. 스튜디오가 이미 Inworld, Convai, NVIDIA ACE, 혹은 자체 런타임을 쓰고 있을 때 Seizn이 어디에 들어가는지 보여줍니다.",
  helper:
    "대화 오케스트레이션을 직접 소유하면 Seizn 단독으로 가고, 부족한 것이 지속 메모리와 관계 그래프라면 Inworld, Convai, ACE 옆에 Seizn을 붙입니다.",
  primaryCta: "통합 문서 보기",
  secondaryCta: "Seizn과 상담",
  tableTitle: "구성별로 스택이 어떻게 달라지는가",
  tableSubtitle: "달라지는 것은 대화 레이어이고, 메모리 그래프는 계속 Seizn에 둡니다.",
  rows: [
    {
      feature: "주 대화 레이어",
      seizn: "직접 고른 LLM 또는 커스텀 런타임",
      inworld: "Inworld가 캐릭터 대화를 담당",
      convai: "Convai가 음성과 상호작용 루프 담당",
      ace: "ACE 스택이 런타임 오케스트레이션 담당",
    },
    {
      feature: "지속 메모리 + 관계 그래프",
      seizn: "Seizn이 그래프를 소유",
      inworld: "Seizn이 그래프를 소유",
      convai: "Seizn이 그래프를 소유",
      ace: "Seizn이 그래프를 소유",
    },
    {
      feature: "팩션, witness chain, 월드 상태",
      seizn: "Seizn 기본 기능",
      inworld: "Seizn에서 추적하고 캐릭터 쪽에 다시 전달",
      convai: "Seizn에서 추적하고 agent context에 주입",
      ace: "Seizn에서 추적하고 orchestration layer로 전달",
    },
    {
      feature: "다음 턴 회수 경로",
      seizn: "응답 직전 Seizn API 직접 호출",
      inworld: "Inworld 세션 컨텍스트에 Seizn 회수 결과 주입",
      convai: "Convai agent context에 Seizn 회수 결과 주입",
      ace: "ACE 미들웨어나 툴 레이어에 Seizn 회수 결과 주입",
    },
    {
      feature: "잘 맞는 팀",
      seizn: "커스텀 NPC 스택을 직접 만드는 팀",
      inworld: "이미 Inworld 캐릭터에 투자한 팀",
      convai: "Convai 상호작용 중심으로 설계된 팀",
      ace: "그래픽스 비중 높은 ACE 파이프라인 팀",
    },
    {
      feature: "Seizn을 추가하는 이유",
      seizn: "메모리와 관계 저장을 다시 만들지 않기 위해",
      inworld: "세션과 세대를 넘어 메모리를 지속하기 위해",
      convai: "월드 상태와 관계 히스토리를 보존하기 위해",
      ace: "실시간 런타임 뒤에 장기 그래프 메모리를 두기 위해",
    },
  ],
  principlesTitle: "통합 원칙 세 가지",
  principlesSubtitle: "역할 분리가 선명해야 스택이 흔들리지 않습니다.",
  principles: [
    {
      title: "1. 잘 되는 대화 레이어는 그대로 둡니다",
      body: "Inworld, Convai, ACE, 혹은 자체 런타임이 음성, 애니메이션 훅, 턴 단위 행동을 계속 맡습니다.",
    },
    {
      title: "2. 장기 메모리는 Seizn에 둡니다",
      body: "엔티티, 관계, witness 로그, 팩션 메모리, 월드 상태 회수를 엔진마다 따로 구현하지 않고 하나의 그래프에 둡니다.",
    },
    {
      title: "3. 중요한 턴 전에 반드시 회수합니다",
      body: "통합의 핵심은 다음 NPC 응답 전에 Seizn에서 recall을 가져오는 결정적 지점을 두는 것입니다.",
    },
  ],
  finalCtaTitle: "어떤 조합이 맞는지 고민되나요?",
  finalCtaSubtitle: "이미 운영 중인 엔진, 풀고 싶은 메모리 문제, 예상 월드 규모를 기준으로 경로를 잡아드립니다.",
  finalPrimary: "가격 보기",
  finalSecondary: "데모 예약",
};

function getCopy(locale: Locale): Copy {
  if (locale === "ko") return COPY_KO;
  return COPY_EN;
}

export function ComparisonClient({ dict, locale }: ComparisonClientProps) {
  const copy = getCopy(locale);
  const compareLabel = dict.extremeHome?.nav?.compare || "Integrations";
  const enterpriseLabel = dict.extremeHome?.nav?.enterprise || "For Studios";
  const navLabels = {
    docs: dict.nav.docs,
    pricing: dict.nav.pricing,
    compare: compareLabel,
    enterprise: enterpriseLabel,
    status: dict.footer.status,
    cta: dict.nav.getStarted,
  };

  return (
    <div className="dark min-h-screen bg-szn-bg text-szn-text-1">
      <LandingNav locale={locale} labels={navLabels} ctaHref={`/${locale}/enterprise`} ctaLabel={dict.nav.getStarted} />

      <main>
        <section className="border-b border-szn-border-subtle">
          <div className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
            <div className="max-w-4xl">
              <div className="szn-section-number">COMPARISON / INTEGRATIONS</div>
              <p className="mt-6 text-sm font-medium text-szn-signal">{copy.eyebrow}</p>
              <h1 className="szn-serif mt-5 text-4xl font-semibold tracking-normal text-szn-text-1 md:text-6xl">{copy.title}</h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-szn-text-2">{copy.subtitle}</p>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-szn-text-3">{copy.helper}</p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={`/${locale}/docs/integrations`}
                  className="szn-btn-glass px-5 py-3 text-sm"
                >
                  {copy.primaryCta}
                </Link>
                <Link
                  href={`/${locale}/enterprise`}
                  className="szn-btn-ghost px-5 py-3 text-sm"
                >
                  {copy.secondaryCta}
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-szn-border-subtle">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-semibold text-szn-text-1 md:text-4xl">{copy.tableTitle}</h2>
              <p className="mt-4 text-lg leading-8 text-szn-text-2">{copy.tableSubtitle}</p>
            </div>

            <div className="mt-10 overflow-x-auto rounded-xl border border-szn-border-subtle">
              <table className="min-w-full border-collapse">
                <thead className="bg-szn-surface-1">
                  <tr>
                    <th className="px-4 py-4 text-left text-sm font-medium text-szn-text-2">Feature</th>
                    <th className="bg-szn-signal-soft px-4 py-4 text-left text-sm font-medium text-szn-text-1">Seizn alone</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-szn-text-2">Seizn + Inworld</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-szn-text-2">Seizn + Convai</th>
                    <th className="px-4 py-4 text-left text-sm font-medium text-szn-text-2">Seizn + ACE</th>
                  </tr>
                </thead>
                <tbody>
                  {copy.rows.map((row) => (
                    <tr key={row.feature} className="border-t border-szn-border-subtle">
                      <th className="px-4 py-4 text-left text-sm font-medium text-szn-text-1">{row.feature}</th>
                      <td className="bg-szn-signal-soft px-4 py-4 text-sm leading-6 text-szn-text-1">{row.seizn}</td>
                      <td className="px-4 py-4 text-sm leading-6 text-szn-text-2">{row.inworld}</td>
                      <td className="px-4 py-4 text-sm leading-6 text-szn-text-2">{row.convai}</td>
                      <td className="px-4 py-4 text-sm leading-6 text-szn-text-2">{row.ace}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="border-b border-szn-border-subtle">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-semibold text-szn-text-1 md:text-4xl">{copy.principlesTitle}</h2>
              <p className="mt-4 text-lg leading-8 text-szn-text-2">{copy.principlesSubtitle}</p>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {copy.principles.map((item) => (
                <div key={item.title} className="rounded-xl border border-szn-border-subtle bg-szn-surface-1 px-5 py-5">
                  <h3 className="text-lg font-semibold text-szn-text-1">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-szn-text-2">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <h2 className="text-3xl font-semibold text-szn-text-1 md:text-4xl">{copy.finalCtaTitle}</h2>
                <p className="mt-4 text-lg leading-8 text-szn-text-2">{copy.finalCtaSubtitle}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/${locale}/pricing`}
                  className="szn-btn-ghost px-5 py-3 text-sm"
                >
                  {copy.finalPrimary}
                </Link>
                <Link
                  href={`/${locale}/enterprise`}
                  className="szn-btn-glass px-5 py-3 text-sm"
                >
                  {copy.finalSecondary}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default ComparisonClient;
