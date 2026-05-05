import { Arrow, Btn, Pill, SeasonRow } from "./atoms";
import { HeroGraph } from "./hero-graph";

export function Hero() {
  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        borderBottom: "1px solid var(--engine-line-soft)",
        background: "var(--engine-bg-base)",
        color: "var(--engine-text-base)",
      }}
    >
      <div
        className="engine-grid-backdrop"
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.4,
          maskImage: "radial-gradient(ellipse at 70% 40%, black 30%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at 70% 40%, black 30%, transparent 70%)",
        }}
      />
      <div
        style={{
          position: "relative",
          maxWidth: 1280,
          margin: "0 auto",
          padding: "calc(96px * var(--engine-rhythm)) 56px calc(72px * var(--engine-rhythm))",
          display: "grid",
          gridTemplateColumns: "1.05fr 0.95fr",
          gap: 56,
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
            <Pill tone="violet">Memory infrastructure · v1</Pill>
            <Pill tone="muted">engine.seizn.com · live</Pill>
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 72,
              lineHeight: 0.98,
              fontWeight: 600,
              letterSpacing: "-0.035em",
              color: "var(--engine-text-strong)",
            }}
          >
            NPCs that remember
            <br />
            <span style={{ color: "var(--engine-text-muted)" }}>across </span>
            <span
              style={{
                background: "linear-gradient(95deg, var(--engine-violet-soft), var(--engine-cyan))",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              generations.
            </span>
          </h1>
          <p
            style={{
              margin: "28px 0 0",
              fontSize: 17,
              lineHeight: 1.6,
              color: "var(--engine-text-muted)",
              maxWidth: 540,
            }}
          >
            Memory infrastructure for game NPCs. A drop-in SDK on top of Inworld, Convai, NVIDIA ACE, or your own runtime — replay every memory, audit every decision, cap every budget.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 36 }}>
            <Btn variant="primary" icon={<Arrow />} href="mailto:hello@seizn.com?subject=Engine%20demo%20request">
              Book a 30-min demo
            </Btn>
            <Btn variant="secondary" icon={<Arrow />} href="#playground">
              Try the playground
            </Btn>
          </div>
          <div style={{ marginTop: 56 }}>
            <div
              className="engine-mono"
              style={{
                fontSize: 10.5,
                color: "var(--engine-text-dim)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                marginBottom: 14,
              }}
            >
              Built on the four-tier memory layer
            </div>
            <SeasonRow />
          </div>
        </div>
        <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
          <div
            style={{
              position: "absolute",
              inset: -40,
              background: "radial-gradient(circle at center, rgba(124,58,237,0.20), transparent 60%)",
              filter: "blur(40px)",
            }}
          />
          <div
            style={{
              position: "relative",
              border: "1px solid var(--engine-line)",
              borderRadius: 16,
              background: "var(--engine-bg-card)",
              padding: 18,
              boxShadow: "0 30px 80px -40px rgba(124,58,237,0.4)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span
                className="engine-mono"
                style={{ fontSize: 10, color: "var(--engine-text-dim)", letterSpacing: "0.10em", textTransform: "uppercase" }}
              >
                npc:vale · memory.graph
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 99,
                    background: "var(--engine-live)",
                    boxShadow: "0 0 8px var(--engine-live)",
                  }}
                />
                <span className="engine-mono" style={{ fontSize: 10, color: "var(--engine-text-muted)", letterSpacing: "0.06em" }}>
                  streaming
                </span>
              </span>
            </div>
            <HeroGraph accent="violet" mode="graph" width={520} height={440} />
            <div className="engine-mono" style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
              <span style={{ fontSize: 10, color: "var(--engine-text-dim)" }}>4 tiers · 23 entities · 84 events</span>
              <span style={{ fontSize: 10, color: "var(--engine-cyan)" }}>+ 2.3k recalls / s</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
