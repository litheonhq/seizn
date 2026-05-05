"use client";

import { useState, type ReactNode } from "react";
import { Arrow, Pill, Section, StatusDot } from "./atoms";

function WedgeCard({
  index,
  eyebrow,
  title,
  body,
  children,
}: {
  index: number;
  eyebrow: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <article
      style={{
        position: "relative",
        background: "var(--engine-bg-card)",
        border: "1px solid var(--engine-line)",
        borderRadius: 14,
        padding: 28,
        display: "flex",
        flexDirection: "column",
        gap: 18,
        overflow: "hidden",
        transition: "border-color 200ms ease, transform 200ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="engine-mono" style={{ fontSize: 11, color: "var(--engine-text-dim)", letterSpacing: "0.14em" }}>
          {String(index).padStart(2, "0")} · {eyebrow}
        </span>
        <Pill tone="violet">wedge</Pill>
      </div>
      <h3
        style={{
          margin: 0,
          fontSize: 22,
          fontWeight: 600,
          lineHeight: 1.2,
          color: "var(--engine-text-strong)",
          letterSpacing: "-0.015em",
        }}
      >
        {title}
      </h3>
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: "var(--engine-text-muted)" }}>{body}</p>
      <div style={{ marginTop: "auto" }}>{children}</div>
      <span
        className="engine-mono"
        style={{
          fontSize: 11,
          color: "var(--engine-cyan)",
          letterSpacing: "0.06em",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        Learn more <Arrow />
      </span>
    </article>
  );
}

function ReplayViz() {
  const [t, setT] = useState(7);
  const events = [
    { d: 1, label: "met_player" },
    { d: 3, label: "topic.shift" },
    { d: 7, label: "ToM.update" },
    { d: 11, label: "decay.fall" },
    { d: 14, label: "recall" },
  ];
  return (
    <div style={{ background: "var(--engine-bg-sunken)", border: "1px solid var(--engine-line)", borderRadius: 10, padding: 14 }}>
      <div
        className="engine-mono"
        style={{
          fontSize: 10,
          color: "var(--engine-text-dim)",
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        timeline.scrub(npc:vale)
      </div>
      <div style={{ position: "relative", height: 36, marginBottom: 10 }}>
        <div style={{ position: "absolute", top: 17, left: 0, right: 0, height: 1, background: "var(--engine-line-bright)" }} />
        {events.map((e) => (
          <div key={e.d} style={{ position: "absolute", left: `${(e.d / 14) * 100}%`, top: 12, transform: "translateX(-50%)" }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 99,
                background: e.d <= t ? "var(--engine-cyan)" : "var(--engine-line-bright)",
                display: "block",
                boxShadow: e.d === t ? "0 0 12px var(--engine-cyan)" : "none",
              }}
            />
          </div>
        ))}
      </div>
      <input
        type="range"
        min={1}
        max={14}
        value={t}
        onChange={(e) => setT(parseInt(e.target.value, 10))}
        style={{ width: "100%", accentColor: "var(--engine-violet)" }}
        aria-label="scrub timeline"
      />
      <div className="engine-mono" style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span style={{ fontSize: 10, color: "var(--engine-text-dim)" }}>day 1</span>
        <span style={{ fontSize: 10, color: "var(--engine-cyan)" }}>
          day {t} · {events.filter((e) => e.d <= t).length} events replayed
        </span>
        <span style={{ fontSize: 10, color: "var(--engine-text-dim)" }}>day 14</span>
      </div>
    </div>
  );
}

function ComplianceViz() {
  const items: Array<{ k: string; v: string; tone: "live" | "progress" | "roadmap" }> = [
    { k: "SOC 2 Type II", v: "In progress · Q3 2026", tone: "progress" },
    { k: "GDPR / DSR API", v: "Live", tone: "live" },
    { k: "PIPA (KR/JP/CN)", v: "Live", tone: "live" },
    { k: "Audit hash chain", v: "Live · sha256", tone: "live" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((i) => (
        <div
          key={i.k}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "9px 12px",
            border: "1px solid var(--engine-line)",
            borderRadius: 6,
            background: "var(--engine-bg-sunken)",
          }}
        >
          <span className="engine-mono" style={{ fontSize: 11.5, color: "var(--engine-text-strong)", letterSpacing: "-0.005em" }}>
            {i.k}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <StatusDot tone={i.tone} />
            <span className="engine-mono" style={{ fontSize: 10.5, color: "var(--engine-text-muted)", letterSpacing: "0.04em" }}>
              {i.v}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function BudgetViz() {
  const used = 0.62;
  return (
    <div style={{ background: "var(--engine-bg-sunken)", border: "1px solid var(--engine-line)", borderRadius: 10, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span
          className="engine-mono"
          style={{ fontSize: 10, color: "var(--engine-text-dim)", letterSpacing: "0.10em", textTransform: "uppercase" }}
        >
          budget.cap(npc:vale)
        </span>
        <span className="engine-mono" style={{ fontSize: 11, color: "var(--engine-text-strong)" }}>$4,820 / $7,800</span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: "var(--engine-line)", overflow: "hidden" }}>
        <div
          style={{
            width: `${used * 100}%`,
            height: "100%",
            background: "linear-gradient(90deg, var(--engine-cyan), var(--engine-violet))",
          }}
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 14 }}>
        {[
          { label: "entities", v: "12,408" },
          { label: "events / mo", v: "1.84M" },
          { label: "$ / event", v: "$0.0026" },
        ].map((s) => (
          <div key={s.label}>
            <div
              className="engine-mono"
              style={{
                fontSize: 9.5,
                color: "var(--engine-text-dim)",
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              {s.label}
            </div>
            <div className="engine-mono" style={{ fontSize: 14, color: "var(--engine-text-strong)" }}>{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Wedges() {
  return (
    <Section eyebrow="Three wedges · why teams choose Seizn">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
        <WedgeCard
          index={1}
          eyebrow="Replay"
          title="Deterministic replay across NPCs and sessions."
          body="Every memory write, decision, and recall is reproducible. When a player reports an NPC went off the rails on Tuesday, you replay that exact frame and step through the trace."
        >
          <ReplayViz />
        </WedgeCard>
        <WedgeCard
          index={2}
          eyebrow="Compliance"
          title="Ship to global stores without legal back-and-forth."
          body="GDPR / DSR APIs are live today. SOC 2 Type II is in progress for Q3 2026. Every memory mutation is hash-chained for tamper-evident audit."
        >
          <ComplianceViz />
        </WedgeCard>
        <WedgeCard
          index={3}
          eyebrow="Budget"
          title="Per-entity, per-event pricing — never per-token."
          body="NPC traffic is bursty and unpredictable. Cap any entity, any session, any player. Watch real-time spend in dashboards your finance team will actually trust."
        >
          <BudgetViz />
        </WedgeCard>
      </div>
    </Section>
  );
}
