import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import {
  getArray,
  getNestedString,
  getNumber,
  getString,
  type SaebyeokDemoData,
} from "@/lib/sample-ip-demo";

const COPY = {
  en: {
    label: "Sample IP — Synthetic Demo Data",
    title: "Saebyeok Academy demo",
    subtitle: "A read-only walkthrough of the same Author Memory v3 surfaces used in production: inbox, review, characters, graph, timeline, and scene simulation.",
    note: "Demo data is synthetic and designed for Seizn. Not affiliated with any author or studio.",
    unavailableTitle: "Sample data temporarily unavailable",
    unavailableBody: "Some source files could not be read, so this demo is showing the available data only.",
    cta: "View pricing",
    source: "Source snapshot",
    screens: ["Intro", "Inbox", "Review", "Characters", "Graph", "Timeline", "Simulate"],
  },
  ko: {
    label: "샘플 IP — 합성 데모 데이터",
    title: "새벽 아카데미 데모",
    subtitle: "Inbox, Review, Characters, Graph, Timeline, Scene Simulation을 실제 Author Memory v3 흐름과 같은 구조로 읽기 전용 시연합니다.",
    note: "본 데모 데이터는 Seizn 기능 시연용 합성 자료이며 실제 작가·스튜디오와 무관합니다.",
    unavailableTitle: "샘플 데이터를 잠시 불러올 수 없습니다",
    unavailableBody: "일부 원본 파일을 읽지 못해 현재 불러온 데이터만 데모로 표시합니다.",
    cta: "가격 보기",
    source: "원본 스냅샷",
    screens: ["소개", "Inbox", "Review", "Characters", "Graph", "Timeline", "Simulate"],
  },
  ja: {
    label: "サンプル IP — 合成デモデータ",
    title: "Saebyeok Academy デモ",
    subtitle: "Inbox、Review、Characters、Graph、Timeline、Scene Simulation を Author Memory v3 と同じ読み取り専用フローで確認できます。",
    note: "このデモデータは Seizn のために作成された合成サンプルで、実在の作者やスタジオとは関係ありません。",
    unavailableTitle: "サンプルデータを一時的に利用できません",
    unavailableBody: "一部のソースファイルを読めないため、取得できたデータだけを表示しています。",
    cta: "料金を見る",
    source: "ソース snapshot",
    screens: ["Intro", "Inbox", "Review", "Characters", "Graph", "Timeline", "Simulate"],
  },
  zh: {
    label: "样本 IP — 合成演示数据",
    title: "Saebyeok Academy 演示",
    subtitle: "以只读方式展示 Author Memory v3 的 Inbox、Review、Characters、Graph、Timeline 和 Scene Simulation 流程。",
    note: "演示数据为 Seizn 设计的合成样本，与任何作者或工作室无关。",
    unavailableTitle: "样本数据暂时不可用",
    unavailableBody: "部分源文件无法读取，因此当前只显示已加载的数据。",
    cta: "查看价格",
    source: "源快照",
    screens: ["Intro", "Inbox", "Review", "Characters", "Graph", "Timeline", "Simulate"],
  },
};

