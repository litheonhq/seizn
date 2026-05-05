import Image from "next/image";
import Link from "next/link";
import type { SVGProps } from "react";

const COLOR = {
  bg: "#0a0a18",
  surface: "#11112a",
  text1: "#fafaff",
  text2: "#a8a8c0",
  text3: "#6b6b80",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.16)",
  cardBg: "rgba(255,255,255,0.02)",
  cardBgHover: "rgba(255,255,255,0.04)",
  accentOrange: "#ff9d4a",
  accentGreen: "#7fd97e",
  accentYellow: "#ffd84a",
  accentCyan: "#5dc3d6",
  accentIndigo: "#8b8cff",
  accentRose: "#ff7aa2",
  accentPurple: "#b88cff",
};

export default function EngineLandingPage() {
  return (
    <>
      <NavHeader />
      <main>
        <Hero />
        <StatsBar />
        <SdkSection />
        <FeatureShowcase />
        <McpDeveloperTools />
        <TrustAndCompliance />
        <PricingCta />
      </main>
      <FooterEngine />
    </>
  );
}

function NavHeader() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        backdropFilter: "blur(12px)",
        background: "rgba(10,10,24,0.78)",
        borderBottom: `1px solid ${COLOR.border}`,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link href="/engine" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <Image
            src="/seizn-engine-logo.png"
            alt="Seizn Engine"
            width={36}
            height={36}
            priority
            style={{ width: 36, height: 36 }}
          />
          <span style={{ color: COLOR.text1, fontWeight: 600, fontSize: 16, letterSpacing: "-0.01em" }}>
            Seizn Engine
          </span>
        </Link>
        <nav style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <NavLink href="#features">Features</NavLink>
          <NavLink href="#sdk">SDK</NavLink>
          <NavLink href="#trust">Trust</NavLink>
          <NavLink href="https://www.seizn.com/en/docs">Docs</NavLink>
          <NavLink href="https://github.com/litheonhq/seizn">GitHub</NavLink>
          <Link
            href="https://www.npmjs.com/package/@seizn/sdk-js"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 500,
              color: COLOR.bg,
              background: COLOR.text1,
              borderRadius: 999,
              textDecoration: "none",
            }}
          >
            Install SDK
          </Link>
        </nav>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const external = href.startsWith("http");
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      style={{ color: COLOR.text2, textDecoration: "none", fontSize: 14 }}
    >
      {children}
    </Link>
  );
}

function Hero() {
  return (
    <section style={{ padding: "96px 24px 64px", maxWidth: 1100, margin: "0 auto" }}>
      <p
        style={{
          fontSize: 12,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: COLOR.text3,
          marginBottom: 24,
        }}
      >
        Seizn Engine · NPC memory SDK
      </p>
      <h1
        style={{
          fontSize: "clamp(40px, 6.5vw, 72px)",
          fontWeight: 700,
          lineHeight: 1.05,
          letterSpacing: "-0.025em",
          color: COLOR.text1,
          marginBottom: 24,
          maxWidth: 900,
        }}
      >
        NPC memory layer for{" "}
        <span style={{ color: COLOR.accentCyan }}>game engines</span>.
      </h1>
      <p
        style={{
          fontSize: 19,
          lineHeight: 1.6,
          color: COLOR.text2,
          maxWidth: 720,
          marginBottom: 36,
        }}
      >
        Persistent character memory, conflict resolution, and runtime context replay.
        SDK · MCP · CLI for any game engine — Unity, Unreal, and web runtimes
        included. The same canon engine that powers Seizn Author, exposed for
        developers.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <a
          href="https://www.npmjs.com/package/@seizn/sdk-js"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "14px 28px",
            fontSize: 15,
            fontWeight: 500,
            color: COLOR.bg,
            background: `linear-gradient(135deg, ${COLOR.accentCyan}, ${COLOR.accentGreen})`,
            borderRadius: 999,
            textDecoration: "none",
          }}
        >
          Install @seizn/sdk-js →
        </a>
        <a
          href="https://www.seizn.com/en/docs"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "14px 28px",
            fontSize: 15,
            fontWeight: 500,
            color: COLOR.text1,
            background: "transparent",
            border: `1px solid ${COLOR.borderStrong}`,
            borderRadius: 999,
            textDecoration: "none",
          }}
        >
          Read the docs
        </a>
      </div>
    </section>
  );
}

