import { ENGINE_SURFACE_URL, type AuthorLandingCopy } from "./author-landing-copy";

export function EngineTease({ copy }: { copy: AuthorLandingCopy }) {
  return (
    <div
      className="border-y px-4 py-3 sm:px-6"
      data-testid="engine-tease"
      style={{ background: "var(--ink-800)", borderColor: "oklch(1 0 0 / 0.08)", color: "oklch(1 0 0 / 0.86)" }}
    >
      <div className="author-shell flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="author-badge"
            style={{ background: "oklch(1 0 0 / 0.08)", border: "1px solid oklch(1 0 0 / 0.12)", color: "var(--ink-0)" }}
          >
            <span className="author-badge-dot" style={{ color: "var(--signal-canon)" }} />
            {copy.engine.badge}
          </span>
          <span className="text-sm" style={{ color: "oklch(1 0 0 / 0.78)" }}>
            {copy.engine.body}
          </span>
        </div>
        <a
          href={ENGINE_SURFACE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="author-mono rounded-[var(--radius-sm)] border px-3 py-2 text-xs"
          style={{ borderColor: "oklch(1 0 0 / 0.12)", background: "oklch(1 0 0 / 0.06)", color: "var(--ink-0)" }}
        >
          {copy.engine.cta} -&gt;
        </a>
      </div>
    </div>
  );
}
