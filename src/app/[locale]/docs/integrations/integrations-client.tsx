'use client';

import Link from 'next/link';
import type { Locale } from "@/i18n/config";
import { LandingNav } from "@/components/shared/site-nav";

type Dictionary = Record<string, unknown>;

interface Props {
  locale: Locale;
  dictionary: Dictionary;
}

type Example = {
  title: string;
  subtitle: string;
  code: string;
};

type Copy = {
  title: string;
  subtitle: string;
  helper: string;
  scenarioTitle: string;
  scenarioBody: string;
  examples: Example[];
  finalTitle: string;
  finalBody: string;
  finalPrimary: string;
  finalSecondary: string;
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

const COPY_EN: Copy = {
  title: "One NPC memory flow, six integration paths",
  subtitle:
    "Every example uses the same scenario: create an NPC entity, log a witnessed event, then retrieve context before the next dialogue turn.",
  helper:
    "Use raw HTTP if you are proving the loop. Move into JavaScript, Python, Unity, Unreal, or Godot once the recall step belongs inside the runtime.",
  scenarioTitle: "Scenario",
  scenarioBody:
    "Mira the innkeeper sees the player leave the old gate at dusk. On the next turn, the game asks Seizn what Mira knows right now.",
  examples: [
    {
      title: "Raw HTTP",
      subtitle: "Direct API calls for the shortest possible integration path.",
      code: `curl -X POST https://seizn.com/api/v1/graph/$GRAPH_ID/entities \\
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
  -d '{"query":"What does Mira know about the player?","max_entities":8}'`,
    },
    {
      title: "JavaScript",
      subtitle: "Thin server wrapper before you enter the dialogue turn.",
      code: `const headers = {\n  Authorization: \`Bearer \${process.env.SEIZN_API_KEY}\`,\n  "Content-Type": "application/json",\n};\n\nawait fetch(\`https://seizn.com/api/v1/graph/\${graphId}/entities\`, {\n  method: "POST", headers,\n  body: JSON.stringify({ type: "character", name: "Mira", external_id: "npc_mira" }),\n});\nawait fetch(\`https://seizn.com/api/v1/graph/\${graphId}/extract\`, {\n  method: "POST", headers,\n  body: JSON.stringify({ text: "Mira saw the player leave the old gate at dusk." }),\n});\nconst context = await fetch(\`https://seizn.com/api/v1/graph/\${graphId}/context\`, {\n  method: "POST", headers,\n  body: JSON.stringify({ query: "What does Mira know about the player?", max_entities: 8 }),\n}).then((r) => r.json());`,
    },
    {
      title: "Python",
      subtitle: "Server-authoritative loop for tools, simulation backends, or quest services.",
      code: `import requests\n\nheaders = {\n    "Authorization": f"Bearer {SEIZN_API_KEY}",\n    "Content-Type": "application/json",\n}\nrequests.post(f"{BASE}/api/v1/graph/{graph_id}/entities", headers=headers, json={\n    "type": "character", "name": "Mira", "external_id": "npc_mira"\n})\nrequests.post(f"{BASE}/api/v1/graph/{graph_id}/extract", headers=headers, json={\n    "text": "Mira saw the player leave the old gate at dusk."\n})\ncontext = requests.post(f"{BASE}/api/v1/graph/{graph_id}/context", headers=headers, json={\n    "query": "What does Mira know about the player?", "max_entities": 8\n}).json()`,
    },
    {
      title: "Unity C#",
      subtitle: "Thin client wrapper called before the next NPC bark or dialogue node.",
      code: `var client = new SeiznClient(baseUrl, apiKey, graphId);\nawait client.UpsertEntity(new SeiznEntity {\n    Type = "character",\n    Name = "Mira",\n    ExternalId = "npc_mira"\n});\nawait client.ExtractAsync("Mira saw the player leave the old gate at dusk.");\nvar context = await client.BuildContextAsync(\n    "What does Mira know about the player?",\n    maxEntities: 8,\n    maxDepth: 2\n);\ndialogueRunner.SetMemoryContext(context.SubgraphDescription);`,
    },
    {
      title: "Godot GDScript",
      subtitle: "Call Seizn from your dialogue turn or behavior tree script.",
      code: `var client := SeiznClient.new(base_url, api_key, graph_id)\nawait client.upsert_entity({\n    "type": "character",\n    "name": "Mira",\n    "external_id": "npc_mira"\n})\nawait client.extract("Mira saw the player leave the old gate at dusk.")\nvar context = await client.build_context(\n    "What does Mira know about the player?",\n    8,\n    2\n)\ndialogue_state.memory_context = context.subgraph_description`,
    },
    {
      title: "Unreal C++",
      subtitle: "Same three calls wrapped behind a gameplay-facing client.",
      code: `FSeiznClient Client(BaseUrl, ApiKey, GraphId);\nco_await Client.UpsertEntity({\n    TEXT("character"),\n    TEXT("Mira"),\n    TEXT("npc_mira")\n});\nco_await Client.Extract(TEXT("Mira saw the player leave the old gate at dusk."));\nconst FSeiznContext Context = co_await Client.BuildContext(\n    TEXT("What does Mira know about the player?"),\n    8,\n    2\n);\nDialogueSubsystem->SetMemoryContext(Context.SubgraphDescription);`,
    },
  ],
  finalTitle: "Need the reference shape too?",
  finalBody: "Use the API reference for exact request schemas, then price the rollout once the loop feels right.",
  finalPrimary: "Open API reference",
  finalSecondary: "View pricing",
};

const COPY_KO: Copy = {
  title: "하나의 NPC 메모리 흐름, 여섯 가지 연동 경로",
  subtitle:
    "모든 예제는 같은 시나리오를 사용합니다. NPC 엔티티를 만들고, witness 이벤트를 기록하고, 다음 대화 턴 전에 컨텍스트를 회수합니다.",
  helper:
    "루프를 검증하는 단계라면 raw HTTP부터 시작하고, recall 단계가 런타임 안에 들어가면 JavaScript, Python, Unity, Unreal, Godot 쪽으로 올리면 됩니다.",
  scenarioTitle: "시나리오",
  scenarioBody:
    "여관 주인 Mira가 해질녘 old gate에서 플레이어가 떠나는 장면을 봅니다. 다음 턴에서 게임은 지금 Mira가 무엇을 알고 있는지 Seizn에 묻습니다.",
  examples: [
    {
      title: "Raw HTTP",
      subtitle: "가장 짧은 통합 경로를 위한 직접 API 호출입니다.",
      code: `curl -X POST https://seizn.com/api/v1/graph/$GRAPH_ID/entities \\
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
  -d '{"query":"What does Mira know about the player?","max_entities":8}'`,
    },
    {
      title: "JavaScript",
      subtitle: "다음 대화 턴 직전에 넣는 얇은 서버 래퍼 예제입니다.",
      code: `const headers = {\n  Authorization: \`Bearer \${process.env.SEIZN_API_KEY}\`,\n  "Content-Type": "application/json",\n};\n\nawait fetch(\`https://seizn.com/api/v1/graph/\${graphId}/entities\`, {\n  method: "POST", headers,\n  body: JSON.stringify({ type: "character", name: "Mira", external_id: "npc_mira" }),\n});\nawait fetch(\`https://seizn.com/api/v1/graph/\${graphId}/extract\`, {\n  method: "POST", headers,\n  body: JSON.stringify({ text: "Mira saw the player leave the old gate at dusk." }),\n});\nconst context = await fetch(\`https://seizn.com/api/v1/graph/\${graphId}/context\`, {\n  method: "POST", headers,\n  body: JSON.stringify({ query: "What does Mira know about the player?", max_entities: 8 }),\n}).then((r) => r.json());`,
    },
    {
      title: "Python",
      subtitle: "툴링, 시뮬레이션 백엔드, 퀘스트 서비스에 맞는 서버 권한 루프입니다.",
      code: `import requests\n\nheaders = {\n    "Authorization": f"Bearer {SEIZN_API_KEY}",\n    "Content-Type": "application/json",\n}\nrequests.post(f"{BASE}/api/v1/graph/{graph_id}/entities", headers=headers, json={\n    "type": "character", "name": "Mira", "external_id": "npc_mira"\n})\nrequests.post(f"{BASE}/api/v1/graph/{graph_id}/extract", headers=headers, json={\n    "text": "Mira saw the player leave the old gate at dusk."\n})\ncontext = requests.post(f"{BASE}/api/v1/graph/{graph_id}/context", headers=headers, json={\n    "query": "What does Mira know about the player?", "max_entities": 8\n}).json()`,
    },
    {
      title: "Unity C#",
      subtitle: "다음 bark나 dialogue node 직전에 부르는 얇은 클라이언트 래퍼 예제입니다.",
      code: `var client = new SeiznClient(baseUrl, apiKey, graphId);\nawait client.UpsertEntity(new SeiznEntity {\n    Type = "character",\n    Name = "Mira",\n    ExternalId = "npc_mira"\n});\nawait client.ExtractAsync("Mira saw the player leave the old gate at dusk.");\nvar context = await client.BuildContextAsync(\n    "What does Mira know about the player?",\n    maxEntities: 8,\n    maxDepth: 2\n);\ndialogueRunner.SetMemoryContext(context.SubgraphDescription);`,
    },
    {
      title: "Godot GDScript",
      subtitle: "대화 턴이나 behavior tree 스크립트에서 Seizn을 호출합니다.",
      code: `var client := SeiznClient.new(base_url, api_key, graph_id)\nawait client.upsert_entity({\n    "type": "character",\n    "name": "Mira",\n    "external_id": "npc_mira"\n})\nawait client.extract("Mira saw the player leave the old gate at dusk.")\nvar context = await client.build_context(\n    "What does Mira know about the player?",\n    8,\n    2\n)\ndialogue_state.memory_context = context.subgraph_description`,
    },
    {
      title: "Unreal C++",
      subtitle: "같은 세 호출을 게임플레이 클라이언트 뒤에 감싼 예제입니다.",
      code: `FSeiznClient Client(BaseUrl, ApiKey, GraphId);\nco_await Client.UpsertEntity({\n    TEXT("character"),\n    TEXT("Mira"),\n    TEXT("npc_mira")\n});\nco_await Client.Extract(TEXT("Mira saw the player leave the old gate at dusk."));\nconst FSeiznContext Context = co_await Client.BuildContext(\n    TEXT("What does Mira know about the player?"),\n    8,\n    2\n);\nDialogueSubsystem->SetMemoryContext(Context.SubgraphDescription);`,
    },
  ],
  finalTitle: "정확한 레퍼런스도 같이 필요하신가요?",
  finalBody: "정확한 request schema는 API reference에서 보고, 루프가 맞으면 그다음 pricing으로 넘어가면 됩니다.",
  finalPrimary: "API reference 열기",
  finalSecondary: "가격 보기",
};

function getCopy(locale: Locale): Copy {
  if (locale === "ko") return COPY_KO;
  return COPY_EN;
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-szn-border-subtle bg-szn-surface-1 p-4 text-sm leading-7 text-szn-text-2">
      <code>{code}</code>
    </pre>
  );
}