function StatsBar() {
  const stats = [
    { value: "1.28M", label: "entities tracked" },
    { value: "142ms", label: "p95 retrieval" },
    { value: "99.9%", label: "uptime SLO" },
    { value: "100+", label: "languages" },
  ];
  return (
    <section
      style={{
        maxWidth: 1100,
        margin: "0 auto 96px",
        padding: "0 24px",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 0,
          border: `1px solid ${COLOR.border}`,
          borderRadius: 16,
          background: COLOR.cardBg,
          overflow: "hidden",
        }}
      >
        {stats.map((s, i) => (
          <div
            key={s.label}
            style={{
              padding: "28px 24px",
              borderRight: i < stats.length - 1 ? `1px solid ${COLOR.border}` : "none",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontSize: 28,
                fontWeight: 600,
                color: COLOR.text1,
                marginBottom: 6,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              {s.value}
            </p>
            <p style={{ fontSize: 12, color: COLOR.text3, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SdkSection() {
  const sdks = [
    {
      name: "@seizn/sdk-js",
      description: "OpenAPI-generated TypeScript client. REST · webhook · SSE streams.",
      href: "https://www.npmjs.com/package/@seizn/sdk-js",
      install: "npm i @seizn/sdk-js",
    },
    {
      name: "@seizn/mcp",
      description: "Model Context Protocol server. Claude · OpenAI tool-use compatible.",
      href: "https://www.npmjs.com/package/@seizn/mcp",
      install: "npm i @seizn/mcp",
    },
    {
      name: "@seizn/cli",
      description: "Command-line interface. Save, search, and export memories from terminal.",
      href: "https://www.npmjs.com/package/@seizn/cli",
      install: "npm i -g @seizn/cli",
    },
    {
      name: "create-seizn-app",
      description: "Project scaffolder. NPC SDK integration, schema, Vercel deploy template.",
      href: "https://www.npmjs.com/package/create-seizn-app",
      install: "npm create seizn-app",
    },
  ];
  return (
    <section id="sdk" style={{ maxWidth: 1100, margin: "0 auto 96px", padding: "0 24px" }}>
      <SectionHeader
        eyebrow="Available now"
        title="Install in one line. Ship in an afternoon."
        subtitle="Four packages, all on npm. Public Beta — published as 0.9.0-beta.1."
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 32 }}>
        {sdks.map((s) => (
          <a
            key={s.name}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              padding: "24px",
              border: `1px solid ${COLOR.border}`,
              borderRadius: 14,
              background: COLOR.cardBg,
              textDecoration: "none",
              transition: "background 120ms",
            }}
          >
            <p
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 14,
                color: COLOR.text1,
                marginBottom: 8,
              }}
            >
              {s.name}
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: COLOR.text2, marginBottom: 16 }}>
              {s.description}
            </p>
            <code
              style={{
                display: "inline-block",
                padding: "6px 12px",
                fontSize: 12,
                color: COLOR.accentCyan,
                background: "rgba(93,195,214,0.08)",
                borderRadius: 6,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              {s.install}
            </code>
          </a>
        ))}
      </div>
    </section>
  );
}

function FeatureShowcase() {
  const features: Array<{
    icon: (p: SVGProps<SVGSVGElement>) => JSX.Element;
    color: string;
    title: string;
    desc: string;
    badge: string;
  }> = [
    {
      icon: DatabaseIcon,
      color: COLOR.accentGreen,
      title: "Semantic memory & context",
      desc: "Persistent agent memory backed by graph knowledge, multilingual hybrid search across 100+ languages, and automatic context reconciliation. Your NPCs remember everything and never hallucinate on stale data.",
      badge: "Graph + E2E",
    },
    {
      icon: AutopilotIcon,
      color: COLOR.accentCyan,
      title: "FinOps & budget control",
      desc: "Set token and model budgets, get cost alerts before you overshoot, and let Budget Autopilot pick the cheapest strategy that meets your SLO. Never a surprise bill.",
      badge: "Budget Autopilot",
    },
    {
      icon: ComplianceIcon,
      color: COLOR.accentIndigo,
      title: "EU AI Act & compliance",
      desc: "Built-in RTBF (right to be forgotten), EU AI Act transparency events, and ISO 42001-aligned audit trails. Produce evidence artifacts on demand for regulators and auditors.",
      badge: "Audit-Ready",
    },
    {
      icon: TracingIcon,
      color: COLOR.accentPurple,
      title: "Observability & eval",
      desc: "Every request traced by default. Production-grade evaluation pipelines, regression detection, and failure debugging without bolting on LangSmith or custom logging.",
      badge: "Traces On by Default",
    },
    {
      icon: GovernanceIcon,
      color: COLOR.accentRose,
      title: "Policy engine & governance",
      desc: "OPA-powered policy enforcement, tool approval workflows, and agent registry with key management. Define what NPCs can and cannot do — then enforce it automatically.",
      badge: "OPA-Powered",
    },
    {
      icon: LessGlueIcon,
      color: COLOR.accentYellow,
      title: "One SDK, one bill",
      desc: "Replace LangChain + Pinecone + LangSmith + custom PII filters + OPA sidecar + cost dashboards. Spring and Summer SDKs. One integration, one dashboard, one vendor.",
      badge: "Spring + Summer SDKs",
    },
  ];
  return (
    <section id="features" style={{ background: "rgba(255,255,255,0.015)", padding: "96px 24px", borderTop: `1px solid ${COLOR.border}`, borderBottom: `1px solid ${COLOR.border}` }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <SectionHeader
          eyebrow="Platform capabilities"
          title="Everything an NPC needs, exposed as one SDK."
          subtitle="Memory, policy, observability, finops, compliance — six capabilities, zero glue code."
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, marginTop: 40 }}>
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                style={{
                  position: "relative",
                  padding: "28px 28px 24px",
                  border: `1px solid ${COLOR.border}`,
                  borderRadius: 16,
                  background: COLOR.cardBg,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: `linear-gradient(90deg, ${f.color}, transparent)`,
                  }}
                />
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: `${f.color}22`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 16,
                  }}
                >
                  <Icon width={22} height={22} style={{ color: f.color }} />
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 600, color: COLOR.text1, marginBottom: 10 }}>
                  {f.title}
                </h3>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: COLOR.text2, marginBottom: 16 }}>
                  {f.desc}
                </p>
                <span
                  style={{
                    display: "inline-block",
                    padding: "4px 10px",
                    fontSize: 11,
                    fontWeight: 500,
                    color: f.color,
                    background: `${f.color}1a`,
                    borderRadius: 999,
                    letterSpacing: "0.02em",
                  }}
                >
                  {f.badge}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function McpDeveloperTools() {
  const tools = [
    {
      icon: TerminalIcon,
      title: "MCP server",
      desc: "Drop-in Model Context Protocol server. Wire memory into any tool-use loop without writing glue code.",
      tags: ["Claude Code", "Cursor", "Windsurf", "Copilot", "Cline", "Aider", "Codex"],
    },
    {
      icon: SyncIcon,
      title: "Config sync",
      desc: "Single source of truth for agent rules across editors. CLAUDE.md, AGENTS.md, .cursorrules — all stay in sync.",
      tags: ["CLAUDE.md", "AGENTS.md", ".cursorrules", ".windsurfrules"],
    },
    {
      icon: KeyIcon,
      title: "OAuth device flow",
      desc: "RFC 8628 device authorization. Zero-copy auth from terminal, IDE, or runtime — no API key paste required.",
      tags: ["RFC 8628", "Zero-copy Auth"],
    },
    {
      icon: PlugIcon,
      title: "Auto-context",
      desc: "Auto-detect project, sync agent state via webhooks, surface MCP resources without manual setup.",
      tags: ["Auto-detect", "Webhooks", "MCP Resources"],
    },
  ];
  return (
    <section style={{ padding: "96px 24px", maxWidth: 1100, margin: "0 auto" }}>
      <SectionHeader
        eyebrow="MCP & developer tools"
        title="Built for the MCP era."
        subtitle="One config, every editor. Memory works the same in Claude Code, Cursor, Windsurf, Copilot, and the rest."
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, marginTop: 40 }}>
        {tools.map((t) => {
          const Icon = t.icon;
          return (
            <div
              key={t.title}
              style={{
                padding: "28px",
                border: `1px solid ${COLOR.border}`,
                borderRadius: 16,
                background: COLOR.cardBg,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: `${COLOR.accentCyan}22`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <Icon width={22} height={22} style={{ color: COLOR.accentCyan }} />
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 600, color: COLOR.text1, marginBottom: 10 }}>
                {t.title}
              </h3>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: COLOR.text2, marginBottom: 16 }}>
                {t.desc}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {t.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      padding: "4px 10px",
                      fontSize: 11,
                      color: COLOR.text2,
                      background: "rgba(255,255,255,0.05)",
                      borderRadius: 6,
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 32, textAlign: "center" }}>
        <a
          href="https://www.seizn.com/en/docs/integrations"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 24px",
            fontSize: 14,
            fontWeight: 500,
            color: COLOR.text1,
            background: "rgba(93,195,214,0.1)",
            border: `1px solid ${COLOR.accentCyan}66`,
            borderRadius: 999,
            textDecoration: "none",
          }}
        >
          Set up MCP →
        </a>
      </div>
    </section>
  );
}

