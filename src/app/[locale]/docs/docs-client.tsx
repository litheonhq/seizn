"use client";

import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { DocsSearch } from "@/components/docs/DocsSearch";
import { LanguageSwitcher } from "@/components/language-switcher";

type Dictionary = Record<string, unknown>;

interface Props {
  locale: Locale;
  dictionary: Dictionary;
}

type Group = {
  title: string;
  links: { label: string; href: string }[];
};

type Card = {
  title: string;
  body: string;
  href: string;
  cta: string;
};

type Copy = {
  heroTitle: string;
  heroSubtitle: string;
  heroBody: string;
  quickstartTitle: string;
  quickstartSubtitle: string;
  quickstartCode: string;
  groups: Group[];
  sections: {
    entities: {
      title: string;
      body: string;
      cards: Card[];
    };
    events: {
      title: string;
      body: string;
      cards: Card[];
    };
    retrieval: {
      title: string;
      body: string;
      cards: Card[];
    };
    plugins: {
      title: string;
      body: string;
      cards: Card[];
    };
    api: {
      title: string;
      body: string;
      cards: Card[];
    };
  };
};

function getNestedValue(obj: unknown, path: string): string | undefined {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "string" ? current : undefined;
}

function interpolate(str: string, params?: Record<string, string | number>): string {
  if (!params) return str;

  return str.replace(/\{(\w+)\}/g, (_, key) => {
    return params[key]?.toString() ?? `{${key}}`;
  });
}

