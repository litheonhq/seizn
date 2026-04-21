"use client";

import { useState } from "react";
import Link from "next/link";
import type { Locale } from "@/i18n/config";

type SupportChannel = {
  title: string;
  body: string;
  href: string;
  action: string;
  external?: boolean;
};

type ResourceLink = {
  title: string;
  body: string;
  href: string;
};

type Faq = {
  id: string;
  question: string;
  answer: string;
};

type Copy = {
  title: string;
  subtitle: string;
  searchPlaceholder: string;
  noResults: string;
  supportTitle: string;
  supportBody: string;
  supportChannels: SupportChannel[];
  resourceTitle: string;
  resourceBody: string;
  resources: ResourceLink[];
  faqTitle: string;
  faqBody: string;
  faqs: Faq[];
  contactTitle: string;
  contactBody: string;
  contactCta: string;
};

const COPY_EN: Copy = {
  title: "Answers for teams shipping NPC memory",
  subtitle:
    "Use this hub when design, narrative, and engineering need the same answer about persistent characters, faction continuity, context budgets, and rollout cost.",
  searchPlaceholder: "Search studio help",
  noResults: "No matching answer yet.",
  supportTitle: "Support for live evaluations",
  supportBody:
    "Send your NPC count, dialogue stack, and launch window. We can usually route the right docs or answer the architecture question in one pass.",
  supportChannels: [
    {
      title: "Studio support",
      body: "Use this when you need rollout advice, pricing guidance, or help mapping Seizn onto your existing dialogue runtime.",
      href: "mailto:support@seizn.com",
      action: "support@seizn.com",
    },
    {
      title: "Status page",
      body: "Check incident history before a playtest, milestone review, or production cutover.",
      href: "/status",
      action: "Open status",
    },
    {
      title: "GitHub issues",
      body: "Report SDK or API bugs with a repro and the endpoint or engine wrapper involved.",
      href: "https://github.com/litheonhq/seizn/issues",
      action: "Open issues",
      external: true,
    },
  ],
  resourceTitle: "Common starting points",
  resourceBody:
    "These links cover the questions that usually unblock a first playable or an internal dialogue prototype.",
  resources: [
    {
      title: "Quickstart",
      body: "Create an entity, extract a witnessed event, and retrieve the next-turn context.",
      href: "/docs/quickstart",
    },
    {
      title: "Integrations",
      body: "Unity, Unreal, Godot, raw HTTP, Python, and JavaScript examples for the same NPC memory loop.",
      href: "/docs/integrations",
    },
    {
      title: "API reference",
      body: "Exact request shapes for entities, extraction, context retrieval, and graph traversal.",
      href: "/docs/api-reference",
    },
    {
      title: "Pricing",
      body: "Per-entity pricing for Free, Studio, and Enterprise planning.",
      href: "/pricing",
    },
    {
      title: "Limits",
      body: "Context budget, retrieval knobs, and guardrails you will want before load testing.",
      href: "/docs/limits",
    },
    {
      title: "Security",
      body: "Hosting posture, key handling, and the questions security review tends to ask first.",
      href: "/docs/security",
    },
  ],
  faqTitle: "Game-studio FAQ",
  faqBody:
    "These are the questions that usually come up once teams move past demos and start wiring persistent memory into quests, factions, and live content.",
  faqs: [
    {
      id: "faction",
      question: "How do I model a faction that outlives its founding members?",
      answer:
        "Create the faction as its own entity and attach founders, officers, territories, and alliances as relations around it. When characters die, transfer, or disappear, update those member relations instead of recreating the faction. The faction node becomes the stable anchor that survives roster churn.",
    },
    {
      id: "observation-vs-relation",
      question: "What's the difference between an observation and a relation?",
      answer:
        "Use an observation for a witnessed or time-bound fact, such as Mira seeing the player leave the old gate at dusk. Use a relation for durable structure, such as Mira working for the Gate Watch or distrusting smugglers. Observations can update relations later, but they should not replace them.",
    },
    {
      id: "reset-memory",
      question: "How do I reset an NPC's memory without losing their relations?",
      answer:
        "Keep the NPC entity and stable relations, then prune or expire the observation and event layer you no longer want to surface. That lets you clear what the character remembers right now without breaking quest references, faction links, or other graph pointers that still need to survive.",
    },
    {
      id: "pricing-10k",
      question: "What does Seizn cost at 10k NPCs?",
      answer:
        "Model it from active entities, extraction volume, and how often you retrieve context during play. At 10k NPCs, teams usually need to compare prototype pacing against live-ops pacing, then choose between Studio and Enterprise based on retention, support, and batching needs. The pricing page gives the baseline; support can help map the real workload.",
    },
    {
      id: "context-budget",
      question: "How do I stop retrieval from flooding the prompt with too much lore?",
      answer:
        "Treat retrieval like a budget, not a dump. Start with a small `max_entities`, keep graph depth tight, and ask the query from the NPC's point of view. That keeps the returned context grounded in what the speaker should know instead of every related fact in the world graph.",
    },
    {
      id: "server-authority",
      question: "Should Unity or Unreal call Seizn directly?",
      answer:
        "For prototypes, direct calls can be enough. For production, most teams keep writes and privileged reads on a server-authoritative layer, then pass only the filtered dialogue context back into the client runtime. That gives you safer key handling, better rate control, and cleaner logging.",
    },
  ],
  contactTitle: "Need an answer tied to your stack?",
  contactBody:
    "Send the engine, expected NPC count, and what a single dialogue turn needs to remember. That is usually enough to turn a vague question into an actionable rollout answer.",
  contactCta: "Contact support",
};

