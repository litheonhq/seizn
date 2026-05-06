/**
 * Track 2 (Public REST API + MCP, USD) pricing section.
 *
 * Track 2 launched 2026-05-06. Sits below the Track 1 plans on /pricing as a
 * separate "if you want to plug Seizn into your own AI tool" section.
 *
 * Tier identifiers / USD prices / scope codes are universal — only the prose
 * around them localises. Copy lives in `pricing-track2-copy.ts`; this component
 * picks the right one based on the page locale and falls back to EN for the 17
 * secondary locales.
 */

import Link from "next/link";
import { getTrack2PricingCopy } from "./pricing-track2-copy";

type Track2TierKey = "free" | "indie" | "pro" | "studio" | "studioManaged" | "enterprise";

type Track2Tier = {
  id: string;
  copyKey: Track2TierKey;
  name: string;
  price: string;
  yearly?: string;
  quota: string;
  rate: string;
  scopesAdded: string;
  cta: { href: string };
  highlight?: boolean;
  contactCta?: boolean;
};

const TIERS: Track2Tier[] = [
  {
    id: "free",
    copyKey: "free",
    name: "Free",
    price: "$0",
    quota: "100 / day",
    rate: "30 / min",
    scopesAdded: "recall · remember · graph · search",
    cta: { href: "/dashboard/account/api-keys" },
    highlight: true,
  },
  {
    id: "indie",
    copyKey: "indie",
    name: "Indie",
    price: "$9 / mo",
    yearly: "$90 / yr",
    quota: "1,000 / month",
    rate: "60 / min",
    scopesAdded: "+ check · timeline (BYOK)",
    cta: { href: "/dashboard/account/api-keys" },
  },
  {
    id: "pro",
    copyKey: "pro",
    name: "Pro",
    price: "$19 / mo",
    yearly: "$190 / yr",
    quota: "10,000 / month",
    rate: "60 / min",
    scopesAdded: "+ projects:write",
    cta: { href: "/dashboard/account/api-keys" },
  },
  {
    id: "studio",
    copyKey: "studio",
    name: "Studio",
    price: "$99 / mo",
    yearly: "$990 / yr",
    quota: "100,000 / month",
    rate: "600 / min",
    scopesAdded: "+ audit:read · 5 keys / user",
    cta: { href: "/dashboard/account/api-keys" },
  },
  {
    id: "studio-managed",
    copyKey: "studioManaged",
    name: "Studio Managed",
    price: "$299 / mo",
    yearly: "$2,990 / yr",
    quota: "100,000 + 500 Opus / mo",
    rate: "600 / min",
    scopesAdded: "+ managed_llm",
    cta: { href: "/dashboard/account/api-keys" },
  },
  {
    id: "enterprise",
    copyKey: "enterprise",
    name: "Enterprise",
    price: "Contact",
    quota: "Custom",
    rate: "Custom",
    scopesAdded: "All + custom scopes",
    cta: { href: "mailto:sales@seizn.com" },
    contactCta: true,
  },
];

export function PricingTrack2Section({ locale }: { locale: string }) {
  const copy = getTrack2PricingCopy(locale);
  return (
    <section id="api-mcp" className="mt-24 border-t border-szn-border-subtle pt-16">
      <header className="mx-auto max-w-3xl text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-szn-text-2">{copy.eyebrow}</p>
        <h2 className="mt-3 font-serif text-3xl text-szn-text-1 sm:text-4xl">{copy.title}</h2>
        <p className="mt-4 text-base text-szn-text-2">{copy.subtitle}</p>
        <p className="mx-auto mt-3 max-w-2xl rounded-md border border-szn-border-subtle bg-szn-surface px-3 py-2 text-[13px] leading-relaxed text-szn-text-2">
          <span className="text-szn-text-1">{copy.hostLlmCallout.head}</span>{" "}
          {copy.hostLlmCallout.body}
        </p>
      </header>

      <div className="mx-auto mt-12 grid max-w-6xl gap-4 px-4 sm:grid-cols-2 lg:grid-cols-3">
        {TIERS.map((tier) => {
          const tierCopy = copy.tiers[tier.copyKey];
          return (
            <div
              key={tier.id}
              className={`flex flex-col rounded-2xl border bg-szn-bg p-6 ${tier.highlight ? "border-szn-accent shadow-md" : "border-szn-border-subtle"}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-serif text-xl text-szn-text-1">{tier.name}</h3>
                  <p className="mt-1 text-2xl font-semibold text-szn-text-1">{tier.price}</p>
                  {tier.yearly ? <p className="text-xs text-szn-text-2">{tier.yearly}</p> : null}
                </div>
                {tier.highlight ? (
                  <span className="rounded-full border border-szn-accent/30 bg-szn-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-szn-accent">
                    {copy.badges.startHere}
                  </span>
                ) : null}
              </div>
              <dl className="mt-5 space-y-2 text-[13px] text-szn-text-2">
                <div className="flex justify-between gap-4">
                  <dt className="text-szn-text-2">{copy.table.quota}</dt>
                  <dd className="text-right text-szn-text-1">{tier.quota}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-szn-text-2">{copy.table.rate}</dt>
                  <dd className="text-right text-szn-text-1">{tier.rate}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-szn-text-2">{copy.table.scopes}</dt>
                  <dd className="text-right font-mono text-[11.5px] text-szn-text-1">{tier.scopesAdded}</dd>
                </div>
              </dl>
              <p className="mt-4 text-[12.5px] leading-relaxed text-szn-text-2">{tierCopy.notes}</p>
              <div className="mt-6 flex-1" />
              {tier.contactCta ? (
                <a href={tier.cta.href} className="szn-btn-glass mt-2 w-full text-center text-sm">
                  {tierCopy.cta}
                </a>
              ) : (
                <Link href={tier.cta.href} className="szn-btn-glass mt-2 w-full text-center text-sm">
                  {tierCopy.cta}
                </Link>
              )}
            </div>
          );
        })}
      </div>

      <div className="mx-auto mt-10 max-w-3xl text-center text-[12.5px] text-szn-text-2">
        {copy.footnote.body}{" "}
        <Link href={`/${locale}/api`} className="underline">
          {copy.footnote.apiDocs}
        </Link>{" "}
        ·{" "}
        <a href="/openapi.yaml" className="underline">
          {copy.footnote.openApi}
        </a>{" "}
        ·{" "}
        <a href="https://www.npmjs.com/package/@seizn/author-mcp-server" target="_blank" rel="noopener noreferrer" className="underline">
          {copy.footnote.npm}
        </a>
      </div>
    </section>
  );
}
