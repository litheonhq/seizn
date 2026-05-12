import { Section } from "./atoms";

export function RuntimeRow() {
  const runtimes = [
    { name: "Runtime A", sub: "character agents" },
    { name: "Runtime B", sub: "voice + dialogue" },
    { name: "Runtime C", sub: "GPU-resident NPCs" },
    { name: "Your runtime", sub: "custom LLM + state", own: true },
  ];
  return (
    <Section eyebrow="Complement, never replace">
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 32, maxWidth: 980, margin: "0 auto" }}>
        <h2
          style={{
            margin: 0,
            fontSize: 38,
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            color: "var(--engine-text-strong)",
            textAlign: "center",
          }}
        >
          Don&apos;t change your game runtime.
          <br />
          <span style={{ color: "var(--engine-text-muted)" }}>Layer Seizn Engine on top.</span>
        </h2>
        <p
          style={{
            margin: "0 auto",
            maxWidth: 600,
            textAlign: "center",
            color: "var(--engine-text-muted)",
            fontSize: 15,
            lineHeight: 1.6,
          }}
        >
          Seizn is a memory layer, not a character runtime. Keep the agents you&apos;ve already chosen — we give them persistent, replayable, auditable memory.
        </p>
        <div className="engine-runtime-card-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {runtimes.map((r) => (
            <div
              key={r.name}
              style={{
                padding: "20px 18px",
                border: `1px ${r.own ? "dashed" : "solid"} var(--engine-line-bright)`,
                borderRadius: 10,
                background: "var(--engine-bg-card)",
              }}
            >
              <div
                className="engine-mono"
                style={{
                  fontSize: 11,
                  color: r.own ? "var(--engine-cyan)" : "var(--engine-text-strong)",
                  letterSpacing: "0.04em",
                  marginBottom: 6,
                }}
              >
                {r.name}
              </div>
              <div className="engine-mono" style={{ fontSize: 10.5, color: "var(--engine-text-dim)", letterSpacing: "0.04em" }}>
                {r.sub}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", placeItems: "center", height: 64, position: "relative" }}>
          <div style={{ width: 1, height: 64, background: "linear-gradient(to bottom, transparent, var(--engine-violet))" }} />
          <div style={{ position: "absolute", bottom: -2, color: "var(--engine-violet)", fontSize: 16 }}>▼</div>
        </div>
        <div
          className="engine-runtime-summary"
          style={{
            padding: "26px 28px",
            border: "1px solid rgba(124,58,237,0.45)",
            borderRadius: 12,
            background: "linear-gradient(180deg, rgba(124,58,237,0.08), rgba(34,211,238,0.04))",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 0 60px -20px rgba(124,58,237,0.5)",
          }}
        >
          <div>
            <div
              className="engine-mono"
              style={{
                fontSize: 11,
                color: "var(--engine-violet-soft)",
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              Seizn Engine
            </div>
            <div style={{ fontSize: 18, color: "var(--engine-text-strong)", fontWeight: 500 }}>
              Persistent memory · replay · audit · budget
            </div>
          </div>
          <span className="engine-mono" style={{ fontSize: 11, color: "var(--engine-cyan)", letterSpacing: "0.06em" }}>
            SDK · 30 min · TS / Py / cURL / C#
          </span>
        </div>
      </div>
    </Section>
  );
}
