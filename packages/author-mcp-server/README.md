# @seizn/author-mcp-server

MCP server exposing **Seizn Author** canon recall, conflict check, semantic search, timeline, and relationship graph tools to any MCP-compatible AI agent (Claude Desktop, Claude Code, Cursor, Cline, Continue, Zed, etc.).

> Bring Seizn canon into the AI tool you already use. No new editor required.

## What it does

When connected, your AI agent gains six tools:

| Tool | Purpose |
|---|---|
| `seizn_author_recall` | Get canon for a named entity (character, place, object, rule, event, promise) — returns last 3 mentions, current state, pending conflicts |
| `seizn_author_check` | Check a passage of prose for canon conflicts (P1 critical / P2 warning / P3 stylistic) |
| `seizn_author_remember` | Approve a fact as canon (writer-confirmed source of truth) |
| `seizn_author_search` | Semantic search across all project entities |
| `seizn_author_timeline` | Chapter-by-chapter beats, optional range filter |
| `seizn_author_graph` | Relationship graph subset rooted at an entity |

All tools call the [Seizn Author REST API](https://seizn.com/api) (`/api/v1/*`) with your Bearer token.

## Setup

### 1. Get a Seizn API key

Generate one at <https://seizn.com/dashboard/account/api-keys> (Free tier: 100 calls/day, BYOK required).

### 2. Install (npm)

```bash
npm install -g @seizn/author-mcp-server
```

Or use `npx`:

```bash
npx @seizn/author-mcp-server
```

### 3. Wire into your MCP client

#### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "seizn-author": {
      "command": "npx",
      "args": ["-y", "@seizn/author-mcp-server"],
      "env": {
        "SEIZN_API_KEY": "sk_seizn_..."
      }
    }
  }
}
```

#### Claude Code

```bash
claude mcp add seizn-author -e SEIZN_API_KEY=sk_seizn_... -- npx -y @seizn/author-mcp-server
```

#### Cursor / Cline / Continue

See your client's MCP server documentation. The package supports:
- **stdio** (default for desktop clients)
- **streamable-http** (for hosted scenarios)
- **SSE** (legacy)

## Configuration

| Env var | Default | Description |
|---|---|---|
| `SEIZN_API_KEY` | (required) | Bearer token from `seizn.com/dashboard/account/api-keys` |
| `SEIZN_API_BASE_URL` | `https://seizn.com/api/v1` | Override for staging or self-hosted |

## Usage examples

In your AI chat:

> 'Recall everything Seizn knows about Seoyun in project ch7-draft.'
> → invokes `seizn_author_recall` with name=Seoyun

> 'Check this scene for canon conflicts: ...'
> → invokes `seizn_author_check` with the pasted text

> 'Show me the timeline from Ch.5 to Ch.7.'
> → invokes `seizn_author_timeline` with from=ch5, to=ch7

The AI decides when to call each tool based on the conversation. You don't have to remember tool names.

## Pricing

| Plan | Quota | Price |
|---|---|---|
| Free | 100 recall calls/day | $0 |
| Indie | 1,000 calls/month | $9/month |
| Pro | 10,000 calls/month | $19/month |
| Studio | 100,000 calls/month + 5 API keys per user | $99/month |
| Studio Managed (Q3+) | + 500 managed Opus calls/month | $299/month |
| Enterprise | Volume + SOC 2 + SSO | Custom |

**Track 2 plan covers Track 2 surface (API + MCP) only.** Seizn Author has separate plans for the web dashboard (Track 1, KRW) and the Tauri desktop app (Track 3, KRW). One Stripe customer holds multiple subscriptions, billed independently. See <https://seizn.com/pricing> for cross-track upsell details.

**No subscription required for AI inference.** Tools split into two groups:

| Tool | Backend LLM | Needs BYOK? |
|---|---|---|
| `seizn_author_recall` / `_remember` / `_graph` / `_search` | ❌ DB only | ❌ Works on Free, no key needed |
| `seizn_author_check` / `_timeline` | ✅ Sonnet/Opus | ✅ BYOK or Studio Managed |

The Seizn subscription covers the canon backend and recall infrastructure. The two AI-enhanced tools (`check`, `timeline`) require either your own LLM key (BYOK, any tier) or Studio Managed ($299/mo) which includes 500 Opus calls.

**Your host AI agent's LLM is separate.** Whether you use Claude Pro/Max subscription via Claude Code/Desktop, Cursor Pro, or BYOK in Cline/Continue — the host handles its own LLM cost. Seizn doesn't double-charge.

See <https://seizn.com/pricing> for full details.

## License

MIT © Litheon LLC

## Issues / contributions

<https://github.com/litheonhq/seizn/issues> (label: `track-2-platform`)
