import type { Metadata } from "next";
import Link from "next/link";
import { LandingNav } from "@/components/shared/site-nav";
import type { Locale } from "@/i18n/config";

export const metadata: Metadata = {
  title: "Seizn API & MCP — Plug canon recall into Claude, Cursor, Cline",
  description:
    "Plug Seizn canon into your AI tool. REST API + MCP server for fiction writers — recall, conflict checks, timeline, and graph powered by your existing keys.",
  openGraph: {
    title: "Seizn API & MCP — Plug canon recall into Claude, Cursor, Cline",
    description:
      "REST API + MCP server for fiction writers. Plug your canon into Claude Desktop, Claude Code, Cursor, Cline, Continue.",
    type: "website",
  },
};

type PageParams = { params: Promise<{ locale: Locale }> };

export default async function PublicApiDocsPage({ params }: PageParams) {
  const { locale } = await params;
  return (
    <main className="min-h-screen bg-szn-bg text-szn-text-1">
      <LandingNav locale={locale} />
      <div className="mx-auto max-w-4xl px-6 py-16">
        <Hero />
        <Why />
        <QuickStartClaudeDesktop />
        <QuickStartClaudeCode />
        <QuickStartCursorClineContinue />
        <RestReference />
        <SdkExamples />
        <Security />
        <Pricing />
      </div>
    </main>
  );
}

function SectionHeading({ id, title }: { id: string; title: string }) {
  return (
    <h2 id={id} className="mt-16 font-serif text-2xl text-szn-text-1">
      {title}
    </h2>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-md border border-szn-border-subtle bg-szn-surface p-4 text-[12.5px] leading-relaxed text-szn-text-1">
      <code>{children}</code>
    </pre>
  );
}

function Hero() {
  return (
    <header>
      <p className="text-xs uppercase tracking-[0.18em] text-szn-text-2">Seizn API + MCP</p>
      <h1 className="mt-3 font-serif text-4xl leading-tight text-szn-text-1 sm:text-5xl">
        Plug Seizn canon into your AI tool.
      </h1>
      <p className="mt-4 max-w-2xl text-base text-szn-text-2">
        A REST API and an MCP server for fiction writers. Recall the canonical state of any character or world fact, run conflict checks against new passages, and explore timeline + graph from inside Claude Desktop, Claude Code, Cursor, Cline, and Continue. Bring your own LLM key, or use Studio Managed.
      </p>
      <p className="mt-3 text-sm text-szn-text-2">
        Base URL: <code className="rounded bg-szn-surface px-1 py-0.5">https://seizn.com/api/v1</code> · Versioned via <code className="rounded bg-szn-surface px-1 py-0.5">Seizn-Api-Version: 1.0</code>
      </p>
      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <Link href="/dashboard/account/api-keys" className="szn-btn-glass px-4 py-2">
          Get an API key
        </Link>
        <a href="/openapi.yaml" className="szn-btn-glass px-4 py-2">
          Download OpenAPI spec
        </a>
      </div>
    </header>
  );
}

function Why() {
  return (
    <section>
      <SectionHeading id="why" title="Why Seizn" />
      <p className="mt-3 text-sm text-szn-text-2">
        Long-form fiction breaks LLM context windows. Authors keep canon in scattered Obsidian vaults, Scrivener notes, and Notion pages — and have to re-paste it every session. Seizn keeps the canon as graph + timeline you can query from any AI tool, with conflict checks before you publish.
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-6 text-sm text-szn-text-2">
        <li>
          <span className="text-szn-text-1">Canon, not vector soup.</span> Approved facts are typed entities (character, location, object, event, rule, promise) with provenance — not anonymous embeddings.
        </li>
        <li>
          <span className="text-szn-text-1">No lock-in.</span> BYOK for any LLM (Anthropic, OpenAI, your own). Studio Managed is a convenience, not a requirement.
        </li>
        <li>
          <span className="text-szn-text-1">Differentiation vs. Pensiv / Novelcrafter:</span> machine-readable graph + REST + MCP, not just an editor. Plug into the tools you already use.
        </li>
      </ul>
    </section>
  );
}

