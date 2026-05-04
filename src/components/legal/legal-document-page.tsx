import Link from "next/link";
import ReactMarkdown from "react-markdown";
import {
  LEGAL_DOCUMENTS,
  getLegalDocumentLabels,
  getLegalPath,
  resolveLegalMarkdownHref,
} from "@/lib/legal-routes";
import type { LegalDocument } from "@/lib/legal-docs";

interface LegalDocumentPageProps {
  document: LegalDocument;
  copy: {
    eyebrow: string;
    title: string;
    subtitle: string;
    backHome: string;
    draftNotice: string;
  };
}

export function LegalDocumentPage({ document, copy }: LegalDocumentPageProps) {
  const routeLocale = document.requestedLocale;
  const documentLabels = getLegalDocumentLabels(routeLocale);

  return (
    <main className="min-h-screen bg-[var(--ink-50)] text-[var(--ink-900)]">
      <section className="border-b border-[var(--ink-200)] bg-[var(--ink-0)]">
        <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
          <Link href={`/${routeLocale}`} className="text-sm font-medium text-[var(--ink-900)] hover:underline">
            {copy.backHome}
          </Link>
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-[var(--ink-900)]">{copy.eyebrow}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">{document.title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ink-600)]">{copy.subtitle}</p>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Legal documents">
            {LEGAL_DOCUMENTS.map((slug) => (
              <LegalNavLink
                key={slug}
                label={documentLabels[slug]}
                active={slug === document.slug}
                href={getLegalPath(routeLocale, slug)}
              />
            ))}
          </nav>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-6 rounded-lg border border-[var(--signal-pending)] bg-[var(--signal-pending-soft)] px-4 py-3 text-sm text-[var(--signal-pending-ink)]">
          {copy.draftNotice}
        </div>
        <article className="rounded-lg border border-[var(--ink-200)] bg-white p-6 shadow-sm md:p-8">
          <ReactMarkdown
            components={{
              h1: ({ children }) => <h2 className="mb-4 text-2xl font-semibold text-[var(--ink-900)]">{children}</h2>,
              h2: ({ children }) => <h3 className="mb-3 mt-8 text-xl font-semibold text-[var(--ink-900)]">{children}</h3>,
              h3: ({ children }) => <h4 className="mb-2 mt-6 text-base font-semibold text-[var(--ink-900)]">{children}</h4>,
              p: ({ children }) => <p className="my-4 text-sm leading-7 text-[var(--ink-600)]">{children}</p>,
              ul: ({ children }) => <ul className="my-4 list-disc space-y-2 pl-6 text-sm leading-7 text-[var(--ink-600)]">{children}</ul>,
              ol: ({ children }) => <ol className="my-4 list-decimal space-y-2 pl-6 text-sm leading-7 text-[var(--ink-600)]">{children}</ol>,
              li: ({ children }) => <li>{children}</li>,
              blockquote: ({ children }) => (
                <blockquote className="my-5 border-l-4 border-[var(--ink-900)] bg-[var(--ink-50)] px-4 py-2 text-sm leading-7 text-[var(--ink-600)]">
                  {children}
                </blockquote>
              ),
              table: ({ children }) => (
                <div className="my-5 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm text-[var(--ink-600)]">{children}</table>
                </div>
              ),
              th: ({ children }) => <th className="border border-[var(--ink-200)] bg-[var(--ink-50)] px-3 py-2 font-semibold text-[var(--ink-900)]">{children}</th>,
              td: ({ children }) => <td className="border border-[var(--ink-200)] px-3 py-2 align-top">{children}</td>,
              a: ({ href, children }) => {
                const resolvedHref = resolveLegalMarkdownHref(href, routeLocale);
                const external = Boolean(resolvedHref?.startsWith("http") || resolvedHref?.startsWith("mailto:"));
                return (
                  <a
                    href={resolvedHref}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noopener noreferrer" : undefined}
                    className="font-medium text-[var(--ink-900)] underline-offset-2 hover:underline"
                  >
                    {children}
                  </a>
                );
              },
              strong: ({ children }) => <strong className="font-semibold text-[var(--ink-900)]">{children}</strong>,
              code: ({ children }) => (
                <code className="rounded bg-[var(--ink-50)] px-1.5 py-0.5 text-xs text-[var(--ink-900)]">{children}</code>
              ),
            }}
          >
            {document.content}
          </ReactMarkdown>
        </article>
      </section>
    </main>
  );
}

function LegalNavLink({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-lg border px-3 py-2 text-sm font-medium ${
        active
          ? "border-[var(--ink-900)] bg-[var(--ink-900)] text-white"
          : "border-[var(--ink-200)] bg-[var(--ink-50)] text-[var(--ink-600)] hover:text-[var(--ink-900)]"
      }`}
    >
      {label}
    </Link>
  );
}
