import type { AuthorLandingCopy } from "./author-landing-copy";
import { SectionHeader } from "./section-header";

export function SectionSimulation({ copy }: { copy: AuthorLandingCopy }) {
  return (
    <section className="author-section" style={{ background: "var(--ink-0)" }}>
      <div className="author-shell">
        <SectionHeader eyebrow={copy.simulation.eyebrow} title={copy.simulation.title} subtitle={copy.simulation.subtitle} align="left" />
        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          {copy.simulation.candidates.map((candidate) => (
            <CandidateCard key={candidate.side} candidate={candidate} />
          ))}
        </div>
        <TokenPreview copy={copy} />
      </div>
    </section>
  );
}

function CandidateCard({ candidate }: { candidate: AuthorLandingCopy["simulation"]["candidates"][number] }) {
  const safe = candidate.side === "safe";
  const accent = safe ? "var(--signal-canon)" : "var(--signal-conflict)";
  const soft = safe ? "var(--signal-canon-soft)" : "var(--signal-conflict-soft)";
  const ink = safe ? "var(--signal-canon-ink)" : "var(--signal-conflict-ink)";

  return (
    <article className="rounded-[var(--radius-lg)] border p-6" style={{ borderColor: "var(--ink-100)", background: "var(--ink-0)", boxShadow: "var(--shadow-sm)" }}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <span className="author-badge" style={{ background: soft, color: ink }}>
          <span className="author-badge-dot" />
          {candidate.label}
        </span>
        <span className="author-mono text-[11px]" style={{ color: "var(--ink-500)" }}>
          continuity {candidate.score}%
        </span>
      </div>
      <div className="mb-5 h-1 overflow-hidden rounded-full" style={{ background: "var(--ink-100)" }}>
        <div className="h-full rounded-full" style={{ width: `${candidate.score}%`, background: accent }} />
      </div>
      <h3 className="author-serif text-[22px]" style={{ color: "var(--ink-900)" }}>
        {candidate.title}
      </h3>
      <p className="mt-3 text-sm leading-6" style={{ color: "var(--ink-600)", textWrap: "pretty" }}>
        {candidate.body}
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {candidate.tokens.map((token) => (
          <span key={token} className="author-mono rounded border px-2 py-1 text-[10px]" style={{ borderColor: "var(--ink-100)", background: "var(--ink-50)", color: "var(--ink-700)" }}>
            {token}
          </span>
        ))}
      </div>
    </article>
  );
}

function TokenPreview({ copy }: { copy: AuthorLandingCopy }) {
  return (
    <div className="mt-8 rounded-[var(--radius-lg)] p-5 md:p-6" style={{ background: "var(--ink-900)", color: "var(--ink-0)" }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="author-mono text-xs" style={{ color: "oklch(1 0 0 / 0.62)" }}>
          {copy.simulation.tokenDiff}
        </span>
        <span className="author-badge" style={{ background: "var(--signal-canon-soft)", color: "var(--signal-canon-ink)" }}>
          {copy.simulation.replayReady}
        </span>
      </div>
      <div className="author-mono text-[13px] leading-7" style={{ color: "oklch(1 0 0 / 0.90)" }}>
        <p>
          <span style={{ color: "oklch(1 0 0 / 0.48)" }}>14:</span> Mira climbed the rooftop on day{" "}
          <span className="rounded px-1" style={{ background: "oklch(0.60 0.21 27 / 0.18)", color: "var(--signal-conflict)" }}>
            9
          </span>{" "}
          <span style={{ color: "oklch(1 0 0 / 0.64)" }}>{"// proposed"}</span>
        </p>
        <p>
          <span style={{ color: "oklch(1 0 0 / 0.48)" }}>14:</span> Mira climbed the rooftop on day{" "}
          <span className="rounded px-1" style={{ background: "oklch(0.62 0.16 148 / 0.16)", color: "var(--signal-canon)" }}>
            14
          </span>{" "}
          <span style={{ color: "oklch(1 0 0 / 0.64)" }}>{"// safe rewrite"}</span>
        </p>
      </div>
    </div>
  );
}
