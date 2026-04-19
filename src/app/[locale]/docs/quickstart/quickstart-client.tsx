"use client";

import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { LanguageSwitcher } from "@/components/language-switcher";

type Step = {
  number: string;
  title: string;
  body: string;
  code: string;
};

type Copy = {
  title: string;
  subtitle: string;
  helper: string;
  steps: Step[];
  nextTitle: string;
  nextBody: string;
  apiLabel: string;
  integrationsLabel: string;
};

const COPY_EN: Copy = {
  title: "Quickstart",
  subtitle:
    "Install the SDK, create a graph, create an NPC entity, log a witnessed event, and retrieve context before the next dialogue turn.",
  helper:
    "This flow keeps the object model visible on purpose. Once the loop feels right, wrap the same calls inside your Unity, Unreal, Godot, or backend runtime.",
  steps: [
    {
      number: "01",
      title: "Install the SDK",
      body: "Start with the published package so the project already has Seizn in its dependency graph, even if the first pass uses raw HTTP for graph setup.",
      code: `npm install seizn
pip install seizn`,
    },
    {
      number: "02",
      title: "Create a graph",
      body: "Create one graph for the game world or shard you want this NPC memory loop to live in. Save the returned graph id for the next four calls.",
      code: `curl -X POST https://seizn.com/api/v1/graph \\
  -H "Authorization: Bearer $SEIZN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "smallgod-world",
    "description": "NPC memory graph for the first playable"
  }'`,
    },
    {
      number: "03",
      title: "Create the NPC entity",
      body: "Create or upsert the speaker you want to recall from later. Use a stable external id so the same NPC can be addressed across saves, shards, or engine sessions.",
      code: `curl -X POST https://seizn.com/api/v1/graph/$GRAPH_ID/entities \\
  -H "Authorization: Bearer $SEIZN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "character",
    "name": "Mira",
    "external_id": "npc_mira"
  }'`,
    },
    {
      number: "04",
      title: "Log the witnessed event",
      body: "Send the line or event text exactly once. Seizn extracts entities and relationships, then stores the witness trail inside the graph.",
      code: `curl -X POST https://seizn.com/api/v1/graph/$GRAPH_ID/extract \\
  -H "Authorization: Bearer $SEIZN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "Mira saw the player leave the old gate at dusk.",
    "max_entities": 8
  }'`,
    },
    {
      number: "05",
      title: "Retrieve next-turn context",
      body: "Ask from the NPC's point of view before the next bark, dialogue node, or quest branch. Keep the budget small so the returned graph context stays tight.",
      code: `curl -X POST https://seizn.com/api/v1/graph/$GRAPH_ID/context \\
  -H "Authorization: Bearer $SEIZN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "What does Mira know about the player right now?",
    "max_entities": 8,
    "max_depth": 2
  }'`,
    },
  ],
  nextTitle: "After the first loop works",
  nextBody:
    "Move to the API reference for exact schemas, then port the same five calls into your engine wrapper or server-authoritative gameplay service.",
  apiLabel: "Open API reference",
  integrationsLabel: "View integrations",
};

