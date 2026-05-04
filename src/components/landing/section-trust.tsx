import { Archive, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import type { AuthorLandingCopy } from "./author-landing-copy";
import { SectionHeader } from "./section-header";

const ICONS = {
  lock: LockKeyhole,
  key: KeyRound,
  archive: Archive,
  shield: ShieldCheck,
} as const;

export function SectionTrust({ copy }: { copy: AuthorLandingCopy }) {
  return (
    <section className="author-section" style={{ background: "var(--ink-50)" }}>
      <div className="author-shell">
        <SectionHeader eyebrow={copy.trust.eyebrow} title={copy.trust.title} subtitle={copy.trust.subtitle} align="left" />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="trust-glyphs">
          {copy.trust.items.map((item) => {
            const Icon = ICONS[item.icon];
            return (
              <article key={item.title} className="rounded-[var(--radius-md)] border p-5" style={{ borderColor: "var(--ink-100)", background: "var(--ink-0)" }}>
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)]" style={{ background: "var(--ink-50)", color: "var(--ink-700)" }}>
                  <Icon size={21} strokeWidth={1.7} aria-hidden="true" />
                </div>
                <h3 className="text-base font-medium" style={{ color: "var(--ink-900)" }}>
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6" style={{ color: "var(--ink-600)", textWrap: "pretty" }}>
                  {item.body}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
