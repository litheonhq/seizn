import type { SaebyeokDemoData } from "@/lib/sample-ip-demo";
import type { AuthorLandingCopy } from "./author-landing-copy";
import { CanonGraph } from "./canon-graph";
import { SectionHeader } from "./section-header";

const SEVERITY_STYLE = {
  critical: { bg: "var(--signal-conflict)", soft: "oklch(0.40 0.18 27)", label: "critical" },
  major: { bg: "var(--signal-pending)", soft: "oklch(0.45 0.13 75)", label: "major" },
  minor: { bg: "oklch(0.65 0.10 200)", soft: "oklch(0.40 0.08 220)", label: "minor" },
} as const;

export function SectionConflicts({ copy, data }: { copy: AuthorLandingCopy; data: SaebyeokDemoData }) {
  return (
    <section className="author-section" style={{ background: "var(--ink-900)", color: "var(--ink-0)" }}>
      <div className="author-shell">
        <SectionHeader
          eyebrow={copy.conflicts.eyebrow}
          title={copy.conflicts.title}
          subtitle={copy.conflicts.subtitle}
          tone="dark"
          align="left"
        />
        <div className="mt-12 grid gap-9 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="grid gap-3" data-testid="severity-cards">
            {copy.conflicts.items.map((item) => (
              <ConflictCard key={`${item.severity}-${item.rule}`} item={item} />
            ))}
          </div>
          <div className="lg:sticky lg:top-6">
            <CanonGraph data={data} tone="dark" />
            <p className="mt-4 text-sm leading-6" style={{ color: "oklch(1 0 0 / 0.62)" }}>
              {copy.conflicts.graphNote}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ConflictCard({ item }: { item: AuthorLandingCopy["conflicts"]["items"][number] }) {
  const severity = SEVERITY_STYLE[item.severity];

  return (
    <article
      className="rounded-[var(--radius-md)] border border-l-[3px] p-5"
      style={{
        background: "var(--ink-800)",
        borderColor: "oklch(1 0 0 / 0.08)",
        borderLeftColor: severity.bg,
      }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <span
          className="author-badge"
          style={{ background: severity.soft, color: "var(--ink-0)" }}
        >
          {severity.label}
        </span>
        <span className="author-mono text-[11px]" style={{ color: "oklch(1 0 0 / 0.58)" }}>
          {item.rule}
        </span>
      </div>
      <h3 className="text-base leading-6" style={{ color: "var(--ink-0)" }}>
        {item.fact}
      </h3>
      <p className="mt-2 text-sm leading-6" style={{ color: "oklch(1 0 0 / 0.66)" }}>
        {item.against}
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {item.cited.map((id) => (
          <span
            key={id}
            className="author-mono rounded border px-2 py-1 text-[10px]"
            style={{ borderColor: "oklch(1 0 0 / 0.08)", background: "oklch(1 0 0 / 0.06)", color: "oklch(1 0 0 / 0.70)" }}
          >
            ref {id}
          </span>
        ))}
      </div>
    </article>
  );
}
