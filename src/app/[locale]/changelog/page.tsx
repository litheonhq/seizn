import type { Metadata } from "next";
import Link from "next/link";
import { LandingNav } from "@/components/shared/site-nav";
import type { Locale } from "@/i18n/config";
import {
  formatTrack2Price,
  formatTrack2Quota,
} from "@/lib/billing/track2-display";

export const metadata: Metadata = {
  title: "Changelog — Seizn",
  description: "What's new in Seizn — product launches, API changes, pricing updates, and design refreshes.",
  openGraph: {
    title: "Changelog — Seizn",
    description: "What's new in Seizn — product launches, API changes, pricing updates, and design refreshes.",
    type: "website",
  },
};

type PageParams = { params: Promise<{ locale: Locale }> };

type ChangelogEntry = {
  date: string;
  slug: string;
  tag: "launch" | "feature" | "fix" | "design" | "policy";
  title: string;
  body: () => React.ReactNode;
};

const ENTRIES: ChangelogEntry[] = [
  {
    date: "2026-05-06",
    slug: "track-2-api-mcp-launch",
    tag: "launch",
    title: "Seizn API + MCP server are live",
    body: () => {
      const freeQuota = formatTrack2Quota("free");
      const indiePrice = formatTrack2Price("indie");
      const proPrice = formatTrack2Price("pro");
      const studioPrice = formatTrack2Price("studio");
      const studioManagedPrice = formatTrack2Price("studio_managed");

      return (
      <div className="space-y-4 text-szn-text-2">
        <p>
          Two surfaces went live in production today: a public REST API at <code>https://seizn.com/api/v1/*</code> and an MCP server published as <a className="underline" href="https://www.npmjs.com/package/@seizn/author-mcp-server" target="_blank" rel="noopener noreferrer"><code>@seizn/author-mcp-server</code></a>. Both let any AI agent — Claude Desktop, Claude Code, Cursor, Cline, Continue, and (when its MCP support lands) ChatGPT — read and write Seizn canon for fiction writers.
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <span className="text-szn-text-1">10 REST endpoints</span> — projects, recall, mentions, conflict check, canon approve, search, timeline, graph, usage. Bearer auth, scope-checked, per-minute rate-limited, monthly quota, idempotency cache (Upstash-backed), cursor pagination, CORS, RFC 7807 errors.
          </li>
          <li>
            <span className="text-szn-text-1">6 MCP tools</span> — <code>seizn_author_recall</code>, <code>_remember</code>, <code>_search</code>, <code>_graph</code>, <code>_check</code>, <code>_timeline</code>. Drop-in for any MCP-compliant client over stdio.
          </li>
          <li>
            <span className="text-szn-text-1">Free tier ({freeQuota})</span> covers <code>recall</code> / <code>remember</code> / <code>graph</code> / <code>search</code> with no extra LLM key. If you already pay for Claude Pro / Max or Cursor Pro, the host AI handles chat — Seizn just supplies the canon. <code>check</code> + <code>timeline</code> use BYOK (Anthropic / OpenAI key) or the Studio Managed plan.
          </li>
          <li>
            <span className="text-szn-text-1">Dashboard</span> — issue / rotate / revoke API keys at <Link className="underline" href="/dashboard/account/api-keys">/dashboard/account/api-keys</Link>, with a filterable + CSV-exportable audit log.
          </li>
          <li>
            <span className="text-szn-text-1">Stripe v9 catalog</span> — Indie {indiePrice} · Pro {proPrice} · Studio {studioPrice} · Studio Managed {studioManagedPrice} (with $0.50 per Opus call metered overage) · Enterprise (contact).
          </li>
          <li>
            <span className="text-szn-text-1">22 locale dashboard</span> — en / ko / ja / zh-hans / zh-hant base + 17 secondary locales (ar / de / es / fr / he / hi / id / it / nl / pl / pt-BR / pt-PT / ru / sv / th / uk / vi). RTL flows (ar, he) work natively; per-language guide refinement caught real UI bugs (cancel/revoke collisions, calques).
          </li>
        </ul>
        <p className="rounded-md border border-szn-border-subtle bg-szn-surface px-3 py-2 text-[13px] text-szn-text-2">
          <span className="text-szn-text-1">Try it now:</span> <Link className="underline" href="/dashboard/account/api-keys">issue a Free API key</Link>, then read the <Link className="underline" href="/api">API quick-start</Link> or the <a className="underline" href="/openapi.yaml">OpenAPI spec</a>.
        </p>
      </div>
      );
    },
  },
];

const TAG_STYLE: Record<ChangelogEntry["tag"], string> = {
  launch: "border-szn-accent/30 bg-szn-accent/10 text-szn-accent",
  feature: "border-szn-text-2/30 bg-szn-surface text-szn-text-1",
  fix: "border-szn-text-2/30 bg-szn-surface text-szn-text-1",
  design: "border-szn-text-2/30 bg-szn-surface text-szn-text-1",
  policy: "border-szn-text-2/30 bg-szn-surface text-szn-text-1",
};

export default async function ChangelogPage({ params }: PageParams) {
  const { locale } = await params;
  return (
    <main className="min-h-screen bg-szn-bg text-szn-text-1">
      <LandingNav locale={locale} />
      <div className="mx-auto max-w-3xl px-6 py-16">
        <header>
          <p className="text-xs uppercase tracking-[0.18em] text-szn-text-2">Changelog</p>
          <h1 className="mt-3 font-serif text-4xl leading-tight text-szn-text-1 sm:text-5xl">What&apos;s new in Seizn</h1>
          <p className="mt-3 max-w-xl text-sm text-szn-text-2">
            Product launches, API changes, pricing updates, and design refreshes. Subscribe via the
            {" "}
            <a className="underline" href="https://github.com/litheonhq/seizn/releases.atom">GitHub releases feed</a>
            {" "}
            for new entries.
          </p>
        </header>

        <ol className="mt-12 space-y-16">
          {ENTRIES.map((entry) => (
            <li key={entry.slug} id={entry.slug} className="relative pl-6 sm:pl-0">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] ${TAG_STYLE[entry.tag]}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" /> {entry.tag}
                </span>
                <time dateTime={entry.date} className="text-sm text-szn-text-2">
                  {entry.date}
                </time>
              </div>
              <h2 className="mt-3 font-serif text-2xl text-szn-text-1">
                <Link href={`#${entry.slug}`} className="hover:underline">{entry.title}</Link>
              </h2>
              <div className="mt-4 text-[14.5px] leading-relaxed">{entry.body()}</div>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