function TrustAndCompliance() {
  const items = [
    { icon: SecurityIcon, color: COLOR.accentGreen, title: "Row-level security", desc: "Postgres RLS by default" },
    { icon: ShieldCheckIcon, color: COLOR.accentRose, title: "OWASP-aligned", desc: "Input validation, output filters" },
    { icon: RateLimitIcon, color: COLOR.accentCyan, title: "Rate limits", desc: "Per-key, per-IP, per-route" },
    { icon: AuditIcon, color: COLOR.accentPurple, title: "Audit log", desc: "Every action, replayable" },
    { icon: GlobeIcon, color: COLOR.accentIndigo, title: "EU AI Act", desc: "Transparency events on demand" },
    { icon: ForgetIcon, color: COLOR.accentRose, title: "GDPR & RTBF", desc: "Right-to-be-forgotten built-in" },
    { icon: CertificateIcon, color: COLOR.accentYellow, title: "SOC 2", desc: "Type II in progress" },
    { icon: GovernanceIcon, color: COLOR.accentGreen, title: "ISO 42001", desc: "AI management system aligned" },
  ];
  return (
    <section id="trust" style={{ background: "rgba(255,255,255,0.015)", padding: "80px 24px", borderTop: `1px solid ${COLOR.border}`, borderBottom: `1px solid ${COLOR.border}` }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <SectionHeader
          eyebrow="Trust & compliance"
          title="Production-grade defaults."
          subtitle="The boring parts every game studio asks for, already on day one."
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 40 }}>
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <div
                key={it.title}
                style={{
                  padding: "24px 20px",
                  border: `1px solid ${COLOR.border}`,
                  borderRadius: 14,
                  background: COLOR.cardBg,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 999,
                    background: `${it.color}22`,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 12,
                  }}
                >
                  <Icon width={20} height={20} style={{ color: it.color }} />
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, color: COLOR.text1, marginBottom: 4 }}>{it.title}</p>
                <p style={{ fontSize: 12, color: COLOR.text2, lineHeight: 1.5 }}>{it.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PricingCta() {
  return (
    <section style={{ padding: "120px 24px", textAlign: "center" }}>
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "56px 32px",
          border: `1px solid ${COLOR.border}`,
          borderRadius: 24,
          background: `radial-gradient(ellipse at top, ${COLOR.accentCyan}1a, transparent 60%), ${COLOR.cardBg}`,
        }}
      >
        <p
          style={{
            fontSize: 12,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: COLOR.text3,
            marginBottom: 16,
          }}
        >
          Pricing
        </p>
        <h2
          style={{
            fontSize: "clamp(28px, 4vw, 40px)",
            fontWeight: 600,
            lineHeight: 1.15,
            color: COLOR.text1,
            marginBottom: 16,
          }}
        >
          Pay per entity, not per token surprise.
        </h2>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: COLOR.text2, marginBottom: 32, maxWidth: 540, margin: "0 auto 32px" }}>
          BYOK halves the price and lifts the token cap. Every plan ships with audit
          log, replay archive, and policy engine — no add-on tier required.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
          <a
            href="https://www.seizn.com/en/pricing"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "14px 28px",
              fontSize: 15,
              fontWeight: 500,
              color: COLOR.bg,
              background: `linear-gradient(135deg, ${COLOR.accentCyan}, ${COLOR.accentGreen})`,
              borderRadius: 999,
              textDecoration: "none",
            }}
          >
            See plans & pricing
          </a>
          <a
            href="https://www.seizn.com/en/enterprise"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "14px 28px",
              fontSize: 15,
              fontWeight: 500,
              color: COLOR.text1,
              background: "transparent",
              border: `1px solid ${COLOR.borderStrong}`,
              borderRadius: 999,
              textDecoration: "none",
            }}
          >
            Talk to sales
          </a>
        </div>
      </div>
    </section>
  );
}

