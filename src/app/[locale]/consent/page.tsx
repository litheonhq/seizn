import type { Metadata } from 'next';
import Link from 'next/link';
import { getDictionary } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/config';

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const dict = await getDictionary(locale);

  return {
    title: dict.consent.metadataTitle,
    description: dict.consent.metadataDescription,
  };
}

export default async function ConsentPage({ params }: PageProps) {
  const { locale } = await params;
  const dict = await getDictionary(locale);
  const copy = dict.consent;

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
          <h1 className="szn-serif mt-5 max-w-4xl text-[clamp(40px,6vw,72px)] leading-[1.03] text-szn-text-1">
            {copy.title}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-szn-text-2">{copy.subtitle}</p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-14">
        <form className="grid gap-8 md:grid-cols-[260px_1fr]">
          <label className="text-xl font-semibold text-szn-text-1" htmlFor="subjectId">
            {copy.subjectLabel}
          </label>
          <input
            id="subjectId"
            name="subjectId"
            className="h-12 border border-szn-border-subtle bg-transparent px-4 text-base text-szn-text-1 outline-none transition-colors focus:border-szn-signal"
            placeholder={copy.subjectPlaceholder}
          />

          <h2 className="text-xl font-semibold text-szn-text-1">{copy.ageTitle}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {copy.ageOptions.map((option) => (
              <label key={option.value} className="flex items-center gap-3 border border-szn-border-subtle px-4 py-3">
                <input type="radio" name="ageBracket" value={option.value} className="h-4 w-4 accent-szn-signal" />
                <span className="text-sm text-szn-text-2">{option.label}</span>
              </label>
            ))}
          </div>

          <h2 className="text-xl font-semibold text-szn-text-1">{copy.scopesTitle}</h2>
          <div className="space-y-3">
            {copy.scopes.map((scope) => (
              <label key={scope.value} className="flex items-start gap-3 border border-szn-border-subtle px-4 py-3">
                <input type="checkbox" name="scopes" value={scope.value} className="mt-1 h-4 w-4 accent-szn-signal" />
                <span>
                  <span className="block text-sm font-medium text-szn-text-1">{scope.label}</span>
                  <span className="mt-1 block text-sm leading-6 text-szn-text-2">{scope.description}</span>
                </span>
              </label>
            ))}
          </div>

          <div />
          <button
            type="submit"
            className="h-12 w-fit border border-szn-signal px-5 text-sm font-semibold text-szn-text-1 transition-colors hover:bg-szn-signal hover:text-szn-bg"
          >
            {copy.submit}
          </button>
        </form>
      </section>
    </main>
  );
}