function QuickStartClaudeDesktop() {
  return (
    <section>
      <SectionHeading id="claude-desktop" title="Quick start — Claude Desktop" />
      <p className="mt-3 text-sm text-szn-text-2">
        Add the Seizn MCP server to Claude Desktop&apos;s config (<code>~/Library/Application Support/Claude/claude_desktop_config.json</code> on macOS, <code>%APPDATA%\\Claude\\claude_desktop_config.json</code> on Windows):
      </p>
      <Code>{`{
  "mcpServers": {
    "seizn": {
      "command": "npx",
      "args": ["-y", "@seizn/author-mcp-server"],
      "env": {
        "SEIZN_API_KEY": "sk_seizn_..."
      }
    }
  }
}`}</Code>
      <p className="mt-3 text-sm text-szn-text-2">
        Restart Claude Desktop. The Seizn tools (recall, check, timeline, graph) appear in the sidebar.
      </p>
    </section>
  );
}

function QuickStartClaudeCode() {
  return (
    <section>
      <SectionHeading id="claude-code" title="Quick start — Claude Code" />
      <p className="mt-3 text-sm text-szn-text-2">
        Register the MCP server with the Claude Code CLI:
      </p>
      <Code>{`SEIZN_API_KEY=sk_seizn_... \\
  claude mcp add seizn \\
    --command "npx" \\
    --arg "-y" --arg "@seizn/author-mcp-server" \\
    --env SEIZN_API_KEY=$SEIZN_API_KEY`}</Code>
      <p className="mt-3 text-sm text-szn-text-2">
        Then ask Claude Code: <em>&ldquo;Recall everything we know about the protagonist before this chapter.&rdquo;</em>
      </p>
    </section>
  );
}

function QuickStartCursorClineContinue() {
  return (
    <section>
      <SectionHeading id="cursor-cline-continue" title="Quick start — Cursor / Cline / Continue" />
      <p className="mt-3 text-sm text-szn-text-2">
        Cursor, Cline, and Continue all read MCP servers from the same config shape. In Cursor settings → MCP, add:
      </p>
      <Code>{`{
  "name": "seizn",
  "command": "npx",
  "args": ["-y", "@seizn/author-mcp-server"],
  "env": { "SEIZN_API_KEY": "sk_seizn_..." }
}`}</Code>
      <p className="mt-3 text-sm text-szn-text-2">
        Cline + Continue accept the same JSON in their respective MCP settings panels. The MCP server speaks JSON-RPC over stdio, so any compliant client works without further configuration.
      </p>
    </section>
  );
}

