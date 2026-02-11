# Seizn - AI Memory Server

## Project Overview

- **Name**: Seizn (시즌) — "Seize your memories"
- **Domain**: seizn.com
- **Description**: mem0-style AI memory SaaS
- **Stack**: Next.js 15, TypeScript, Tailwind CSS, Neon (PostgreSQL + pgvector), Upstash Redis, NextAuth.js, Claude Haiku/Sonnet, Voyage AI
- **Locales**: ko, en, ja

## Development

```bash
npm run dev      # Dev server
npm run build    # Production build
npm run lint     # ESLint
```

## Project Structure

```
src/
├── app/              # Next.js App Router
│   ├── api/          # API Routes
│   ├── (auth)/       # Auth pages
│   ├── (dashboard)/  # Dashboard
│   └── (marketing)/  # Landing/marketing
├── components/       # React components
│   ├── ui/           # Base UI
│   └── features/     # Feature components
├── lib/              # Utilities
├── hooks/            # Custom hooks
├── types/            # TypeScript types
└── styles/           # Global styles
```

## API v1

- **Dedup**: Auto dedup on POST (similarity > 0.95), disable with `dedup: false`
- **Auto score**: `auto_score: true` for Haiku-based 1-10 importance scoring
- **Multi-agent**: `agent_id`, `scope` params for agent-scoped memory
- **Webhooks**: `memory.created`, `memory.updated`, `memory.deleted` events
- **Versioning**: Auto-preserves previous versions on content change
- **Stream**: SSE at `/api/v1/memories/stream`

## MCP Fallback

If Seizn MCP server is not loaded:

```bash
# Save memory
curl -X POST https://www.seizn.com/api/v1/memories \
  -H "Authorization: Bearer $SEIZN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"content":"...", "tags":["tag1"]}'

# Search memory
curl "https://www.seizn.com/api/v1/memories?query=...&mode=hybrid" \
  -H "Authorization: Bearer $SEIZN_API_KEY"
```

## Tech Stack Docs

- Location: `.github/TECH_STACK.md`
- Update after any tech changes (new libs, API routes, architecture)
- Regenerate: `gh workflow run claude-audit.yml -f depth="strategic"`

## CI/CD Workflows (GitHub Actions, Self-hosted Runner)

Central repo `iruhana/claude-workflows@v1`. All workflows are manual trigger (workflow_dispatch).
Provider: `claude` (default) or `codex` (add `-f provider="codex"`).

### Code Improvement (claude-improve.yml)

Seizn-specific presets first. Default: `mcp-protocol`.

| Preset | Description | Model |
|--------|-------------|-------|
| `mcp-protocol` | MCP SDK spec compliance, tool/resource handlers, JSON-RPC | **opus** |
| `memory-graph` | Memory CRUD, knowledge graph integrity, search relevance | **opus** |
| `ai-context` | session_init project detection, 8 AI tool config sync | sonnet |
| `security` | XSS, CSRF, injection, secret exposure audit | **opus** |
| `code-quality` | DRY, naming, types, pattern consistency | sonnet |
| `performance` | N+1 queries, memo, dynamic imports, caching | **opus** |
| `dead-code` / `tech-debt` / `deps-update` / `accessibility` / `seo` | General | auto |

```bash
# Default (MCP protocol audit)
gh workflow run claude-improve.yml

# Specific preset
gh workflow run claude-improve.yml -f task_type="memory-graph"

# Custom task + scope
gh workflow run claude-improve.yml -f task_type="custom" -f task="Refactor webhook delivery retry logic" -f scope="src/app/api/webhooks"

# Force model + web search
gh workflow run claude-improve.yml -f task_type="security" -f model="opus" -f use_web_search="true"
```

### Other Workflows

```bash
# PR code review
gh workflow run claude-review.yml -f pr_number="5"

# Auto-fix build errors (3-round escalation)
gh workflow run auto-fix.yml -f pr_number="5"

# Issue → implementation → PR
gh workflow run issue-to-code.yml -f issue_number="3"

# Tech stack docs
gh workflow run claude-audit.yml -f depth="strategic"

# Continuous improvement
gh workflow run claude-continuous.yml
gh workflow run claude-continuous.yml -f tasks="mcp-protocol,security" -f max_cycles=3

# Stop continuous run
gh run cancel $(gh run list -w claude-continuous.yml -L 1 --json databaseId -q '.[0].databaseId')
```

### Auto-merge

Low-risk presets (`dead-code`, `seo`, `accessibility`, `code-quality`, `ai-context`, `deps-update`) auto squash merge on build pass.

## Rules

- Never commit `.env.local` or secrets
- Update `.github/TECH_STACK.md` after tech changes
- Build must pass: `npm run build`