export function SaebyeokDemo({ data, locale }: { data: SaebyeokDemoData; locale: Locale | string }) {
  const copy = getSaebyeokDemoCopy(locale);
  const characters = getArray(data.canon, "characters");
  const rules = getArray(data.worldRules, "rules");
  const events = getArray(data.timeline, "events");
  const relationships = getArray(data.relationships, "relationships");
  const cases = getArray(data.reviewCases, "cases");
  const simulations = getArray(data.simulations, "simulations");

  return (
    <main className="min-h-screen bg-[#f8f6f1] text-[#171717]">
      <section className="border-b border-[#ded6c8] bg-[#fffdf8]">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase text-[#1f766b]">{copy.label}</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">{copy.title}</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#4b5563]">{copy.subtitle}</p>
            <p className="mt-3 rounded-lg border border-[#c8d8d5] bg-[#eef8f6] px-4 py-3 text-sm text-[#24514c]">
              {copy.note}
            </p>
            {data.hasSourceErrors ? (
              <div className="mt-3 rounded-lg border border-[#e3c073] bg-[#fff8df] px-4 py-3" role="status">
                <p className="text-sm font-semibold text-[#4a3711]">{copy.unavailableTitle}</p>
                <p className="mt-1 text-sm leading-6 text-[#6a4a0c]">{copy.unavailableBody}</p>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={`/${locale}/pricing`} className="rounded-lg bg-[#171717] px-4 py-2 text-sm font-medium text-white hover:bg-[#2d2d2d]">
              {copy.cta}
            </Link>
            <a href="#intro" className="rounded-lg border border-[#c9c0b2] px-4 py-2 text-sm font-medium text-[#34302a] hover:bg-[#f1ece3]">
              {copy.source}
            </a>
          </div>
        </div>
      </section>

      <nav className="sticky top-0 z-20 border-b border-[#ded6c8] bg-[#fffdf8]/95 px-6 py-3 backdrop-blur" aria-label="Demo screens">
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto">
          {copy.screens.map((screen) => (
            <a key={screen} href={`#${screen.toLowerCase()}`} className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-[#4b5563] hover:bg-[#f1ece3] hover:text-[#171717]">
              {screen}
            </a>
          ))}
        </div>
      </nav>

      <div className="mx-auto max-w-7xl space-y-10 px-6 py-10">
        <IntroScreen data={data} rules={rules} />
        <InboxScreen cases={cases} />
        <ReviewScreen data={data} cases={cases} />
        <CharactersScreen characters={characters} />
        <GraphScreen relationships={relationships} characters={characters} />
        <TimelineScreen events={events} />
        <SimulateScreen simulations={simulations} />
      </div>
    </main>
  );
}

function IntroScreen({ data, rules }: { data: SaebyeokDemoData; rules: Record<string, unknown>[] }) {
  return (
    <DemoSection id="intro" title="Readme Intro" eyebrow="Read-only source handoff">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Characters" value={data.summary.characters} />
        <Metric label="World rules" value={data.summary.worldRules} />
        <Metric label="Review cases" value={data.summary.reviewCases} />
        <Metric label="Timeline events" value={data.summary.timelineEvents} />
        <Metric label="Relationships" value={data.summary.relationships} />
        <Metric label="Simulations" value={data.summary.simulations} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-[#ded6c8] bg-white p-5">
          <h3 className="text-base font-semibold">{data.readme.title}</h3>
          <p className="mt-3 text-sm leading-7 text-[#4b5563]">
            {getString(data.canon, "purpose", "Synthetic sample IP source for the Seizn Author landing demo.")}
          </p>
        </div>
        <div className="rounded-lg border border-[#ded6c8] bg-white p-5">
          <h3 className="text-base font-semibold">World rules preview</h3>
          <ul className="mt-3 space-y-2 text-sm text-[#4b5563]">
            {rules.slice(0, 5).map((rule) => (
              <li key={getString(rule, "id")} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-[#1f766b]" />
                <span>{getString(rule, "name", getString(rule, "id"))}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </DemoSection>
  );
}

function InboxScreen({ cases }: { cases: Record<string, unknown>[] }) {
  return (
    <DemoSection id="inbox" title="Inbox" eyebrow="Candidate review queue">
      <div className="grid gap-3 md:grid-cols-2">
        {cases.slice(0, 6).map((item) => (
          <article key={getString(item, "case_id")} className="rounded-lg border border-[#ded6c8] bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase text-[#1f766b]">{getString(item, "category")}</span>
              <span className="text-xs text-[#6b7280]">{getString(item, "case_id").replace("saebyeok.eval.", "#")}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#374151]">{getString(item, "question")}</p>
          </article>
        ))}
      </div>
    </DemoSection>
  );
}

function ReviewScreen({ data, cases }: { data: SaebyeokDemoData; cases: Record<string, unknown>[] }) {
  const distribution = data.reviewCases.category_distribution as Record<string, number> | undefined;
  const entries = Object.entries(distribution ?? {});

  return (
    <DemoSection id="review" title="Review" eyebrow="Canon risk and rubric">
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-lg border border-[#ded6c8] bg-white p-5">
          <h3 className="text-base font-semibold">Category distribution</h3>
          <div className="mt-4 space-y-3">
            {entries.map(([key, value]) => (
              <div key={key}>
                <div className="flex justify-between text-sm">
                  <span className="capitalize text-[#374151]">{key.replaceAll("_", " ")}</span>
                  <span className="font-medium">{value}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-[#eee8dd]">
                  <div className="h-2 rounded-full bg-[#1f766b]" style={{ width: `${Math.min(100, value * 10)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {cases.slice(18, 24).map((item) => (
            <article key={getString(item, "case_id")} className="rounded-lg border border-[#f0c7c7] bg-[#fff8f8] p-4">
              <p className="text-xs font-semibold uppercase text-[#b54747]">{getString(item, "scoring")}</p>
              <p className="mt-2 text-sm leading-6 text-[#374151]">{getString(item, "expected_answer")}</p>
            </article>
          ))}
        </div>
      </div>
    </DemoSection>
  );
}

function CharactersScreen({ characters }: { characters: Record<string, unknown>[] }) {
  return (
    <DemoSection id="characters" title="Characters" eyebrow="Person registry">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {characters.map((character) => (
          <article key={getString(character, "id")} className="rounded-lg border border-[#ded6c8] bg-white p-4">
            <p className="text-xs font-semibold uppercase text-[#1f766b]">{getString(character, "story_role", "character")}</p>
            <h3 className="mt-2 text-lg font-semibold">{getString(character, "name_romanized", getString(character, "name"))}</h3>
            <p className="mt-2 text-sm leading-6 text-[#4b5563]">
              {getNestedString(character, ["voice", "first_person"], "Voice profile available")}
            </p>
            <p className="mt-3 text-xs text-[#6b7280]">Tier {getNumber(character, "tier", 1)}</p>
          </article>
        ))}
      </div>
    </DemoSection>
  );
}

function GraphScreen({
  relationships,
  characters,
}: {
  relationships: Record<string, unknown>[];
  characters: Record<string, unknown>[];
}) {
  const names = new Map(characters.map((character) => [getString(character, "id"), getString(character, "name_romanized", getString(character, "name"))]));

  return (
    <DemoSection id="graph" title="Graph" eyebrow="Relationship matrix">
      <div className="grid gap-3 md:grid-cols-2">
        {relationships.slice(0, 8).map((relationship) => (
          <article key={getString(relationship, "id")} className="rounded-lg border border-[#ded6c8] bg-white p-4">
            <div className="flex items-center gap-3 text-sm font-semibold">
              <span>{names.get(getString(relationship, "from")) ?? getString(relationship, "from")}</span>
              <span className="text-[#1f766b]">→</span>
              <span>{names.get(getString(relationship, "to")) ?? getString(relationship, "to")}</span>
            </div>
            <p className="mt-2 text-sm text-[#4b5563]">{getString(relationship, "relationship_type")}</p>
            <p className="mt-3 text-xs text-[#6b7280]">
              Trust: {getNestedString(relationship, ["current_state_d30", "trust"], "n/a")}
            </p>
          </article>
        ))}
      </div>
    </DemoSection>
  );
}

function TimelineScreen({ events }: { events: Record<string, unknown>[] }) {
  return (
    <DemoSection id="timeline" title="Timeline" eyebrow="D1-D30 event ledger">
      <div className="space-y-3">
        {events.slice(0, 10).map((event) => (
          <article key={getString(event, "id")} className="grid gap-3 rounded-lg border border-[#ded6c8] bg-white p-4 md:grid-cols-[120px_1fr]">
            <div>
              <p className="text-sm font-semibold text-[#1f766b]">{getString(event, "day")}</p>
              <p className="mt-1 text-xs text-[#6b7280]">{getString(event, "date")}</p>
            </div>
            <div>
              <p className="text-sm font-medium">{getString(event, "where")}</p>
              <p className="mt-2 text-sm leading-6 text-[#4b5563]">{getString(event, "what")}</p>
            </div>
          </article>
        ))}
      </div>
    </DemoSection>
  );
}

function SimulateScreen({ simulations }: { simulations: Record<string, unknown>[] }) {
  return (
    <DemoSection id="simulate" title="Simulate" eyebrow="Scene Simulation">
      <div className="grid gap-4 lg:grid-cols-2">
        {simulations.slice(0, 4).map((simulation) => {
          const candidates = getArray(simulation, "candidates");
          return (
            <article key={getString(simulation, "id")} className="rounded-lg border border-[#ded6c8] bg-white p-5">
              <p className="text-xs font-semibold uppercase text-[#1f766b]">{getString(simulation, "perspective")}</p>
              <h3 className="mt-2 text-base font-semibold">{getString(simulation, "scene_input")}</h3>
              <p className="mt-3 text-sm leading-6 text-[#4b5563]">{getString(simulation, "pressure")}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {candidates.map((candidate) => (
                  <span key={getString(candidate, "id")} className={`rounded-full px-2.5 py-1 text-xs font-medium ${riskClass(getString(candidate, "risk_level"))}`}>
                    {getString(candidate, "risk_level", "unknown")}
                  </span>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </DemoSection>
  );
}

function DemoSection({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="mb-4">
        <p className="text-sm font-semibold uppercase text-[#1f766b]">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[#ded6c8] bg-white p-4">
      <p className="text-sm text-[#6b7280]">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

export function getSaebyeokDemoCopy(locale: string) {
  if (locale === "ko" || locale === "ja") return COPY[locale];
  if (locale === "zh" || locale === "zh-hans" || locale === "zh-hant") return COPY.zh;
  return COPY.en;
}

function riskClass(risk: string): string {
  if (risk.includes("leak")) return "bg-[#fff1f1] text-[#b54747]";
  if (risk === "low") return "bg-[#edf8f3] text-[#1f766b]";
  return "bg-[#f1ece3] text-[#5f5348]";
}
