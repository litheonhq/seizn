import { Section } from "./atoms";
import { Playground } from "./playground";

export function PlaygroundSection() {
  return (
    <Section id="playground" eyebrow="Live playground · Archivist Vale">
      <div className="engine-section-heading-row" style={{ display: "flex", alignItems: "end", justifyContent: "space-between", marginBottom: 28, gap: 24 }}>
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
            Talk to a librarian who
            <br />
            <span style={{ color: "var(--engine-text-muted)" }}>actually remembers you.</span>
          </h2>
        </div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--engine-text-muted)", maxWidth: 380 }}>
          Send a message. Watch every memory write land in the right tier. Jump to{" "}
          <span className="engine-mono" style={{ color: "var(--engine-cyan)" }}>Day 14</span> and watch Vale recall the Voynich Manuscript on her own.
        </p>
      </div>
      <Playground accent="violet" />
    </Section>
  );
}