function FooterEngine() {
  return (
    <footer
      style={{
        padding: "64px 24px 48px",
        borderTop: `1px solid ${COLOR.border}`,
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 40,
            marginBottom: 48,
          }}
        >
          <div>
            <Link href="/engine" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", marginBottom: 12 }}>
              <Image src="/seizn-engine-logo.png" alt="Seizn Engine" width={28} height={28} style={{ width: 28, height: 28 }} />
              <span style={{ color: COLOR.text1, fontWeight: 600, fontSize: 14 }}>Seizn Engine</span>
            </Link>
            <p style={{ fontSize: 13, color: COLOR.text2, lineHeight: 1.6 }}>
              NPC memory layer for game engines. Built by Litheon LLC.
            </p>
          </div>
          <FooterColumn
            title="SDK"
            links={[
              { label: "@seizn/sdk-js", href: "https://www.npmjs.com/package/@seizn/sdk-js" },
              { label: "@seizn/mcp", href: "https://www.npmjs.com/package/@seizn/mcp" },
              { label: "@seizn/cli", href: "https://www.npmjs.com/package/@seizn/cli" },
              { label: "create-seizn-app", href: "https://www.npmjs.com/package/create-seizn-app" },
            ]}
          />
          <FooterColumn
            title="Resources"
            links={[
              { label: "Docs", href: "https://www.seizn.com/en/docs" },
              { label: "GitHub", href: "https://github.com/litheonhq/seizn" },
              { label: "FAQ", href: "https://www.seizn.com/en/docs/faq" },
              { label: "Pricing", href: "https://www.seizn.com/en/pricing" },
              { label: "Status", href: "https://www.seizn.com/status" },
            ]}
          />
          <FooterColumn
            title="Company"
            links={[
              { label: "Author flagship", href: "https://www.seizn.com" },
              { label: "Privacy", href: "https://www.seizn.com/privacy" },
              { label: "Terms", href: "https://www.seizn.com/terms" },
              { label: "Contact", href: "https://www.seizn.com/refund" },
            ]}
          />
        </div>
        <div
          style={{
            paddingTop: 24,
            borderTop: `1px solid ${COLOR.border}`,
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <p style={{ fontSize: 12, color: COLOR.text3 }}>
            © 2026 Seizn by Litheon LLC · Wyoming · engine.seizn.com
          </p>
          <p style={{ fontSize: 11, color: COLOR.text3, letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Public Beta · 0.9.0-beta.1
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: Array<{ label: string; href: string }> }) {
  return (
    <div>
      <h4
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: COLOR.text1,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          marginBottom: 14,
        }}
      >
        {title}
      </h4>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {links.map((l) => {
          const external = l.href.startsWith("http");
          return (
            <li key={l.label}>
              <Link
                href={l.href}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
                style={{ fontSize: 13, color: COLOR.text2, textDecoration: "none" }}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div style={{ textAlign: "center", maxWidth: 720, margin: "0 auto" }}>
      <p
        style={{
          fontSize: 12,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: COLOR.text3,
          marginBottom: 12,
        }}
      >
        {eyebrow}
      </p>
      <h2
        style={{
          fontSize: "clamp(28px, 4vw, 40px)",
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: "-0.015em",
          color: COLOR.text1,
          marginBottom: 16,
        }}
      >
        {title}
      </h2>
      <p style={{ fontSize: 16, lineHeight: 1.6, color: COLOR.text2 }}>{subtitle}</p>
    </div>
  );
}

// ============================================================================
// Icons
// ============================================================================

function DatabaseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  );
}

function AutopilotIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function ComplianceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function TracingIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function GovernanceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function LessGlueIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
    </svg>
  );
}

function TerminalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function SyncIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function KeyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  );
}

function PlugIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function SecurityIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

function ShieldCheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function RateLimitIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function AuditIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function GlobeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ForgetIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function CertificateIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
}
