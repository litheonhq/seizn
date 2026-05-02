import type { AuthorLandingCopy } from "./author-landing-copy";
import { SectionHeader } from "./section-header";

export function SectionFAQ({ copy }: { copy: AuthorLandingCopy }) {
  return (
    <section className="author-section" style={{ background: "var(--ink-50)" }}>
      <div className="mx-auto w-full max-w-4xl">
        <SectionHeader eyebrow={copy.faq.eyebrow} title={copy.faq.title} />
        <div className="mt-10 border-t" style={{ borderColor: "var(--ink-200)" }} data-testid="author-faq">
          {copy.faq.items.map((item) => (
            <details key={item.q} className="group border-b py-5" style={{ borderColor: "var(--ink-200)" }}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                <span className="text-base font-medium md:text-lg" style={{ color: "var(--ink-900)" }}>
                  {item.q}
                </span>
                <span className="author-mono text-xl" style={{ color: "var(--ink-500)" }}>
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-3xl text-sm leading-7 md:text-[15px]" style={{ color: "var(--ink-600)", textWrap: "pretty" }}>
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