const COPY_KO: Copy = {
  title: "NPC 메모리를 출시하는 팀을 위한 답변",
  subtitle:
    "디자인, 내러티브, 엔지니어링이 persistent character, faction continuity, context budget, rollout cost 같은 질문에 같은 답을 가져가야 할 때 이 허브를 쓰면 됩니다.",
  searchPlaceholder: "게임 스튜디오 도움말 검색",
  noResults: "일치하는 답변이 아직 없습니다.",
  supportTitle: "실서비스 검토를 위한 지원 채널",
  supportBody:
    "NPC 수, 대화 스택, 목표 출시 시점을 함께 보내면 문서를 바로 연결하거나 아키텍처 질문에 맞는 답을 한 번에 정리할 수 있습니다.",
  supportChannels: [
    {
      title: "Studio support",
      body: "도입 구조, 가격 검토, 기존 대화 런타임에 Seizn을 붙이는 방식이 필요할 때 여기로 보내면 됩니다.",
      href: "mailto:support@seizn.com",
      action: "support@seizn.com",
    },
    {
      title: "Status page",
      body: "플레이테스트, 마일스톤 리뷰, 프로덕션 전환 전에 상태 이력을 확인할 수 있습니다.",
      href: "/status",
      action: "상태 보기",
    },
    {
      title: "GitHub issues",
      body: "SDK 또는 API 버그는 repro와 함께, 어떤 엔드포인트나 엔진 래퍼가 관련됐는지 적어서 남기면 됩니다.",
      href: "https://github.com/litheonhq/seizn/issues",
      action: "이슈 열기",
      external: true,
    },
  ],
  resourceTitle: "가장 많이 여는 시작점",
  resourceBody:
    "첫 플레이어블이나 내부 대화 프로토타입을 막는 질문은 대체로 아래 링크에서 바로 풀립니다.",
  resources: [
    {
      title: "Quickstart",
      body: "엔티티를 만들고, witness 이벤트를 추출하고, 다음 턴 컨텍스트를 회수하는 기본 흐름입니다.",
      href: "/docs/quickstart",
    },
    {
      title: "Integrations",
      body: "Unity, Unreal, Godot, raw HTTP, Python, JavaScript에서 같은 NPC 메모리 루프를 보여줍니다.",
      href: "/docs/integrations",
    },
    {
      title: "API reference",
      body: "entity, extraction, context retrieval, graph traversal에 필요한 정확한 request shape를 확인할 수 있습니다.",
      href: "/docs/api-reference",
    },
    {
      title: "Pricing",
      body: "Free, Studio, Enterprise 기준의 per-entity 가격 구조입니다.",
      href: "/pricing",
    },
    {
      title: "Limits",
      body: "로드 테스트 전에 확인해야 할 context budget, retrieval knob, guardrail을 정리합니다.",
      href: "/docs/limits",
    },
    {
      title: "Security",
      body: "호스팅 posture, 키 처리, 보안 리뷰가 먼저 묻는 질문을 다룹니다.",
      href: "/docs/security",
    },
  ],
  faqTitle: "게임 스튜디오 FAQ",
  faqBody:
    "데모 단계를 지나 퀘스트, faction, live content에 persistent memory를 붙이기 시작하면 보통 여기 있는 질문들이 먼저 나옵니다.",
  faqs: [
    {
      id: "faction",
      question: "창립 멤버가 바뀌어도 계속 남는 faction은 어떻게 모델링하나요?",
      answer:
        "faction 자체를 하나의 독립 엔티티로 만들고, 창립자, 간부, 영토, 동맹을 그 주변 relation으로 붙이면 됩니다. 캐릭터가 죽거나 이동하거나 사라져도 faction을 다시 만들지 말고 멤버 relation만 갱신하세요. faction 노드가 roster churn을 견디는 안정 축이 됩니다.",
    },
    {
      id: "observation-vs-relation",
      question: "observation과 relation의 차이는 무엇인가요?",
      answer:
        "observation은 Mira가 해질녘 old gate에서 플레이어를 봤다는 식의 목격 사실이나 시간성 있는 정보를 담는 데 쓰고, relation은 Mira가 Gate Watch 소속이라거나 밀수업자를 불신한다는 식의 지속 구조를 담는 데 씁니다. observation이 나중에 relation을 바꿀 수는 있어도 둘을 같은 객체로 취급하면 안 됩니다.",
    },
    {
      id: "reset-memory",
      question: "relation은 유지한 채 NPC 기억만 초기화하려면 어떻게 하나요?",
      answer:
        "NPC 엔티티와 안정적인 relation은 그대로 두고, 지금 드러나지 않게 만들고 싶은 observation 및 event 레이어만 prune하거나 expire하면 됩니다. 이렇게 하면 퀘스트 참조나 faction 연결은 유지하면서도 캐릭터가 현재 무엇을 기억하는지는 새로 쌓을 수 있습니다.",
    },
    {
      id: "pricing-10k",
      question: "NPC 1만 명 규모에서는 비용을 어떻게 봐야 하나요?",
      answer:
        "활성 엔티티 수, extraction 볼륨, 플레이 중 context retrieval 빈도로 계산해야 합니다. NPC 1만 명 규모에서는 프로토타입 페이스와 live-ops 페이스가 얼마나 다른지 먼저 보고, retention, 지원 범위, batching 요구에 따라 Studio와 Enterprise를 가르는 경우가 많습니다. 기준선은 pricing 페이지에서 보고, 실제 워크로드는 support와 같이 맞추면 됩니다.",
    },
    {
      id: "context-budget",
      question: "retrieval이 lore를 너무 많이 끌어와 프롬프트가 넘치는 문제는 어떻게 막나요?",
      answer:
        "retrieval을 dump가 아니라 budget으로 다루면 됩니다. `max_entities`를 작게 시작하고, graph depth를 낮게 묶고, query를 NPC 시점으로 쓰세요. 그러면 세계 그래프의 모든 관련 정보를 긁는 대신 화자가 실제로 알아야 할 범위만 돌아옵니다.",
    },
    {
      id: "server-authority",
      question: "Unity나 Unreal에서 Seizn을 직접 호출해도 되나요?",
      answer:
        "프로토타입 단계라면 직접 호출로도 충분할 수 있습니다. 프로덕션에서는 대부분 write와 privileged read를 서버 권한 레이어에 두고, 필터된 dialogue context만 클라이언트 런타임으로 넘깁니다. 키 처리, rate 제어, 로그 추적이 훨씬 깔끔해집니다.",
    },
  ],
  contactTitle: "지금 쓰는 스택 기준으로 답이 필요하신가요?",
  contactBody:
    "엔진, 예상 NPC 수, 그리고 대화 한 턴이 무엇을 기억해야 하는지만 보내면 보통 바로 실행 가능한 도입 답으로 바꿀 수 있습니다.",
  contactCta: "지원팀에 연락",
};