const COPY_EN: Copy = {
  heroTitle: "Docs for shipping AI NPC memory",
  heroSubtitle:
    "Start with an NPC retrieval call, then branch into entities, events, context budgets, and engine plugins.",
  heroBody:
    "The docs are organized around the memory graph behind your game. Keep your dialogue engine. Use Seizn for persistent entities, relations, witness logs, and next-turn recall.",
  quickstartTitle: "Quickstart: create an NPC, log an event, retrieve context",
  quickstartSubtitle:
    "This is the shortest path from a new graph to a memory-aware NPC turn using the public graph API.",
  quickstartCode: `curl -X POST https://seizn.com/api/v1/graph/$GRAPH_ID/entities \\
  -H "Authorization: Bearer $SEIZN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"character","name":"Mira","external_id":"npc_mira"}'

curl -X POST https://seizn.com/api/v1/graph/$GRAPH_ID/extract \\
  -H "Authorization: Bearer $SEIZN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"text":"Mira saw the player leave the old gate at dusk."}'

curl -X POST https://seizn.com/api/v1/graph/$GRAPH_ID/context \\
  -H "Authorization: Bearer $SEIZN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"query":"What does Mira know about the player right now?","max_entities":8,"max_depth":2}'`,
  groups: [
    {
      title: "Getting started",
      links: [
        { label: "Quickstart", href: "/docs/quickstart" },
        { label: "Authentication", href: "/docs/auth" },
      ],
    },
    {
      title: "NPC entities + relations",
      links: [
        { label: "Entity model", href: "#entities-relations" },
        { label: "Tutorial", href: "/docs/tutorial" },
      ],
    },
    {
      title: "Events + witnesses",
      links: [
        { label: "Event ingestion", href: "#events-witnesses" },
        { label: "API reference", href: "/docs/api-reference" },
      ],
    },
    {
      title: "Retrieval + context budgets",
      links: [
        { label: "Retrieval flow", href: "#retrieval-budgets" },
        { label: "Limits", href: "/docs/limits" },
      ],
    },
    {
      title: "Engine plugins",
      links: [
        { label: "Unity / Unreal / Godot", href: "#engine-plugins" },
        { label: "Integrations hub", href: "/docs/integrations" },
        { label: "MCP server", href: "/docs/mcp" },
      ],
    },
    {
      title: "API reference",
      links: [
        { label: "Reference", href: "#api-reference" },
        { label: "Errors", href: "/docs/errors" },
      ],
    },
  ],
  sections: {
    entities: {
      title: "NPC entities + relations",
      body: "Model the graph the way narrative design already thinks: characters, factions, households, locations, and the relations that connect them.",
      cards: [
        {
          title: "Entities",
          body: "Use graph entities for NPCs, factions, locations, quest objects, and anything that should be recallable across turns.",
          href: "/docs/tutorial",
          cta: "Read tutorial",
        },
        {
          title: "Relations",
          body: "Store kinship, faction allegiance, witness links, and social state in the graph instead of rebuilding them in prompt text.",
          href: "/docs/api-reference",
          cta: "Open API reference",
        },
      ],
    },
    events: {
      title: "Events + witnesses",
      body: "Log world changes once, then let Seizn extract entities and relationships from those event traces.",
      cards: [
        {
          title: "Event ingestion",
          body: "POST raw narrative text or simulation output to extraction endpoints and turn it into graph updates.",
          href: "/docs/api-reference",
          cta: "See event endpoints",
        },
        {
          title: "Witness chains",
          body: "Track which NPC saw, heard, or inherited an event so recall can diverge by perspective instead of flattening into one canon blob.",
          href: "/docs/tutorial",
          cta: "See modeling guide",
        },
      ],
    },
    retrieval: {
      title: "Retrieval + context budgets",
      body: "Retrieve the smallest graph slice that explains the next turn: relevant entities, their relations, and the recent event chain.",
      cards: [
        {
          title: "Context building",
          body: "Use graph context endpoints to limit recall by max entities, depth, and relationship inclusion before a turn is generated.",
          href: "/docs/api-reference",
          cta: "Inspect context API",
        },
        {
          title: "Budgeting",
          body: "Tune retrieval depth and entity count to keep context tight for both low-cost NPC loops and larger studio deployments.",
          href: "/docs/limits",
          cta: "Check limits",
        },
      ],
    },
    plugins: {
      title: "Engine plugins",
      body: "The plugin story starts the same way in every engine: create the NPC node, log the event, ask for recall on the next turn.",
      cards: [
        {
          title: "Unity, Unreal, Godot",
          body: "The integrations hub is where engine-specific setup will live. Use it when you are wiring the memory call into a real game loop.",
          href: "/docs/integrations",
          cta: "Open integrations hub",
        },
        {
          title: "Raw HTTP, Python, JavaScript",
          body: "If you are still proving the loop, start from thin wrappers and keep the memory call explicit before moving into engine plugins.",
          href: "/docs/integrations",
          cta: "See integration paths",
        },
      ],
    },
    api: {
      title: "API reference",
      body: "When you need exact request shapes, limits, auth, and failure modes, jump out of the hub and into the reference pages.",
      cards: [
        {
          title: "Reference",
          body: "Graph entities, extraction, context building, and auth details.",
          href: "/docs/api-reference",
          cta: "Open reference",
        },
        {
          title: "Errors, limits, security",
          body: "Plan for bad requests, auth failures, throughput limits, and deployment constraints before launch.",
          href: "/docs/errors",
          cta: "Review failure modes",
        },
      ],
    },
  },
};

