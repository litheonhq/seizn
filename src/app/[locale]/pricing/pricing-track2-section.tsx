/**
 * Track 2 (Public REST API + MCP, USD) pricing section.
 *
 * Track 2 launched 2026-05-06 on EN-primary persona. The Track 1 (web/KRW)
 * pricing copy lives in `pricing-copy.ts` per locale; this Track 2 surface is
 * EN-only by design — it sits below the Track 1 plans on /pricing as a
 * separate "if you want to plug Seizn into your own AI tool" section.
 *
 * Pure server-renderable: no client state, no hooks. Drop into the existing
 * pricing client just before <Faq />.
 */

import Link from "next/link";

type Track2Tier = {
  id: string;
  name: string;
  price: string;
  yearly?: string;
  quota: string;
  rate: string;
  scopesAdded: string;
  notes: string;
  cta: { label: string; href: string };
  highlight?: boolean;
};

const TIERS: Track2Tier[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    quota: "100 calls / day",
    rate: "30 / min",
    scopesAdded: "recall · remember · graph · search",
    notes: "No LLM key needed. Works on Claude Desktop / Code / Cursor / Cline / Continue out of the box.",
    cta: { label: "Get a Free key", href: "/dashboard/account/api-keys" },
    highlight: true,
  },
  {
    id: "indie",
    name: "Indie",
    price: "$9 / mo",
    yearly: "$90 / yr",
    quota: "1,000 calls / month",
    rate: "60 / min",
    scopesAdded: "+ check · timeline (BYOK)",
    notes: "Adds AI-enhanced conflict checks and timeline beats. BYOK any provider.",
    cta: { label: "Choose Indie", href: "/dashboard/account/api-keys" },
  },
  {
    id: "pro",
    name: "Pro",
    price: "$19 / mo",
    yearly: "$190 / yr",
    quota: "10,000 calls / month",
    rate: "60 / min",
    scopesAdded: "+ projects:write",
    notes: "Multi-project workflows, project-level writes, BYOK required for AI tools.",
    cta: { label: "Choose Pro", href: "/dashboard/account/api-keys" },
  },
  {
    id: "studio",
    name: "Studio",
    price: "$99 / mo",
    yearly: "$990 / yr",
    quota: "100,000 calls / month",
    rate: "600 / min",
    scopesAdded: "+ audit:read · 5 keys / user",
    notes: "Studio teams: shared canon, audit log access, multi-key rotation. BYOK required.",
    cta: { label: "Choose Studio", href: "/dashboard/account/api-keys" },
  },
  {
    id: "studio-managed",
    name: "Studio Managed",
    price: "$299 / mo",
    yearly: "$2,990 / yr",
    quota: "100,000 + 500 Opus calls / month",
    rate: "600 / min",
    scopesAdded: "+ managed_llm",
    notes: "We host the LLM. Includes 500 Opus calls; $0.15 / call metered overage. No BYOK setup.",
    cta: { label: "Choose Studio Managed", href: "/dashboard/account/api-keys" },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Contact",
    quota: "Custom",
    rate: "Custom",
    scopesAdded: "All + custom scopes",
    notes: "SOC 2 / SSO / VPC, custom quotas, audit log streaming, named CSM.",
    cta: { label: "Talk to sales", href: "mailto:sales@seizn.com" },
  },
];

export function PricingTrack2Section() {
  return (
    <section id="api-mcp" className="mt-24 border-t border-szn-border-subtle pt-16">
      <header className="mx-auto max-w-3xl text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-szn-text-2">
          Track 2 — API + MCP · USD · Live since 2026-05-06
        </p>
        <h2 className="mt-3 font-serif text-3xl text-szn-text-1 sm:text-4xl">
          Plug Seizn into your own AI tool.
        </h2>
        <p className="mt-4 text-base text-szn-text-2">
          REST API + MCP server for fiction writers. Recall canon, run conflict checks, explore timeline + graph from inside Claude Desktop, Claude Code, Cursor, Cline, Continue, and (when MCP support lands) ChatGPT.
        </p>
        <p className="mx-auto mt-3 max-w-2xl rounded-md border border-szn-border-subtle bg-szn-surface px-3 py-2 text-[13px] leading-relaxed text-szn-text-2">
          <span className="text-szn-text-1">Already on Claude Pro / Max, Cursor Pro, or ChatGPT Plus?</span> The four read tools (recall, remember, graph, search) work on the Free tier with no extra LLM key — your host AI handles chat, Seizn handles canon. Only <code>check</code> and <code>timeline</code> need a separate Anthropic / OpenAI key (BYOK) or Studio Managed.
        </p>
      </header>

      <div className="mx-auto mt-12 grid max-w-6xl gap-4 px-4 sm:grid-cols-2 lg:grid-cols-3">
        {TIERS.map((tier) => (
          <div
            key={tier.id}
            className={`flex flex-col rounded-2xl border bg-szn-bg p-6 ${tier.highlight ? "border-szn-accent shadow-md" : "border-szn-border-subtle"}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-serif text-xl text-szn-text-1">{tier.name}</h3>
                <p className="mt-1 text-2xl font-semibold text-szn-text-1">{tier.price}</p>
                {tier.yearly ? (
                  <p className="text-xs text-szn-text-2">{tier.yearly}</p>
                ) : null}
              </div>
              {tier.highlight ? (
                <span className="rounded-full border border-szn-accent/30 bg-szn-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-szn-accent">
                  Start here
                </span>
              ) : null}
            </div>
            <dl className="mt-5 space-y-2 text-[13px] text-szn-text-2">
              <div className="flex justify-between gap-4">
                <dt className="text-szn-text-2">Quota</dt>
                <dd className="text-right text-szn-text-1">{tier.quota}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-szn-text-2">Rate</dt>
                <dd className="text-right text-szn-text-1">{tier.rate}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-szn-text-2">Scopes</dt>
                <dd className="text-right font-mono text-[11.5px] text-szn-text-1">{tier.scopesAdded}</dd>
              </div>
            </dl>
            <p className="mt-4 text-[12.5px] leading-relaxed text-szn-text-2">{tier.notes}</p>
            <div className="mt-6 flex-1" />
            {tier.cta.href.startsWith("mailto:") ? (
              <a href={tier.cta.href} className="szn-btn-glass mt-2 w-full text-center text-sm">
                {tier.cta.label}
              </a>
            ) : (
              <Link href={tier.cta.href} className="szn-btn-glass mt-2 w-full text-center text-sm">
                {tier.cta.label}
              </Link>
            )}
          </div>
        ))}
      </div>

      <div className="mx-auto mt-10 max-w-3xl text-center text-[12.5px] text-szn-text-2">
        Track 2 (API + MCP) is billed in USD on a separate Stripe subscription from the Track 1 web plans above. Host-LLM cost (Claude / GPT chat subscription) is always separate — Seizn doesn&apos;t double-charge.{" "}
        <Link href="/api" className="underline">
          Read the API docs
        </Link>{" "}
        ·{" "}
        <a href="/openapi.yaml" className="underline">
          OpenAPI spec
        </a>{" "}
        ·{" "}
        <a href="https://www.npmjs.com/package/@seizn/author-mcp-server" target="_blank" rel="noopener noreferrer" className="underline">
          npm
        </a>
      </div>
    </section>
  );
}