function getCopy(locale: Locale): Copy {
  return locale === "ko" ? COPY_KO : COPY_EN;
}

function ArrowIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function HelpClient({ locale }: { locale: Locale }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const copy = getCopy(locale);

  const filteredFaqs = copy.faqs.filter((faq) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;

    return (
      faq.question.toLowerCase().includes(query) ||
      faq.answer.toLowerCase().includes(query)
    );
  });

  return (
    <div className="min-h-screen bg-[#08111f] text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#08111f]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href={`/${locale}`} className="text-xl font-semibold text-white">
              Seizn
            </Link>
            <span className="text-slate-500">/</span>
            <Link href={`/${locale}/docs`} className="text-slate-300 transition-colors hover:text-white">
              Docs
            </Link>
            <span className="text-slate-500">/</span>
            <span className="text-white">Help</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link href={`/${locale}/pricing`} className="hidden text-slate-300 transition-colors hover:text-white md:block">
              Pricing
            </Link>
            <Link
              href={`/${locale}/docs/integrations`}
              className="rounded-md bg-cyan-400 px-4 py-2 text-sm font-medium text-[#08111f] transition-colors hover:bg-cyan-300"
            >
              Integrations
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <section className="border-b border-white/10 pb-12">
          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white md:text-5xl">
            {copy.title}
          </h1>
          <p className="mt-5 max-w-4xl text-xl leading-8 text-slate-300">{copy.subtitle}</p>

          <div className="mt-8 max-w-3xl">
            <label className="sr-only" htmlFor="help-search">
              Search help
            </label>
            <input
              id="help-search"
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
              className="w-full rounded-md border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none transition-colors placeholder:text-slate-500 focus:border-cyan-400"
            />
          </div>
        </section>

        <section className="border-b border-white/10 py-12">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-semibold text-white">{copy.supportTitle}</h2>
            <p className="mt-4 text-lg leading-8 text-slate-300">{copy.supportBody}</p>
          </div>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {copy.supportChannels.map((channel) => {
              const href = channel.external ? channel.href : `${channel.href}`;
              const content = (
                <div className="flex h-full flex-col justify-between border border-white/10 bg-white/5 px-5 py-5">
                  <div>
                    <h3 className="text-xl font-semibold text-white">{channel.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-300">{channel.body}</p>
                  </div>
                  <div className="mt-6 flex items-center gap-2 text-sm font-medium text-cyan-300">
                    <span>{channel.action}</span>
                    <ArrowIcon />
                  </div>
                </div>
              );

              if (channel.external || channel.href.startsWith("mailto:")) {
                return (
                  <a
                    key={channel.title}
                    href={href}
                    target={channel.external ? "_blank" : undefined}
                    rel={channel.external ? "noreferrer" : undefined}
                    className="block"
                  >
                    {content}
                  </a>
                );
              }

              return (
                <Link key={channel.title} href={channel.href} className="block">
                  {content}
                </Link>
              );
            })}
          </div>
        </section>

        <section className="border-b border-white/10 py-12">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-semibold text-white">{copy.resourceTitle}</h2>
            <p className="mt-4 text-lg leading-8 text-slate-300">{copy.resourceBody}</p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {copy.resources.map((resource) => (
              <Link
                key={resource.title}
                href={`/${locale}${resource.href}`}
                className="block border border-white/10 bg-white/5 px-5 py-5 transition-colors hover:border-white/20 hover:bg-white/[0.07]"
              >
                <h3 className="text-xl font-semibold text-white">{resource.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-300">{resource.body}</p>
                <div className="mt-6 flex items-center gap-2 text-sm font-medium text-cyan-300">
                  <span>Open</span>
                  <ArrowIcon />
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="py-12">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-semibold text-white">{copy.faqTitle}</h2>
            <p className="mt-4 text-lg leading-8 text-slate-300">{copy.faqBody}</p>
          </div>

          {filteredFaqs.length === 0 ? (
            <div className="mt-8 border border-dashed border-white/15 px-5 py-8 text-slate-300">
              {copy.noResults}
            </div>
          ) : (
            <div className="mt-8 divide-y divide-white/10 border border-white/10">
              {filteredFaqs.map((faq) => {
                const isOpen = expandedFaq === faq.id;

                return (
                  <div key={faq.id} className="bg-white/5">
                    <button
                      type="button"
                      onClick={() => setExpandedFaq(isOpen ? null : faq.id)}
                      className="flex w-full items-center justify-between gap-6 px-5 py-5 text-left"
                    >
                      <span className="text-lg font-medium leading-8 text-white">{faq.question}</span>
                      <svg
                        className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {isOpen ? (
                      <div className="border-t border-white/10 px-5 py-5 text-base leading-8 text-slate-300">
                        {faq.answer}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="border-t border-white/10 py-12">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-semibold text-white">{copy.contactTitle}</h2>
              <p className="mt-4 text-lg leading-8 text-slate-300">{copy.contactBody}</p>
            </div>
            <a
              href="mailto:support@seizn.com"
              className="inline-flex items-center gap-2 rounded-md bg-cyan-400 px-5 py-3 text-sm font-medium text-[#08111f] transition-colors hover:bg-cyan-300"
            >
              <span>{copy.contactCta}</span>
              <ArrowIcon />
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-slate-400 md:flex-row">
          <div>{new Date().getFullYear()} Seizn</div>
          <nav className="flex flex-wrap items-center justify-center gap-5" aria-label="Footer navigation">
            <Link href={`/${locale}/sla`} className="transition-colors hover:text-white">
              SLA
            </Link>
            <Link href={`/${locale}/status`} className="transition-colors hover:text-white">
              Status
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
