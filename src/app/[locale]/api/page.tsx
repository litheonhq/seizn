import type { Metadata } from "next";
import Link from "next/link";
import { LandingNav } from "@/components/shared/site-nav";
import type { Locale } from "@/i18n/config";
import { SECURITY_POLICY, formatDays } from "@/lib/policy";
import {
  formatTrack2Price,
  formatTrack2Quota,
  formatTrack2Rate,
  formatTrack2Scopes,
} from "@/lib/billing/track2-display";
import { V9_TRACK2_PRODUCTS, type V9Track2Tier } from "@/lib/billing/v9-products";

const apiKeyRotationWindow = formatDays(SECURITY_POLICY.API_KEY_ROTATION_DAYS);
const TRACK2_DOC_TIERS = ["free", "indie", "pro", "studio", "studio_managed", "enterprise"] as const satisfies readonly V9Track2Tier[];

type PageParams = { params: Promise<{ locale: Locale }> };

const apiTitle = "Seizn API & MCP - Plug canon recall into Claude, Cursor, Cline";
const apiDescription =
  "Plug Seizn canon into your AI tool. REST API + MCP server for fiction writers - recall, conflict checks, timeline, and graph powered by your existing keys.";

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale } = await params;

  return {
    title: apiTitle,
    description: apiDescription,
    alternates: {
      canonical: `/${locale}/api`,
    },
    openGraph: {
      title: apiTitle,
      description:
        "REST API + MCP server for fiction writers. Plug your canon into Claude Desktop, Claude Code, Cursor, Cline, Continue.",
      type: "website",
      url: `https://www.seizn.com/${locale}/api`,
    },
  };
}

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
        <QuickStartWsl />
        <Troubleshooting />
        <RestReference />
        <SdkExamples />
        <Security />
        <Pricing locale={locale} />
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
    <pre
      tabIndex={0}
      className="mt-3 overflow-x-auto rounded-md border border-szn-border-subtle bg-szn-surface p-4 text-[12.5px] leading-relaxed text-szn-text-1"
    >
      <code>{children}</code>
    </pre>
  );
}

