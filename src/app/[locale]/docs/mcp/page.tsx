import type { Metadata } from "next";
import { locales, type Locale } from "@/i18n/config";
import { LandingNav } from "@/components/shared/site-nav";

type Props = {
  params: Promise<{ locale: string }>;
};

type Snippet = {
  label: string;
  code: string;
};

const snippets: Snippet[] = [
  {
    label: "Claude Desktop",
    code: `{
  "mcpServers": {
    "seizn": {
      "command": "npx",
      "args": ["-y", "@seizn/mcp"],
      "env": {
        "SEIZN_API_KEY": "szn_live_xxx"
      }
    }
  }
}`,
  },
  {
    label: "Cursor",
    code: `{
  "mcpServers": {
    "seizn": {
      "command": "npx",
      "args": ["-y", "@seizn/mcp"],
      "env": {
        "SEIZN_API_KEY": "szn_live_xxx"
      }
    }
  }
}`,
  },
  {
    label: "Claude Code",
    code: `export SEIZN_API_KEY=szn_live_xxx
claude mcp add seizn -- npx -y @seizn/mcp`,
  },
  {
    label: "Codex CLI",
    code: `[mcp_servers.seizn]
command = "npx"
args = ["-y", "@seizn/mcp"]

[mcp_servers.seizn.env]
SEIZN_API_KEY = "szn_live_xxx"`,
  },
];

const tools = [
  "seizn.memory.search(query, npc_id?)",
  "seizn.memory.create(npc_id, content, metadata?)",
  "seizn.canon.list(npc_id?)",
  "seizn.canon.check(npc_id?, proposed_content)",
  "seizn.replay.fetch(session_id)",
  "seizn.chaos.run(npc_id, suite)",
  "seizn.story_health.current(act?)",
];

const copy = {
  en: {
    title: "Seizn MCP Server",
    description:
      "Install @seizn/mcp for Claude Desktop, Claude Code, Cursor, and Codex.",
    eyebrow: "Docs / MCP",
    heading: "Use Seizn memory from your agent runtime",
    intro:
      "@seizn/mcp exposes NPC memory, Canon Locks, deterministic replay, Chaos Monkey, and Story Health as MCP tools. The server starts over stdio and reads only SEIZN_API_KEY from the process environment.",
    installTitle: "Install",
    toolsTitle: "Tools",
    snippetsTitle: "Client configs",
    authBody:
      "Set SEIZN_API_KEY before the MCP server starts. Do not pass keys in command args or tool arguments. SEIZN_API_URL is optional and defaults to https://www.seizn.com.",
    checkTitle: "Canon check payload",
  },
  ko: {
    title: "Seizn MCP 서버",
    description:
      "Claude Desktop, Claude Code, Cursor, Codex에서 @seizn/mcp를 연결하는 방법입니다.",
    eyebrow: "문서 / MCP",
    heading: "에이전트 런타임에서 Seizn 메모리 사용",
    intro:
      "@seizn/mcp는 NPC 메모리, Canon Lock, deterministic replay, Chaos Monkey, Story Health를 MCP 도구로 노출합니다. 서버는 stdio로 실행되고 프로세스 환경변수의 SEIZN_API_KEY만 읽습니다.",
    installTitle: "설치",
    toolsTitle: "도구",
    snippetsTitle: "클라이언트 설정",
    authBody:
      "MCP 서버 시작 전에 SEIZN_API_KEY를 설정하세요. 키를 command args나 tool arguments로 넘기지 않습니다. SEIZN_API_URL은 선택값이며 기본값은 https://www.seizn.com 입니다.",
    checkTitle: "Canon check payload",
  },
} as const;

function getLocale(localeParam: string): Locale {
  return (locales.includes(localeParam as Locale) ? localeParam : "en") as Locale;
}

function getCopy(locale: Locale) {
  return locale === "ko" ? copy.ko : copy.en;
}

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = getLocale(localeParam);
  const text = getCopy(locale);

  return {
    title: text.title,
    description: text.description,
    alternates: {
      canonical: `/${locale}/docs/mcp`,
    },
    openGraph: {
      title: text.title,
      description: text.description,
      type: "website",
    },
  };
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-szn-border-subtle bg-szn-surface-1 p-4 text-sm leading-6 text-szn-text-2">
      <code>{code}</code>
    </pre>
  );
}

export default async function McpDocsPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = getLocale(localeParam);
  const text = getCopy(locale);

  return (
    <div className="dark min-h-screen bg-szn-bg text-szn-text-1">
      <LandingNav locale={locale} />
    <main>
      <section className="mx-auto max-w-6xl px-6 py-20 sm:px-8 lg:px-10">
        <p className="szn-eyebrow">{text.eyebrow}</p>
        <div className="szn-section-number mt-8">DOCS / MCP</div>
        <h1 className="szn-serif mt-5 max-w-4xl text-4xl font-semibold tracking-normal text-szn-text-1 sm:text-5xl">
          {text.heading}
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-7 text-szn-text-2 sm:text-lg">
          {text.intro}
        </p>
      </section>

      <section className="border-y border-szn-border-subtle bg-szn-surface-1">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:px-10">
          <div>
            <p className="szn-section-number">01</p>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal">{text.installTitle}</h2>
            <p className="mt-4 text-sm leading-6 text-szn-text-2">{text.authBody}</p>
          </div>
          <CodeBlock code={`export SEIZN_API_KEY=szn_live_xxx\nnpx -y @seizn/mcp`} />
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:px-10">
        <div>
          <p className="szn-section-number">02</p>
          <h2 className="mt-4 text-2xl font-semibold tracking-normal">{text.toolsTitle}</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {tools.map((tool) => (
            <code key={tool} className="rounded-md border border-szn-border-subtle bg-szn-surface-1 px-4 py-3 text-sm text-szn-text-1">
              {tool}
            </code>
          ))}
        </div>
      </section>

      <section className="border-y border-szn-border-subtle bg-szn-surface-1">
        <div className="mx-auto max-w-6xl px-6 py-12 sm:px-8 lg:px-10">
          <p className="szn-section-number">03</p>
          <h2 className="mt-4 text-2xl font-semibold tracking-normal">{text.snippetsTitle}</h2>
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {snippets.map((snippet) => (
              <article key={snippet.label} className="rounded-lg border border-szn-border-subtle bg-szn-bg p-5">
                <h3 className="mb-4 text-base font-semibold tracking-normal">{snippet.label}</h3>
                <CodeBlock code={snippet.code} />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12 pb-20 sm:px-8 lg:px-10">
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="szn-section-number">04</p>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal">{text.checkTitle}</h2>
          </div>
          <CodeBlock
            code={`{
  "tool": "seizn.canon.check",
  "arguments": {
    "npc_id": "archivist_vale",
    "proposed_content": "Vale reveals the sealed city password."
  }
}`}
          />
        </div>
      </section>
    </main>
    </div>
  );
}