const COPY_KO: Copy = {
  title: "퀵스타트",
  subtitle:
    "SDK 설치부터 graph 생성, NPC 엔티티 생성, witness 이벤트 기록, 다음 대화 턴 컨텍스트 회수까지 5단계로 시작합니다.",
  helper:
    "여기서는 graph 객체가 눈에 보이도록 raw HTTP를 일부러 유지합니다. 루프가 맞으면 같은 호출을 Unity, Unreal, Godot, 또는 백엔드 런타임 래퍼 안으로 옮기면 됩니다.",
  steps: [
    {
      number: "01",
      title: "SDK 설치",
      body: "첫 통합이 raw HTTP 중심이어도 의존성 그래프에는 먼저 Seizn 패키지를 넣어두는 편이 좋습니다.",
      code: `npm install seizn
pip install seizn`,
    },
    {
      number: "02",
      title: "graph 생성",
      body: "이 NPC 메모리 루프가 들어갈 월드나 샤드 기준으로 graph를 하나 만듭니다. 반환된 graph id를 다음 네 호출에 그대로 사용합니다.",
      code: `curl -X POST https://seizn.com/api/v1/graph \\
  -H "Authorization: Bearer $SEIZN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "smallgod-world",
    "description": "first playable용 NPC memory graph"
  }'`,
    },
    {
      number: "03",
      title: "NPC 엔티티 생성",
      body: "나중에 기억을 회수할 화자를 먼저 만듭니다. 저장 데이터, 샤드, 엔진 세션을 넘어 같은 NPC를 가리키려면 안정적인 external id가 필요합니다.",
      code: `curl -X POST https://seizn.com/api/v1/graph/$GRAPH_ID/entities \\
  -H "Authorization: Bearer $SEIZN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "character",
    "name": "Mira",
    "external_id": "npc_mira"
  }'`,
    },
    {
      number: "04",
      title: "witness 이벤트 기록",
      body: "대사나 이벤트 텍스트를 한 번 보내면 Seizn이 엔티티와 관계를 추출하고 witness 흔적을 graph에 저장합니다.",
      code: `curl -X POST https://seizn.com/api/v1/graph/$GRAPH_ID/extract \\
  -H "Authorization: Bearer $SEIZN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "Mira saw the player leave the old gate at dusk.",
    "max_entities": 8
  }'`,
    },
    {
      number: "05",
      title: "다음 턴 컨텍스트 회수",
      body: "다음 bark, dialogue node, quest branch 직전에 NPC 시점으로 질의합니다. 반환 graph context가 퍼지지 않도록 budget은 작게 시작하는 편이 좋습니다.",
      code: `curl -X POST https://seizn.com/api/v1/graph/$GRAPH_ID/context \\
  -H "Authorization: Bearer $SEIZN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "What does Mira know about the player right now?",
    "max_entities": 8,
    "max_depth": 2
  }'`,
    },
  ],
  nextTitle: "첫 루프가 맞으면",
  nextBody:
    "정확한 request schema는 API reference에서 확인하고, 같은 다섯 호출을 엔진 래퍼나 서버 권한 게임플레이 서비스 안으로 옮기면 됩니다.",
  apiLabel: "API reference 열기",
  integrationsLabel: "연동 예제 보기",
};

function getCopy(locale: Locale): Copy {
  return locale === "ko" ? COPY_KO : COPY_EN;
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto border border-white/10 bg-[#08111f] p-4 text-sm leading-7 text-slate-200">
      <code>{code}</code>
    </pre>
  );
}

export function QuickstartClient({ locale }: { locale: Locale }) {
  const copy = getCopy(locale);

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
            <span className="text-white">{copy.title}</span>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher currentLocale={locale} />
            <Link
              href={`/${locale}/docs/api-reference`}
              className="rounded-md bg-cyan-400 px-4 py-2 text-sm font-medium text-[#08111f] transition-colors hover:bg-cyan-300"
            >
              API
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <section className="border-b border-white/10 pb-12">
          <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">{copy.title}</h1>
          <p className="mt-5 max-w-4xl text-xl leading-8 text-slate-300">{copy.subtitle}</p>
          <p className="mt-4 max-w-4xl text-base leading-8 text-slate-400">{copy.helper}</p>
        </section>

        <section className="py-12">
          <div className="grid gap-6">
            {copy.steps.map((step) => (
              <div key={step.number} className="border border-white/10 bg-white/5 px-5 py-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-sm font-medium text-cyan-300">{step.number}</div>
                    <h2 className="mt-2 text-2xl font-semibold text-white">{step.title}</h2>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">{step.body}</p>
                  </div>
                </div>
                <div className="mt-6">
                  <CodeBlock code={step.code} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-white/10 py-12">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-semibold text-white">{copy.nextTitle}</h2>
              <p className="mt-4 text-lg leading-8 text-slate-300">{copy.nextBody}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/${locale}/docs/api-reference`}
                className="rounded-md border border-white/15 px-5 py-3 text-sm font-medium text-white transition-colors hover:border-white/25 hover:bg-white/5"
              >
                {copy.apiLabel}
              </Link>
              <Link
                href={`/${locale}/docs/integrations`}
                className="rounded-md bg-cyan-400 px-5 py-3 text-sm font-medium text-[#08111f] transition-colors hover:bg-cyan-300"
              >
                {copy.integrationsLabel}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 py-8">
        <div className="mx-auto max-w-6xl px-6 text-center text-sm text-slate-400">
          {new Date().getFullYear()} Seizn
        </div>
      </footer>
    </div>
  );
}
