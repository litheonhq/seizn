import type { AuthorLandingCopy } from "./author-landing-copy";
import { SectionHeader } from "./section-header";

export function SectionWorkflow({ copy }: { copy: AuthorLandingCopy }) {
  return (
    <section id="workflow" className="author-section" style={{ background: "var(--ink-0)" }}>
      <div className="author-shell">
        <SectionHeader eyebrow={copy.workflow.eyebrow} title={copy.workflow.title} subtitle={copy.workflow.subtitle} />
        <div className="relative mt-12 lg:mt-14" data-testid="workflow-steps">
          <div className="absolute left-[8.3%] right-[8.3%] top-8 hidden h-px lg:block" style={{ background: "var(--ink-200)" }}>
            <span className="absolute -top-1 left-0 h-2 w-2 rounded-full" style={{ background: "var(--ink-300)" }} />
            <span className="absolute -top-1 right-0 h-2 w-2 rounded-full" style={{ background: "var(--ink-300)" }} />
          </div>
          <div className="grid gap-9 lg:grid-cols-3 lg:gap-8">
            {copy.workflow.steps.map((step) => (
              <article key={step.number} className="relative text-left lg:text-center">
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full border author-mono text-sm font-medium lg:mx-auto"
                  style={{ borderColor: "var(--ink-200)", background: "var(--ink-0)", color: "var(--ink-700)", boxShadow: "0 0 0 6px var(--ink-0)" }}
                >
                  {step.number}
                </div>
                <div className="mt-6">
                  <h3 className="author-serif text-3xl" style={{ color: "var(--ink-900)" }}>
                    {step.title}
                  </h3>
                  <p className="author-mono mt-2 text-xs" style={{ color: "var(--signal-canon-ink)" }}>
                    {step.subtitle}
                  </p>
                </div>
                <p className="mt-4 max-w-sm text-sm leading-6 lg:mx-auto" style={{ color: "var(--ink-600)", textWrap: "pretty" }}>
                  {step.body}
                </p>
                <div className="mt-5 flex flex-wrap gap-1.5 lg:justify-center">
                  {step.chips.map((chip) => (
                    <span
                      key={chip}
                      className="author-mono rounded-full border px-2.5 py-1 text-[11px]"
                      style={{ borderColor: "var(--ink-100)", background: "var(--ink-50)", color: "var(--ink-600)" }}
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