const COPY_KO: Copy = {
  heroTitle: "AI NPC 메모리를 출하하기 위한 문서 허브",
  heroSubtitle:
    "NPC retrieval 호출에서 시작하고, 엔티티, 이벤트, context budget, 엔진 플러그인 순으로 내려가면 됩니다.",
  heroBody:
    "문서는 게임 뒤의 메모리 그래프 기준으로 정리했습니다. 대화 엔진은 그대로 두고, Seizn은 지속 엔티티, 관계, witness 로그, 다음 턴 회수를 맡습니다.",
  quickstartTitle: "Quickstart: NPC 생성, 이벤트 기록, 컨텍스트 회수",
  quickstartSubtitle:
    "새 그래프에서 메모리 인지형 NPC 턴까지 가는 가장 짧은 경로입니다. 공개 graph API만 사용합니다.",
  quickstartCode: `curl -X POST https://seizn.com/api/v1/graph/$GRAPH_ID/entities \\
  -H "Authorization: Bearer $SEIZN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"character","name":"Mira","external_id":"npc_mira"}'

curl -X POST https://seizn.com/api/v1/graph/$GRAPH_ID/extract \\
  -H "Authorization: Bearer $SEIZN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"text":"Mira saw the player leave the old gate at dusk."}'

curl -X POST https://seizn.com/api/v1/graph/$GRAPH_ID/context \\
  -H "Authorization: Bearer $SEIZN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"query":"What does Mira know about the player right now?","max_entities":8,"max_depth":2}'`,
  groups: [
    {
      title: "시작하기",
      links: [
        { label: "Quickstart", href: "/docs/quickstart" },
        { label: "인증", href: "/docs/auth" },
      ],
    },
    {
      title: "NPC 엔티티 + 관계",
      links: [
        { label: "엔티티 모델", href: "#entities-relations" },
        { label: "튜토리얼", href: "/docs/tutorial" },
      ],
    },
    {
      title: "이벤트 + witness",
      links: [
        { label: "이벤트 수집", href: "#events-witnesses" },
        { label: "API reference", href: "/docs/api-reference" },
      ],
    },
    {
      title: "회수 + context budget",
      links: [
        { label: "회수 흐름", href: "#retrieval-budgets" },
        { label: "한도", href: "/docs/limits" },
      ],
    },
    {
      title: "엔진 플러그인",
      links: [
        { label: "Unity / Unreal / Godot", href: "#engine-plugins" },
        { label: "통합 허브", href: "/docs/integrations" },
        { label: "MCP 서버", href: "/docs/mcp" },
      ],
    },
    {
      title: "API reference",
      links: [
        { label: "레퍼런스", href: "#api-reference" },
        { label: "에러", href: "/docs/errors" },
      ],
    },
  ],
  sections: {
    entities: {
      title: "NPC 엔티티 + 관계",
      body: "서사 설계가 이미 생각하는 방식대로 그래프를 모델링합니다. 캐릭터, 팩션, 가문, 장소, 그리고 이를 잇는 관계를 노드와 엣지로 둡니다.",
      cards: [
        {
          title: "엔티티",
          body: "NPC, 팩션, 장소, 퀘스트 오브젝트처럼 턴을 넘어 다시 꺼내야 하는 대상을 graph entity로 둡니다.",
          href: "/docs/tutorial",
          cta: "튜토리얼 보기",
        },
        {
          title: "관계",
          body: "혈연, 팩션 소속, witness link, 사회적 상태를 프롬프트 텍스트 대신 그래프에 유지합니다.",
          href: "/docs/api-reference",
          cta: "API reference 열기",
        },
      ],
    },
    events: {
      title: "이벤트 + witness",
      body: "월드 변화를 한 번만 기록하고, Seizn이 그 이벤트에서 엔티티와 관계를 추출해 그래프를 갱신하도록 둡니다.",
      cards: [
        {
          title: "이벤트 수집",
          body: "서사 텍스트나 시뮬레이션 출력물을 extraction endpoint에 보내 그래프 갱신으로 전환합니다.",
          href: "/docs/api-reference",
          cta: "이벤트 엔드포인트 보기",
        },
        {
          title: "Witness chain",
          body: "누가 보고, 듣고, 전해 들었는지를 추적해 시점별로 다른 회수가 가능하도록 만듭니다.",
          href: "/docs/tutorial",
          cta: "모델링 가이드 보기",
        },
      ],
    },
    retrieval: {
      title: "회수 + context budget",
      body: "다음 턴을 설명하는 최소 그래프 조각만 가져옵니다. 관련 엔티티, 그 관계, 최근 이벤트 체인만 회수합니다.",
      cards: [
        {
          title: "컨텍스트 구성",
          body: "응답 생성 전 max entities, depth, 관계 포함 여부로 recall을 제한하는 graph context endpoint를 사용합니다.",
          href: "/docs/api-reference",
          cta: "컨텍스트 API 보기",
        },
        {
          title: "예산 조정",
          body: "저비용 NPC 루프부터 더 큰 스튜디오 배포까지, retrieval depth와 entity count를 맞춰 context를 타이트하게 유지합니다.",
          href: "/docs/limits",
          cta: "한도 확인",
        },
      ],
    },
    plugins: {
      title: "엔진 플러그인",
      body: "엔진이 달라도 출발점은 같습니다. NPC 노드를 만들고, 이벤트를 기록하고, 다음 턴에 recall을 요청합니다.",
      cards: [
        {
          title: "Unity, Unreal, Godot",
          body: "엔진별 설정은 통합 허브에 모입니다. 실제 게임 루프에 메모리 호출을 연결할 때 여기서 시작합니다.",
          href: "/docs/integrations",
          cta: "통합 허브 열기",
        },
        {
          title: "Raw HTTP, Python, JavaScript",
          body: "아직 루프를 증명하는 단계라면 얇은 래퍼로 시작하고, 그다음 엔진 플러그인으로 올리면 됩니다.",
          href: "/docs/integrations",
          cta: "통합 경로 보기",
        },
      ],
    },
    api: {
      title: "API reference",
      body: "정확한 요청 형식, 인증, 한도, 실패 모드를 확인해야 할 때는 허브에서 reference 페이지로 바로 이동하면 됩니다.",
      cards: [
        {
          title: "레퍼런스",
          body: "Graph entities, extraction, context building, auth 정보를 확인합니다.",
          href: "/docs/api-reference",
          cta: "레퍼런스 열기",
        },
        {
          title: "에러, 한도, 보안",
          body: "런칭 전에 bad request, auth 실패, 처리량 한도, 배포 제약을 점검합니다.",
          href: "/docs/errors",
          cta: "실패 모드 보기",
        },
      ],
    },
  },
};

