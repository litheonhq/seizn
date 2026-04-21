import type { Metadata } from "next";
import Link from "next/link";
import { getDictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const dict = await getDictionary(locale);

  return {
    title: dict.sla.metadataTitle,
    description: dict.sla.metadataDescription,
  };
}

export default async function SlaPage({ params }: PageProps) {
  const { locale } = await params;
  const dict = await getDictionary(locale);
  const copy = dict.sla;

  return (
    <main className="min-h-screen bg-szn-bg text-szn-text-1">
      <section className="border-b border-szn-border-subtle">
        <div className="mx-auto max-w-5xl px-6 py-20 md:py-28">
          <Link
            href={`/${locale}`}
            className="text-sm font-medium text-szn-text-2 transition-colors hover:text-szn-text-1"
          >
            Seizn
          </Link>
          <p className="szn-section-number mt-12">{copy.eyebrow}</p>
          <h1 className="szn-serif mt-5 max-w-4xl text-[clamp(42px,7vw,78px)] leading-[1.03] text-szn-text-1">
            {copy.title}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-szn-text-2">{copy.subtitle}</p>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-6 py-14 md:grid-cols-[260px_1fr]">
        <h2 className="text-xl font-semibold text-szn-text-1">{copy.scopeTitle}</h2>
        <p className="text-base leading-8 text-szn-text-2">{copy.scopeBody}</p>

        <h2 className="text-xl font-semibold text-szn-text-1">{copy.uptimeTitle}</h2>
        <p className="text-base leading-8 text-szn-text-2">{copy.uptimeBody}</p>

        <h2 className="text-xl font-semibold text-szn-text-1">{copy.measurementTitle}</h2>
        <p className="text-base leading-8 text-szn-text-2">{copy.measurementBody}</p>

        <h2 className="text-xl font-semibold text-szn-text-1">{copy.creditsTitle}</h2>
        <div className="space-y-3">
          {copy.credits.map((credit) => (
            <div key={credit.threshold} className="border-l-2 border-szn-signal px-4 py-1">
              <p className="font-mono text-sm text-szn-text-1">{credit.threshold}</p>
              <p className="mt-1 text-sm leading-6 text-szn-text-2">{credit.description}</p>
            </div>
          ))}
        </div>

        <h2 className="text-xl font-semibold text-szn-text-1">{copy.exclusionsTitle}</h2>
        <ul className="space-y-3 text-base leading-8 text-szn-text-2">
          {copy.exclusions.map((item) => (
            <li key={item} className="flex gap-3">
              <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-szn-signal" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <h2 className="text-xl font-semibold text-szn-text-1">{copy.claimTitle}</h2>
        <p className="text-base leading-8 text-szn-text-2">
          {copy.claimBody}{" "}
          <a className="text-szn-signal transition-colors hover:text-szn-text-1" href="mailto:sla@seizn.com">
            sla@seizn.com
          </a>
          .
        </p>

        <h2 className="text-xl font-semibold text-szn-text-1">{copy.incidentsTitle}</h2>
        <p className="text-base leading-8 text-szn-text-2">
          {copy.incidentsBody}{" "}
          <Link className="text-szn-signal transition-colors hover:text-szn-text-1" href={`/${locale}/status`}>
            {copy.statusLink}
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
