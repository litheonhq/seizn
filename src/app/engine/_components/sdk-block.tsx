import { Arrow, Btn, Section } from "./atoms";
import { SnippetTabs } from "./snippet-tabs";

const SPECS = [
  { k: "Latency",   v: "p50 12ms · p99 38ms" },
  { k: "Languages", v: "TypeScript · Python · cURL · C# / Unity" },
  { k: "Regions",   v: "us-east · ap-northeast (Seoul) · eu (Q3)" },
];

export function SDKBlock() {
  return (
    <Section eyebrow="30-second integration">
      <div className="engine-sdk-grid" style={{ display: "grid", gridTemplateColumns: "0.85fr 1.15fr", gap: 56, alignItems: "start" }}>
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 38,
              fontWeight: 600,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              color: "var(--engine-text-strong)",
            }}
          >
            Two functions.
            <br />
            <span style={{ color: "var(--engine-text-muted)" }}>One API key.</span>
          </h2>
          <p style={{ margin: "20px 0 0", fontSize: 15, lineHeight: 1.65, color: "var(--engine-text-muted)" }}>
            <code className="engine-mono" style={{ color: "var(--engine-violet-soft)", fontSize: 13.5 }}>
              seizn.remember()
            </code>{" "}
            writes an event onto an entity.{" "}
            <code className="engine-mono" style={{ color: "var(--engine-cyan)", fontSize: 13.5 }}>
              seizn.recall()
            </code>{" "}
            returns what that entity knows about another, ranked by recency, salience, and decay.
          </p>
          <p style={{ margin: "16px 0 0", fontSize: 15, lineHeight: 1.65, color: "var(--engine-text-muted)" }}>
            The four-tier memory layer (Spring · Summer · Fall · Winter) handles consolidation, decay, and retrieval automatically. Your engineers stay focused on the game.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
            {SPECS.map((s) => (
              <div
                key={s.k}
                className="engine-sdk-spec-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr",
                  gap: 8,
                  paddingBottom: 10,
                  borderBottom: "1px solid var(--engine-line)",
                }}
              >
                <span
                  className="engine-mono"
                  style={{
                    fontSize: 11,
                    color: "var(--engine-text-dim)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  {s.k}
                </span>
                <span className="engine-mono" style={{ fontSize: 12.5, color: "var(--engine-text-strong)" }}>
                  {s.v}
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 24 }}>
            <Btn variant="cyan" href="https://www.seizn.com/en/docs" icon={<Arrow />}>
              Read the docs
            </Btn>
          </div>
        </div>
        <SnippetTabs />
      </div>
    </Section>
  );
}
