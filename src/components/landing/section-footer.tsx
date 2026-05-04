import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { ENGINE_SURFACE_URL, type AuthorLandingCopy } from "./author-landing-copy";
import { SeiznLockup } from "./brand-marks";

export function SectionFooter({ copy, locale }: { copy: AuthorLandingCopy; locale: Locale }) {
  return (
    <footer style={{ background: "var(--ink-900)", color: "var(--ink-0)" }}>
      <div className="author-shell px-4 py-12 sm:px-6 md:py-16 lg:px-8 xl:px-0">
        <div className="grid gap-9 border-b pb-10 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]" style={{ borderColor: "oklch(1 0 0 / 0.08)" }}>
          <div>
            <Link href={`/${locale}`} className="inline-flex min-h-11 items-center">
              <SeiznLockup tone="light" />
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-6" style={{ color: "oklch(1 0 0 / 0.62)" }}>
              {copy.footer.tagline}
            </p>
          </div>
          <FooterColumn
            title={copy.footer.product}
            links={[
              { label: copy.footer.links.workflow, href: "#workflow" },
              { label: copy.footer.links.demo, href: `/${locale}/demo` },
              { label: copy.footer.links.pricing, href: "#pricing" },
              { label: copy.footer.links.docs, href: `/${locale}/docs` },
            ]}
          />
          <FooterColumn
            title={copy.footer.company}
            links={[
              { label: copy.footer.links.about, href: `/${locale}/docs` },
              { label: copy.footer.links.privacy, href: `/${locale}/legal/privacy` },
              { label: copy.footer.links.terms, href: `/${locale}/legal/terms` },
              { label: copy.footer.links.beta, href: `/${locale}/legal/beta-disclosure` },
              { label: copy.footer.links.status, href: "/status" },
              { label: copy.footer.links.contact, href: `/${locale}/docs/faq` },
            ]}
          />
          <FooterColumn
            title={copy.footer.tools}
            links={[
              { label: copy.footer.links.ledger, href: `/${locale}/demo` },
              { label: copy.footer.links.replay, href: `/${locale}/demo` },
              { label: copy.footer.links.byok, href: `/${locale}/docs/faq` },
              { label: copy.footer.links.changelog, href: `/${locale}/docs` },
            ]}
          />
          <FooterColumn
            title={copy.footer.developers}
            links={[
              { label: copy.footer.links.engine, href: ENGINE_SURFACE_URL, external: true },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <span className="author-mono text-[11px]" style={{ color: "oklch(1 0 0 / 0.46)" }}>
            {copy.footer.entity}
          </span>
          <span className="author-mono text-[11px]" style={{ color: "oklch(1 0 0 / 0.46)" }}>
            {copy.footer.version}
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; href: string; external?: boolean }>;
}) {
  return (
    <div>
      <h2 className="author-eyebrow mb-4" style={{ color: "oklch(1 0 0 / 0.52)" }}>
        {title}
      </h2>
      <ul className="grid gap-2">
        {links.map((link) => (
          <li key={`${title}-${link.label}`}>
            <a
              href={link.href}
              className="text-sm"
              style={{ color: "oklch(1 0 0 / 0.78)" }}
              {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