function RestReference() {
  const endpoints: Array<{ method: string; path: string; cost: number; scope: string; notes?: string }> = [
    { method: "GET", path: "/api/v1/projects", cost: 0, scope: "projects:read" },
    { method: "POST", path: "/api/v1/projects", cost: 1, scope: "projects:write" },
    { method: "GET", path: "/api/v1/projects/{id}/recall?q=...", cost: 1, scope: "recall" },
    { method: "GET", path: "/api/v1/projects/{id}/recall/{entityId}/mentions", cost: 1, scope: "recall" },
    { method: "POST", path: "/api/v1/projects/{id}/conflicts/check", cost: 5, scope: "check", notes: "BYOK required" },
    { method: "POST", path: "/api/v1/projects/{id}/canon/{entityId}/approve", cost: 1, scope: "remember" },
    { method: "GET", path: "/api/v1/projects/{id}/search?q=...&limit=...", cost: 2, scope: "search" },
    { method: "GET", path: "/api/v1/projects/{id}/timeline?from=...&to=...", cost: 5, scope: "timeline", notes: "BYOK required" },
    { method: "GET", path: "/api/v1/projects/{id}/graph?root=...", cost: 1, scope: "graph" },
    { method: "GET", path: "/api/v1/usage", cost: 0, scope: "(any)" },
  ];

  return (
    <section>
      <SectionHeading id="rest" title="REST API reference" />
      <p className="mt-3 text-sm text-szn-text-2">
        Authenticate every request with <code>Authorization: Bearer sk_seizn_…</code>. Each response includes <code>X-Request-Id</code> and <code>Seizn-Api-Version: 1.0</code>. Errors are returned as <code>application/problem+json</code> per RFC 7807.
      </p>
      <div className="mt-4 overflow-x-auto rounded-md border border-szn-border-subtle">
        <table className="w-full text-left text-sm">
          <thead className="bg-szn-surface text-xs text-szn-text-2">
            <tr>
              <th className="px-3 py-2">Method</th>
              <th className="px-3 py-2">Path</th>
              <th className="px-3 py-2">Cost</th>
              <th className="px-3 py-2">Scope</th>
              <th className="px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-szn-border-subtle">
            {endpoints.map((endpoint) => (
              <tr key={`${endpoint.method}-${endpoint.path}`} className="text-szn-text-1">
                <td className="px-3 py-2 font-mono text-xs">{endpoint.method}</td>
                <td className="px-3 py-2 font-mono text-xs">{endpoint.path}</td>
                <td className="px-3 py-2 text-xs">{endpoint.cost}</td>
                <td className="px-3 py-2 font-mono text-xs">{endpoint.scope}</td>
                <td className="px-3 py-2 text-xs text-szn-text-2">{endpoint.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-6 font-serif text-lg">Recall — curl</h3>
      <Code>{`curl https://seizn.com/api/v1/projects/saebyeok-main/recall?q=protagonist \\
  -H "Authorization: Bearer sk_seizn_..."
# 200 OK
# X-Request-Id: req_...
# Content-Type: application/json
# {
#   "entities": [
#     { "id": "saebyeok-entity-primary", "type": "character", ... }
#   ]
# }`}</Code>

      <h3 className="mt-6 font-serif text-lg">Conflicts check — curl (BYOK)</h3>
      <Code>{`curl -X POST https://seizn.com/api/v1/projects/saebyeok-main/conflicts/check \\
  -H "Authorization: Bearer sk_seizn_..." \\
  -H "Content-Type: application/json" \\
  -H "X-LLM-Provider: anthropic" \\
  -H "X-LLM-Key: sk-ant-..." \\
  -d '{"text":"In chapter 12, the protagonist returns home..."}'`}</Code>

      <h3 className="mt-6 font-serif text-lg">Error shape (RFC 7807)</h3>
      <Code>{`HTTP/1.1 402 Payment Required
Content-Type: application/problem+json
{
  "type": "https://seizn.com/errors/quota-exceeded",
  "title": "Quota exceeded",
  "status": 402,
  "code": "quota_exceeded",
  "detail": "API key sk_seizn_a1b2 reached 1000 calls this month. Upgrade or wait for reset.",
  "instance": "/api/v1/projects/saebyeok-main/recall"
}`}</Code>
    </section>
  );
}

function SdkExamples() {
  return (
    <section>
      <SectionHeading id="sdk" title="SDK examples" />

      <h3 className="mt-4 font-serif text-lg">TypeScript (fetch)</h3>
      <Code>{`type RecallEntity = {
  id: string;
  type: 'character' | 'location' | 'object' | 'event' | 'rule' | 'promise';
  canonicalName: string;
};

async function recall(projectId: string, query: string) {
  const url = new URL(\`https://seizn.com/api/v1/projects/\${projectId}/recall\`);
  url.searchParams.set('q', query);
  const res = await fetch(url, {
    headers: { Authorization: \`Bearer \${process.env.SEIZN_API_KEY!}\` },
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  const body = (await res.json()) as { entities: RecallEntity[] };
  return body.entities;
}`}</Code>

      <h3 className="mt-6 font-serif text-lg">Python (requests)</h3>
      <Code>{`import os
import requests

def recall(project_id: str, query: str) -> list[dict]:
    res = requests.get(
        f"https://seizn.com/api/v1/projects/{project_id}/recall",
        headers={"Authorization": f"Bearer {os.environ['SEIZN_API_KEY']}"},
        params={"q": query},
        timeout=30,
    )
    res.raise_for_status()
    return res.json()["entities"]`}</Code>
    </section>
  );
}

function Security() {
  return (
    <section>
      <SectionHeading id="security" title="Security best practices" />
      <ul className="mt-4 list-disc space-y-2 pl-6 text-sm text-szn-text-2">
        <li>Never commit API keys to git. Add <code>.env*</code> to <code>.gitignore</code> and turn on GitHub secret scanning for the repo.</li>
        <li>Store keys in your platform&apos;s secret manager — Vercel, Netlify, Fly, AWS Secrets Manager. Inject as env vars at runtime.</li>
        <li>Rotate keys every 90 days, or whenever a teammate leaves. Use the Rotate button in <Link className="underline" href="/dashboard/account/api-keys">/dashboard/account/api-keys</Link>; the old key is revoked at the moment the new one is issued.</li>
        <li>If a key is exposed publicly: revoke it immediately, then review the audit log to confirm no abuse occurred.</li>
        <li>For BYOK Anthropic keys, create a dedicated key with a cost cap on the Anthropic dashboard — don&apos;t reuse your main account key.</li>
        <li>Track 2 keys are rate-limited per minute and quota-limited per month. Treat HTTP 429 / 402 as expected; back off + retry on 429, surface 402 to the user.</li>
      </ul>
    </section>
  );
}

function Pricing() {
  const tiers: Array<{ name: string; monthly: string; quota: string; rate: string; scopes: string }> = [
    { name: "Free", monthly: "$0", quota: "100 calls / day", rate: "30 / min", scopes: "recall, remember, graph, search" },
    { name: "Indie", monthly: "$9", quota: "1,000 / month", rate: "60 / min", scopes: "+ check, timeline (BYOK)" },
    { name: "Pro", monthly: "$19", quota: "10,000 / month", rate: "60 / min", scopes: "+ projects:write" },
    { name: "Studio", monthly: "$99", quota: "100,000 / month", rate: "600 / min", scopes: "+ audit:read, 5 keys / user" },
    { name: "Studio Managed", monthly: "$299", quota: "100,000 + 500 Opus calls / month", rate: "600 / min", scopes: "+ managed_llm, $0.15 / Opus call overage" },
    { name: "Enterprise", monthly: "Contact us", quota: "Custom", rate: "Custom", scopes: "All + custom scopes" },
  ];

  return (
    <section>
      <SectionHeading id="pricing" title="Pricing (Track 2 — API + MCP only)" />
      <p className="mt-3 text-sm text-szn-text-2">
        Track 2 (this page) covers the public REST + MCP channel and is billed in USD. The web app (Track 1, KRW) and the desktop app (Track 3, KRW) have their own separate plans — billing is split across subscriptions on a single Stripe customer. BYOK is the default; Studio Managed is the only tier that runs LLMs on our infrastructure (with a metered overage on Opus calls).
      </p>
      <div className="mt-4 overflow-x-auto rounded-md border border-szn-border-subtle">
        <table className="w-full text-left text-sm">
          <thead className="bg-szn-surface text-xs text-szn-text-2">
            <tr>
              <th className="px-3 py-2">Tier</th>
              <th className="px-3 py-2">Price (USD)</th>
              <th className="px-3 py-2">Quota</th>
              <th className="px-3 py-2">Rate</th>
              <th className="px-3 py-2">Scopes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-szn-border-subtle">
            {tiers.map((tier) => (
              <tr key={tier.name} className="text-szn-text-1">
                <td className="px-3 py-2 font-medium">{tier.name}</td>
                <td className="px-3 py-2 text-xs">{tier.monthly}</td>
                <td className="px-3 py-2 text-xs">{tier.quota}</td>
                <td className="px-3 py-2 text-xs">{tier.rate}</td>
                <td className="px-3 py-2 text-xs">{tier.scopes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-szn-text-2">
        v8 launched 2026-05-06. Existing v7 Track 2 subscribers are grandfathered for 90 days; see <code>docs/billing/v7-deprecation-notice.md</code> for the customer comms.
      </p>
    </section>
  );
}