function Hero() {
  const freeQuota = formatTrack2Quota("free");

  return (
    <header>
      <p className="text-xs uppercase tracking-[0.18em] text-szn-text-2">Seizn API + MCP</p>
      <h1 className="mt-3 font-serif text-4xl leading-tight text-szn-text-1 sm:text-5xl">
        Plug Seizn canon into your AI tool.
      </h1>
      <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-szn-accent/30 bg-szn-accent/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-szn-accent">
        <span className="h-1.5 w-1.5 rounded-full bg-szn-accent" /> Live in production · 2026-05-06
      </div>
      <p className="mt-4 max-w-2xl text-base text-szn-text-2">
        A REST API and an MCP server for fiction writers. Recall the canonical state of any character or world fact, run conflict checks against new passages, and explore timeline + graph from inside Claude Desktop, Claude Code, Cursor, Cline, and Continue. Bring your own LLM key, or use Studio Managed.
      </p>
      <p className="mt-3 text-sm text-szn-text-2">
        Base URL: <code className="rounded bg-szn-surface px-1 py-0.5">https://seizn.com/api/v1</code> · Versioned via <code className="rounded bg-szn-surface px-1 py-0.5">Seizn-Api-Version: 1.0</code>
      </p>
      <p className="mt-3 max-w-2xl rounded-md border border-szn-border-subtle bg-szn-surface px-3 py-2 text-[13px] leading-relaxed text-szn-text-2">
        <span className="text-szn-text-1">Already on Claude Pro / Max, Cursor Pro, or ChatGPT Plus?</span> The <code>recall</code>, <code>remember</code>, <code>graph</code>, and <code>search</code> tools work on the Free tier ({freeQuota}) with no extra LLM key — your host AI handles chat, Seizn handles canon. Only <code>check</code> and <code>timeline</code> need a separate LLM key (BYOK) or Studio Managed.
      </p>
      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <Link href="/dashboard/account/api-keys" className="szn-btn-glass px-4 py-2">
          Get a Free API key
        </Link>
        <a href="/openapi.yaml" className="szn-btn-glass px-4 py-2">
          Download OpenAPI spec
        </a>
        <a href="https://www.npmjs.com/package/@seizn/author-mcp-server" target="_blank" rel="noopener noreferrer" className="szn-btn-glass px-4 py-2">
          npm: @seizn/author-mcp-server
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
  const baseConfig = `{
  "mcpServers": {
    "seizn": {
      "command": "npx",
      "args": ["-y", "@seizn/author-mcp-server"],
      "env": {
        "SEIZN_API_KEY": "sk_seizn_..."
      }
    }
  }
}`;

  return (
    <section>
      <SectionHeading id="claude-desktop" title="Quick start — Claude Desktop" />
      <p className="mt-3 text-sm text-szn-text-2">
        The same JSON shape works on every OS. Only the config file location differs. Pick yours below, paste, restart Claude Desktop.
      </p>

      <h3 className="mt-6 font-serif text-lg">Config file location</h3>
      <ul className="mt-2 space-y-2 text-sm text-szn-text-2">
        <li>
          <span className="text-szn-text-1">macOS:</span> <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>
        </li>
        <li>
          <span className="text-szn-text-1">Windows:</span> <code>%APPDATA%\\Claude\\claude_desktop_config.json</code>
        </li>
        <li>
          <span className="text-szn-text-1">Linux:</span> <code>~/.config/Claude/claude_desktop_config.json</code> <span className="text-szn-text-2">(community / unofficial builds — Anthropic ships official binaries for macOS + Windows only)</span>
        </li>
      </ul>

      <h3 className="mt-6 font-serif text-lg">Config (paste-ready)</h3>
      <Code>{baseConfig}</Code>
      <p className="mt-3 text-sm text-szn-text-2">
        Restart Claude Desktop. The Seizn tools (<code>recall</code>, <code>remember</code>, <code>graph</code>, <code>search</code>, <code>check</code>, <code>timeline</code>) appear in the sidebar — Claude decides when to call them based on the conversation. You don&apos;t have to invoke them by name.
      </p>

      <h3 className="mt-6 font-serif text-lg">No <code>npx</code> on your PATH? Use the absolute Node path</h3>
      <p className="mt-2 text-sm text-szn-text-2">
        Claude Desktop launches MCP servers from a minimal shell — sometimes <code>npx</code> isn&apos;t on the PATH it sees. Replace <code>command</code> with the absolute path:
      </p>
      <ul className="mt-2 space-y-1 text-sm text-szn-text-2">
        <li><span className="text-szn-text-1">macOS (nvm):</span> <code>~/.nvm/versions/node/v20.x.y/bin/npx</code> — find via <code>which npx</code></li>
        <li><span className="text-szn-text-1">macOS (Homebrew):</span> <code>/opt/homebrew/bin/npx</code> (Apple Silicon) or <code>/usr/local/bin/npx</code> (Intel)</li>
        <li><span className="text-szn-text-1">Windows:</span> <code>C:\\Program Files\\nodejs\\npx.cmd</code></li>
      </ul>
    </section>
  );
}

function QuickStartWsl() {
  return (
    <section>
      <SectionHeading id="wsl" title="Quick start — WSL (Windows Subsystem for Linux)" />
      <p className="mt-3 text-sm text-szn-text-2">
        WSL is just Linux as far as the MCP server cares — Node ≥20 + <code>npx</code> works the same. The only friction is when a Windows-side AI client (Claude Desktop, Cursor) needs to reach into WSL. Three patterns:
      </p>

      <h3 className="mt-6 font-serif text-lg">Pattern A — WSL Claude Code (most natural)</h3>
      <p className="mt-2 text-sm text-szn-text-2">
        Install Claude Code <em>inside</em> WSL Ubuntu. Then everything stays on the Linux side:
      </p>
      <Code>{`# Inside WSL
SEIZN_API_KEY=sk_seizn_... claude mcp add seizn \\
  --command "npx" \\
  --arg "-y" --arg "@seizn/author-mcp-server" \\
  --env SEIZN_API_KEY=$SEIZN_API_KEY`}</Code>

      <h3 className="mt-6 font-serif text-lg">Pattern B — VS Code with WSL Remote (Cline / Continue)</h3>
      <p className="mt-2 text-sm text-szn-text-2">
        VS Code attached to WSL via the Remote-WSL extension runs every extension command inside WSL. Use the standard MCP JSON; the <code>npx</code> resolves to the WSL Node:
      </p>
      <Code>{`{
  "name": "seizn",
  "command": "npx",
  "args": ["-y", "@seizn/author-mcp-server"],
  "env": { "SEIZN_API_KEY": "sk_seizn_..." }
}`}</Code>

      <h3 className="mt-6 font-serif text-lg">Pattern C — Windows Claude Desktop spawning WSL</h3>
      <p className="mt-2 text-sm text-szn-text-2">
        If you want to keep using Windows-native Claude Desktop but the Seizn server should run on the WSL side, wrap it with <code>wsl.exe</code>:
      </p>
      <Code>{`{
  "mcpServers": {
    "seizn": {
      "command": "wsl.exe",
      "args": [
        "-e", "bash", "-lc",
        "SEIZN_API_KEY=sk_seizn_... npx -y @seizn/author-mcp-server"
      ]
    }
  }
}`}</Code>
      <p className="mt-3 text-sm text-szn-text-2">
        Pattern C crosses the Windows ↔ WSL boundary on every stdio frame; if you see occasional <em>tool call timed out</em> errors, switch to Pattern A. Pattern B is the most common in practice for fiction writers using VS Code.
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

function Troubleshooting() {
  const freeQuota = formatTrack2Quota("free");
  const indieQuota = formatTrack2Quota("indie");
  const proQuota = formatTrack2Quota("pro");
  const studioQuota = formatTrack2Quota("studio");

  return (
    <section>
      <SectionHeading id="troubleshooting" title="Troubleshooting" />
      <dl className="mt-4 space-y-5 text-sm text-szn-text-2">
        <div>
          <dt className="text-szn-text-1">My MCP client says <em>&quot;tool seizn_author_recall not found&quot;</em>.</dt>
          <dd className="mt-1 text-szn-text-2">
            The MCP server didn&apos;t finish handshaking. Check: (1) <code>SEIZN_API_KEY</code> env var is actually set inside the spawned process — Claude Desktop&apos;s shell does <em>not</em> source <code>~/.zshrc</code>, so <code>export</code>-only keys won&apos;t reach it. Put the key in the JSON <code>env</code> block. (2) <code>npx</code> is on the PATH — see the absolute-path workaround above.
          </dd>
        </div>
        <div>
          <dt className="text-szn-text-1">401 invalid_api_key — even though I just created the key.</dt>
          <dd className="mt-1 text-szn-text-2">
            Confirm the key actually starts with <code>sk_seizn_</code> (Seizn keys, not <code>sk-ant-</code> Anthropic keys). The dashboard shows the secret <em>once</em> at create time; if you closed the modal without copying, click <em>Rotate</em> to issue a new one. The old prefix immediately stops working.
          </dd>
        </div>
        <div>
          <dt className="text-szn-text-1">429 rate_limited &middot; <code>Retry-After</code> header.</dt>
          <dd className="mt-1 text-szn-text-2">
            You hit the per-minute rate limit (Free: 30/min, Indie/Pro: 60/min, Studio+: 600/min). Wait the seconds shown in <code>Retry-After</code> and retry. The MCP server propagates this as a tool error message to your host AI; Claude / GPT will usually wait and retry on its own.
          </dd>
        </div>
        <div>
          <dt className="text-szn-text-1">402 quota_exceeded — monthly quota hit.</dt>
          <dd className="mt-1 text-szn-text-2">
            Free is {freeQuota}, Indie is {indieQuota}, Pro is {proQuota}, Studio+ is {studioQuota}. Upgrade in <Link className="underline" href="/dashboard/account/api-keys">/dashboard/account/api-keys</Link> or wait for the period reset (UTC midnight for daily, UTC first-of-month for monthly).
          </dd>
        </div>
        <div>
          <dt className="text-szn-text-1">402 precondition_required — &quot;Add X-LLM-Provider and X-LLM-Key&quot;.</dt>
          <dd className="mt-1 text-szn-text-2">
            You called <code>check</code> or <code>timeline</code> without BYOK headers. These two endpoints run real LLM inference on Seizn&apos;s side, so you either supply your own LLM key (<code>X-LLM-Provider: anthropic</code> + <code>X-LLM-Key: sk-ant-…</code>) or upgrade to Studio Managed.
          </dd>
        </div>
        <div>
          <dt className="text-szn-text-1">503 feature_disabled.</dt>
          <dd className="mt-1 text-szn-text-2">
            The Track 2 surface is gated behind <code>TRACK_2_API_ENABLED</code>. Production has it on; if you&apos;re seeing 503 you&apos;re probably hitting a custom deployment with the flag off. Contact <a className="underline" href="mailto:support@seizn.com">support@seizn.com</a>.
          </dd>
        </div>
        <div>
          <dt className="text-szn-text-1">WSL: <code>npx: command not found</code> when Claude Desktop spawns me.</dt>
          <dd className="mt-1 text-szn-text-2">
            Pattern C from the WSL section uses <code>wsl.exe -e bash -lc &quot;…&quot;</code> — the <code>-l</code> (login shell) flag is required so <code>nvm</code> / <code>fnm</code> / <code>asdf</code> sources the Node version. Without it, the spawned shell has no Node on its PATH.
          </dd>
        </div>
        <div>
          <dt className="text-szn-text-1">Tool calls hang or time out (5+ seconds, no response).</dt>
          <dd className="mt-1 text-szn-text-2">
            Most often a stdio buffering issue. If you&apos;re on Pattern C (Windows Claude Desktop ↔ WSL), switch to Pattern A or B. If you&apos;re on Cline / Continue with VS Code WSL Remote, restart the VS Code window once after first install. If on Claude Desktop directly: quit and relaunch — it does not hot-reload MCP server config.
          </dd>
        </div>
      </dl>
      <p className="mt-6 text-sm text-szn-text-2">
        Still stuck? File at <a className="underline" href="https://github.com/litheonhq/seizn/issues" target="_blank" rel="noopener noreferrer">github.com/litheonhq/seizn/issues</a> with the <code>X-Request-Id</code> from the failing response and your client / OS combo.
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
        <li>Rotate keys every {apiKeyRotationWindow}, or whenever a teammate leaves. Use the Rotate button in <Link className="underline" href="/dashboard/account/api-keys">/dashboard/account/api-keys</Link>; the old key is revoked at the moment the new one is issued.</li>
        <li>If a key is exposed publicly: revoke it immediately, then review the audit log to confirm no abuse occurred.</li>
        <li>For BYOK Anthropic keys, create a dedicated key with a cost cap on the Anthropic dashboard — don&apos;t reuse your main account key.</li>
        <li>Track 2 keys are rate-limited per minute and quota-limited per month. Treat HTTP 429 / 402 as expected; back off + retry on 429, surface 402 to the user.</li>
      </ul>
    </section>
  );
}

function Pricing({ locale }: { locale: Locale }) {
  return (
    <section>
      <SectionHeading id="pricing" title="Pricing (Track 2 - API + MCP only)" />
      <p className="mt-3 text-sm text-szn-text-2">
        Track 2 covers the public REST + MCP channel and is billed in USD. Web app plans (Track 1) and Program plans (Track 3) stay separate, so checkout and legal consent for API + MCP plans happen on the API + MCP tab of the pricing page. BYOK is the default; Studio Managed is the tier that runs LLMs on Seizn infrastructure, with a metered overage on Opus calls.
      </p>
      <div className="mt-4 overflow-x-auto rounded-md border border-szn-border-subtle">
        <table className="w-full text-left text-sm">
          <thead className="bg-szn-surface text-xs text-szn-text-2">
            <tr>
              <th className="px-3 py-2">Tier</th>
              <th className="px-3 py-2">Charter price</th>
              <th className="px-3 py-2">Quota</th>
              <th className="px-3 py-2">Rate</th>
              <th className="px-3 py-2">Scopes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-szn-border-subtle">
            {TRACK2_DOC_TIERS.map((tier) => (
              <tr key={tier} className="text-szn-text-1">
                <td className="px-3 py-2 font-medium">{V9_TRACK2_PRODUCTS[tier].label}</td>
                <td className="px-3 py-2 text-xs">{formatTrack2Price(tier)}</td>
                <td className="px-3 py-2 text-xs">{formatTrack2Quota(tier)}</td>
                <td className="px-3 py-2 text-xs">{formatTrack2Rate(tier)}</td>
                <td className="px-3 py-2 font-mono text-[11px]">{formatTrack2Scopes(tier)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-5 flex flex-wrap gap-3 text-sm">
        <Link href={`/${locale}/pricing#track-2`} className="szn-btn-glass px-4 py-2">
          Choose an API · MCP plan
        </Link>
        <Link href="/dashboard/account/api-keys" className="szn-btn-glass px-4 py-2">
          Get a Free API key
        </Link>
      </div>
    </section>
  );
}
