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
    <main className="min-h-screen bg-szn-bg text-szn-text-1">
      <section className="border-b border-szn-border bg-szn-card">
        <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
          <Link href={`/${routeLocale}`} className="text-sm font-medium text-szn-accent hover:underline">
            {copy.backHome}
          </Link>
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-szn-accent">{copy.eyebrow}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">{document.title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-szn-text-2">{copy.subtitle}</p>
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
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {copy.draftNotice}
        </div>
        <article className="rounded-lg border border-szn-border bg-white p-6 shadow-sm md:p-8">
          <ReactMarkdown
            components={{
              h1: ({ children }) => <h2 className="mb-4 text-2xl font-semibold text-szn-text-1">{children}</h2>,
              h2: ({ children }) => <h3 className="mb-3 mt-8 text-xl font-semibold text-szn-text-1">{children}</h3>,
              h3: ({ children }) => <h4 className="mb-2 mt-6 text-base font-semibold text-szn-text-1">{children}</h4>,
              p: ({ children }) => <p className="my-4 text-sm leading-7 text-szn-text-2">{children}</p>,
              ul: ({ children }) => <ul className="my-4 list-disc space-y-2 pl-6 text-sm leading-7 text-szn-text-2">{children}</ul>,
              ol: ({ children }) => <ol className="my-4 list-decimal space-y-2 pl-6 text-sm leading-7 text-szn-text-2">{children}</ol>,
              li: ({ children }) => <li>{children}</li>,
              blockquote: ({ children }) => (
                <blockquote className="my-5 border-l-4 border-szn-accent bg-szn-surface px-4 py-2 text-sm leading-7 text-szn-text-2">
                  {children}
                </blockquote>
              ),
              table: ({ children }) => (
                <div className="my-5 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm text-szn-text-2">{children}</table>
                </div>
              ),
              th: ({ children }) => <th className="border border-szn-border bg-szn-surface px-3 py-2 font-semibold text-szn-text-1">{children}</th>,
              td: ({ children }) => <td className="border border-szn-border px-3 py-2 align-top">{children}</td>,
              a: ({ href, children }) => {
                const resolvedHref = resolveLegalMarkdownHref(href, routeLocale);
                const external = Boolean(resolvedHref?.startsWith("http") || resolvedHref?.startsWith("mailto:"));
                return (
                  <a
                    href={resolvedHref}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noopener noreferrer" : undefined}
                    className="font-medium text-szn-accent underline-offset-2 hover:underline"
                  >
                    {children}
                  </a>
                );
              },
              strong: ({ children }) => <strong className="font-semibold text-szn-text-1">{children}</strong>,
              code: ({ children }) => (
                <code className="rounded bg-szn-surface px-1.5 py-0.5 text-xs text-szn-text-1">{children}</code>
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
          ? "border-szn-accent bg-szn-accent text-white"
          : "border-szn-border bg-szn-bg text-szn-text-2 hover:text-szn-text-1"
      }`}
    >
      {label}
    </Link>
  );
}