function getCopy(locale: Locale): Copy {
  if (locale === "ko") return COPY_KO;
  return COPY_EN;
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto border border-white/10 bg-[#08111f] p-4 text-sm leading-7 text-slate-200">
      <code>{code}</code>
    </pre>
  );
}

function SectionCards({ locale, cards }: { locale: Locale; cards: Card[] }) {
  return (
    <div className="mt-8 grid gap-4 md:grid-cols-2">
      {cards.map((card) => (
        <div key={card.title} className="border border-white/10 bg-white/5 px-5 py-5">
          <h3 className="text-lg font-semibold text-white">{card.title}</h3>
          <p className="mt-3 text-sm leading-7 text-slate-300">{card.body}</p>
          <Link
            href={`/${locale}${card.href}`}
            className="mt-5 inline-flex rounded-md border border-white/15 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-white/25 hover:bg-white/5"
          >
            {card.cta}
          </Link>
        </div>
      ))}
    </div>
  );
}

export function LocaleDocsClient({ locale, dictionary }: Props) {
  const currentYear = new Date().getFullYear();
  const copy = getCopy(locale);

  const t = (key: string, params?: Record<string, string | number>): string => {
    const value = getNestedValue(dictionary, key);
    if (!value) return key;
    return interpolate(value, params);
  };

  return (
    <div className="min-h-screen bg-[#08111f] text-white">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#08111f]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href={`/${locale}`} className="text-xl font-semibold text-white">
            Seizn
          </Link>
          <div className="flex flex-1 justify-center px-4">
            <DocsSearch
              locale={locale}
              translations={{
                placeholder: t("docs.search.placeholder"),
                buttonText: t("docs.search.buttonText"),
                noResults: t("docs.search.noResults"),
                hint: t("docs.search.hint"),
                navigate: t("docs.search.navigate"),
                select: t("docs.search.select"),
              }}
            />
          </div>
          <nav className="flex items-center gap-4">
            <LanguageSwitcher currentLocale={locale} />
            <Link href="/dashboard" className="hidden text-slate-300 transition-colors hover:text-white md:block">
              {t("docs.nav.dashboard")}
            </Link>
            <Link
              href="/login"
              className="rounded-md bg-cyan-400 px-4 py-2 text-sm font-medium text-[#08111f] transition-colors hover:bg-cyan-300"
            >
              {t("docs.nav.getStarted")}
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl gap-12 px-6 py-12">
        <nav className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-24 space-y-6">
            {copy.groups.map((group) => (
              <div key={group.title}>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{group.title}</p>
                <div className="space-y-2">
                  {group.links.map((link) =>
                    link.href.startsWith("#") ? (
                      <a key={link.label} href={link.href} className="block text-sm text-slate-300 transition-colors hover:text-white">
                        {link.label}
                      </a>
                    ) : (
                      <Link key={link.label} href={`/${locale}${link.href}`} className="block text-sm text-slate-300 transition-colors hover:text-white">
                        {link.label}
                      </Link>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="min-w-0 flex-1">
          <section className="border-b border-white/10 pb-12">
            <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">{copy.heroTitle}</h1>
            <p className="mt-5 max-w-3xl text-xl leading-8 text-slate-300">{copy.heroSubtitle}</p>
            <p className="mt-4 max-w-3xl text-base leading-8 text-slate-400">{copy.heroBody}</p>
          </section>

          <section id="getting-started" className="border-b border-white/10 py-12">
            <h2 className="text-3xl font-semibold text-white">{copy.quickstartTitle}</h2>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">{copy.quickstartSubtitle}</p>
            <div className="mt-8">
              <CodeBlock code={copy.quickstartCode} />
            </div>
          </section>

          <section id="entities-relations" className="border-b border-white/10 py-12">
            <h2 className="text-3xl font-semibold text-white">{copy.sections.entities.title}</h2>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">{copy.sections.entities.body}</p>
            <SectionCards locale={locale} cards={copy.sections.entities.cards} />
          </section>

          <section id="events-witnesses" className="border-b border-white/10 py-12">
            <h2 className="text-3xl font-semibold text-white">{copy.sections.events.title}</h2>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">{copy.sections.events.body}</p>
            <SectionCards locale={locale} cards={copy.sections.events.cards} />
          </section>

          <section id="retrieval-budgets" className="border-b border-white/10 py-12">
            <h2 className="text-3xl font-semibold text-white">{copy.sections.retrieval.title}</h2>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">{copy.sections.retrieval.body}</p>
            <SectionCards locale={locale} cards={copy.sections.retrieval.cards} />
          </section>

          <section id="engine-plugins" className="border-b border-white/10 py-12">
            <h2 className="text-3xl font-semibold text-white">{copy.sections.plugins.title}</h2>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">{copy.sections.plugins.body}</p>
            <SectionCards locale={locale} cards={copy.sections.plugins.cards} />
          </section>

          <section id="api-reference" className="py-12">
            <h2 className="text-3xl font-semibold text-white">{copy.sections.api.title}</h2>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">{copy.sections.api.body}</p>
            <SectionCards locale={locale} cards={copy.sections.api.cards} />
          </section>
        </div>
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-10 md:flex-row md:items-center md:justify-between">
          <Link href={`/${locale}`} className="text-sm font-medium text-white">
            Seizn
          </Link>
          <div className="text-sm text-slate-400">{t("footer.copyright", { year: currentYear })}</div>
          <nav className="flex flex-wrap items-center gap-5">
            <Link href={`/${locale}/privacy`} className="text-sm text-slate-400 transition-colors hover:text-white">
              {t("footer.privacy")}
            </Link>
            <Link href={`/${locale}/terms`} className="text-sm text-slate-400 transition-colors hover:text-white">
              {t("footer.terms")}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
