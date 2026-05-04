import Link from "next/link";

export default function EngineHoldingPage() {
  return (
    <main
      style={{
        maxWidth: "920px",
        margin: "0 auto",
        padding: "96px 24px 64px",
      }}
    >
      <header style={{ marginBottom: 64 }}>
        <SWaveMark />
        <p
          style={{
            marginTop: 24,
            fontSize: 13,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#8b8ba0",
          }}
        >
          Seizn Engine
        </p>
        <h1
          style={{
            marginTop: 12,
            fontSize: "clamp(36px, 6vw, 64px)",
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            color: "#fafaff",
          }}
        >
          NPC memory layer
          <br />
          for game engines.
        </h1>
        <p
          style={{
            marginTop: 24,
            maxWidth: 640,
            fontSize: 18,
            lineHeight: 1.6,
            color: "#a8a8c0",
          }}
        >
          Persistent character memory, conflict resolution, and runtime context
          replay. SDK·MCP·CLI 로 어떤 게임 엔진에도 붙입니다. Unity·Unreal·web
          런타임 호환.
        </p>
      </header>

      <section
        style={{
          marginBottom: 56,
          padding: 24,
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <p
          style={{
            fontSize: 12,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#ff9d4a",
          }}
        >
          Status — W7+ phase
        </p>
        <p style={{ marginTop: 12, fontSize: 16, lineHeight: 1.7, color: "#d6d6e8" }}>
          Engine surface 풀 launch 는 작가용 Author flagship traction 신호 보고
          단계적으로 진행합니다. 지금은 OSS SDK·docs·MCP 서버 모두 운영 중.
        </p>
      </section>

      <section style={{ marginBottom: 56 }}>
        <h2
          style={{
            fontSize: 12,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#8b8ba0",
            marginBottom: 20,
          }}
        >
          Available now
        </h2>
        <div style={{ display: "grid", gap: 16 }}>
          <SdkCard
            name="@seizn/sdk-js"
            description="OpenAPI-generated TypeScript client. REST·webhook·SSE 스트림 지원."
            href="https://www.npmjs.com/package/@seizn/sdk-js"
          />
          <SdkCard
            name="@seizn/mcp"
            description="Model Context Protocol server. Claude·OpenAI tool use 호환."
            href="https://www.npmjs.com/package/@seizn/mcp"
          />
          <SdkCard
            name="@seizn/cli"
            description="Command-line interface. 메모리 저장·검색·내보내기 자동화."
            href="https://www.npmjs.com/package/@seizn/cli"
          />
        </div>
      </section>

      <section style={{ marginBottom: 56 }}>
        <h2
          style={{
            fontSize: 12,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#8b8ba0",
            marginBottom: 20,
          }}
        >
          Resources
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <ResourceLink href="https://www.seizn.com/en/docs">API docs</ResourceLink>
          <ResourceLink href="https://github.com/iruhana/seizn">GitHub</ResourceLink>
          <ResourceLink href="https://www.seizn.com/en/docs/faq">FAQ</ResourceLink>
        </div>
      </section>

      <footer
        style={{
          marginTop: 96,
          paddingTop: 32,
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "1fr auto",
            alignItems: "end",
          }}
        >
          <div>
            <p style={{ fontSize: 13, color: "#a8a8c0", lineHeight: 1.6 }}>
              작가·IP 빌더용 메모리 도구를 찾으세요?
            </p>
            <Link
              href="https://www.seizn.com"
              style={{
                display: "inline-block",
                marginTop: 8,
                fontSize: 14,
                color: "#fafaff",
                textDecoration: "underline",
                textUnderlineOffset: 4,
              }}
            >
              seizn.com — Seizn Author flagship →
            </Link>
          </div>
          <p
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              color: "#6b6b80",
              textTransform: "uppercase",
            }}
          >
            engine.seizn.com · Litheon LLC
          </p>
        </div>
      </footer>
    </main>
  );
}

function SWaveMark() {
  return (
    <svg
      width="64"
      height="48"
      viewBox="0 0 64 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Seizn Engine"
      role="img"
    >
      <path
        d="M4 32 C 12 32, 14 16, 22 16 C 30 16, 32 32, 40 32 C 48 32, 50 16, 60 16"
        stroke="#e6e6f0"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="14" cy="24" r="3.5" fill="#ff9d4a" />
      <circle cx="26" cy="20" r="3.5" fill="#7fd97e" />
      <circle cx="40" cy="32" r="3.5" fill="#ffd84a" />
      <circle cx="54" cy="20" r="3.5" fill="#5dc3d6" />
    </svg>
  );
}

function SdkCard({
  name,
  description,
  href,
}: {
  name: string;
  description: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "block",
        padding: "20px 24px",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        background: "rgba(255,255,255,0.02)",
        textDecoration: "none",
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <p
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 14,
          color: "#fafaff",
          marginBottom: 6,
        }}
      >
        {name}
      </p>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: "#a8a8c0" }}>{description}</p>
    </a>
  );
}

function ResourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      style={{
        display: "inline-block",
        padding: "10px 16px",
        fontSize: 13,
        color: "#fafaff",
        textDecoration: "none",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 8,
        background: "rgba(255,255,255,0.04)",
      }}
    >
      {children}
    </a>
  );
}
