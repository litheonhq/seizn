import { ArrowUpRight, Check } from "lucide-react";
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { ENGINE_SURFACE_URL, type AuthorLandingCopy, type AuthorTrackCardCopy } from "./author-landing-copy";
import { SectionHeader } from "./section-header";

export function SectionTracks({ copy, locale }: { copy: AuthorLandingCopy; locale: Locale }) {
  const cards: ReadonlyArray<{ key: "writer" | "developer" | "desktop"; data: AuthorTrackCardCopy; emphasized: boolean }> = [
    { key: "writer", data: copy.tracks.writer, emphasized: false },
    { key: "developer", data: copy.tracks.developer, emphasized: true },
    { key: "desktop", data: copy.tracks.desktop, emphasized: false },
  ];

  return (
    <section className="author-section" style={{ background: "var(--ink-0)" }} data-testid="tracks-splitter">
      <div className="author-shell">
        <SectionHeader title={copy.tracks.title} subtitle={copy.tracks.subtitle} align="left" />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {cards.map(({ key, data, emphasized }) => (
            <TrackCard key={key} testId={key} data={data} locale={locale} emphasized={emphasized} />
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--ink-600)" }}>
          <span>{copy.tracks.engineLink.label}</span>
          <a
            href={ENGINE_SURFACE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline underline-offset-4"
            style={{ color: "var(--ink-900)", textDecorationColor: "var(--ink-300)" }}
          >
            {copy.tracks.engineLink.linkText}
            <ArrowUpRight size={14} strokeWidth={1.7} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}

function TrackCard({ data, locale, emphasized, testId }: { data: AuthorTrackCardCopy; locale: Locale; emphasized: boolean; testId: string }) {
  const href = data.ctaHref.startsWith("http") ? data.ctaHref : `/${locale}${data.ctaHref}`;
  const isExternal = data.ctaHref.startsWith("http");
  const cardStyle = emphasized
    ? { background: "var(--ink-900)", borderColor: "var(--ink-900)", color: "var(--ink-0)" }
    : { background: "var(--ink-0)", borderColor: "var(--ink-100)", color: "var(--ink-900)" };
  const bodyStyle = emphasized ? { color: "oklch(1 0 0 / 0.78)" } : { color: "var(--ink-600)" };
  const badgeStyle = emphasized
    ? { color: "oklch(1 0 0 / 0.7)", letterSpacing: "0.08em" }
    : { color: "var(--ink-500)", letterSpacing: "0.08em" };
  const ctaClass = emphasized
    ? "mt-auto inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--ink-0)] px-4 py-2.5 text-sm font-medium text-[var(--ink-900)] hover:bg-[var(--ink-100)] transition-colors"
    : "mt-auto inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] border px-4 py-2.5 text-sm font-medium hover:bg-[var(--ink-50)] transition-colors";
  const ctaStyle = emphasized ? undefined : { borderColor: "var(--ink-200)", color: "var(--ink-900)" };

  return (
    <article
      className="flex flex-col rounded-[var(--radius-md)] border p-6"
      style={cardStyle}
      data-testid={`track-card-${testId}`}
    >
      <div className="text-xs font-medium uppercase" style={badgeStyle}>
        {data.badge}
      </div>
      <h3 className="mt-3 text-xl font-semibold" style={{ color: emphasized ? "var(--ink-0)" : "var(--ink-900)" }}>
        {data.title}
      </h3>
      <p className="mt-3 text-sm leading-6" style={{ ...bodyStyle, textWrap: "pretty" }}>
        {data.body}
      </p>
      <ul className="mt-5 mb-6 space-y-2">
        {data.bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-2 text-sm leading-6" style={bodyStyle}>
            <Check size={16} strokeWidth={1.8} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0, color: emphasized ? "oklch(1 0 0 / 0.9)" : "var(--ink-900)" }} />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
      {isExternal ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={ctaClass} style={ctaStyle}>
          {data.cta}
          <ArrowUpRight size={14} strokeWidth={1.8} aria-hidden="true" />
        </a>
      ) : (
        <Link href={href} className={ctaClass} style={ctaStyle}>
          {data.cta}
        </Link>
      )}
    </article>
  );
}