export function IntegrationsClient({ locale, dictionary }: Props) {
  const copy = getCopy(locale);

  const t = (key: string): string => {
    const value = getNestedValue(dictionary, key);
    return value ?? key;
  };

  return (
    <div className="dark min-h-screen bg-szn-bg text-szn-text-1">
      <LandingNav locale={locale} ctaHref={`/${locale}/login`} ctaLabel={t("nav.getStarted")} />

      <main className="mx-auto max-w-6xl px-6 py-12">
        <section className="border-b border-szn-border-subtle pb-12">
          <Link href={`/${locale}/docs`} className="text-sm text-szn-text-2 transition-colors hover:text-szn-text-1">
            {t("nav.docs")}
          </Link>
          <div className="szn-section-number mt-10">DOCS / INTEGRATIONS</div>
          <h1 className="szn-serif mt-5 text-4xl font-semibold tracking-normal text-szn-text-1 md:text-5xl">{copy.title}</h1>
          <p className="mt-5 max-w-4xl text-xl leading-8 text-szn-text-2">{copy.subtitle}</p>
          <p className="mt-4 max-w-4xl text-base leading-8 text-szn-text-3">{copy.helper}</p>
        </section>

        <section className="border-b border-szn-border-subtle py-12">
          <h2 className="text-3xl font-semibold text-szn-text-1">{copy.scenarioTitle}</h2>
          <p className="mt-4 max-w-4xl text-lg leading-8 text-szn-text-2">{copy.scenarioBody}</p>
        </section>

        <section className="py-12">
          <div className="grid gap-6">
            {copy.examples.map((example) => (
              <div key={example.title} className="rounded-xl border border-szn-border-subtle bg-szn-surface-1 px-5 py-5">
                <h2 className="text-2xl font-semibold text-szn-text-1">{example.title}</h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-szn-text-2">{example.subtitle}</p>
                <div className="mt-6">
                  <CodeBlock code={example.code} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-szn-border-subtle py-12">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-semibold text-szn-text-1">{copy.finalTitle}</h2>
              <p className="mt-4 text-lg leading-8 text-szn-text-2">{copy.finalBody}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/${locale}/docs/api-reference`}
                className="szn-btn-ghost px-5 py-3 text-sm"
              >
                {copy.finalPrimary}
              </Link>
              <Link
                href={`/${locale}/pricing`}
                className="szn-btn-glass px-5 py-3 text-sm"
              >
                {copy.finalSecondary}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-szn-border-subtle py-8">
        <div className="mx-auto max-w-6xl px-6 text-center text-sm text-szn-text-3">
          {t("docs.footer.copyright").replace("{year}", new Date().getFullYear().toString())}
        </div>
      </footer>
    </div>
  );
}
