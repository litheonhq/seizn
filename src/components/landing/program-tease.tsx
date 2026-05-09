import type { Locale } from "@/i18n/config";
import type { AuthorLandingCopy } from "./author-landing-copy";

export function getProgramWaitlistHref(locale: Locale): string {
  return `/${locale}/pricing#track-3`;
}

export function ProgramTease({ copy, locale }: { copy: AuthorLandingCopy; locale: Locale }) {
  return (
    <div
      className="border-y px-4 py-3 sm:px-6"
      data-testid="program-tease"
      style={{
        background: "var(--bg-elevated)",
        borderColor: "var(--ink-100)",
        color: "var(--text-primary)",
      }}
    >
      <div className="author-shell flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="author-badge"
            style={{
              background: "var(--sev-p2-bg)",
              border: "1px solid var(--sev-p2-border)",
              color: "var(--sev-p2-text)",
            }}
          >
            <span className="author-badge-dot" style={{ color: "var(--signal-canon)" }} />
            {copy.program.badge}
          </span>
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {copy.program.body}
          </span>
        </div>
        <a
          href={getProgramWaitlistHref(locale)}
          className="author-mono rounded-[var(--radius-sm)] border px-3 py-2 text-xs"
          style={{
            borderColor: "var(--ink-200)",
            background: "var(--ink-50)",
            color: "var(--text-primary)",
          }}
        >
          {copy.program.cta} -&gt;
        </a>
      </div>
    </div>
  );
}
