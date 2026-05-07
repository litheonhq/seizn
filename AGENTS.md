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

## CI/CD Workflows (GitHub Actions)

`claude-audit.yml` is repo-local and Litheon-only. It runs deterministic npm audit gates; the `provider` input is kept only for CLI compatibility and does not call an external AI workflow.
The other `claude-*`, `auto-fix`, and `issue-to-code` workflow files are compatibility wrappers around the same repo-local audit workflow. They do not create code changes, comments, issues, or commits by themselves.

### Deterministic Audit Wrappers

These preserve old CLI entry points while keeping execution inside `litheonhq/seizn`.

```bash
# Default deterministic gate
gh workflow run claude-improve.yml

# Security preset runs strategic checks
gh workflow run claude-improve.yml -f task_type="security"

# Custom task and scope are recorded for operator context only
gh workflow run claude-improve.yml -f task_type="custom" -f task="Refactor webhook delivery retry logic" -f scope="src/app/api/webhooks"

# Provider/model/search inputs are compatibility-only
gh workflow run claude-improve.yml -f task_type="security" -f model="opus" -f use_web_search="true"
```

### Other Workflows

```bash
# PR review readiness gate
gh workflow run claude-review.yml -f pr_number="5"

# Auto-fix compatibility gate; does not mutate code
gh workflow run auto-fix.yml -f pr_number="5"

# Issue implementation readiness gate; does not mutate code
gh workflow run issue-to-code.yml -f issue_number="3"

# Tech stack docs
gh workflow run claude-audit.yml -f depth="strategic"

# Continuous compatibility gate; runs one deterministic pass
gh workflow run claude-continuous.yml
gh workflow run claude-continuous.yml -f tasks="mcp-protocol,security" -f max_cycles=3

# Stop a running compatibility gate
gh run cancel $(gh run list -w claude-continuous.yml -L 1 --json databaseId -q '.[0].databaseId')

# AI Research compatibility gate; does not create issues
gh workflow run claude-research.yml -f focus="all"
gh workflow run claude-research.yml -f focus="security-advisories"
gh workflow run claude-research.yml -f focus="papers"
```

### Merge Policy

These compatibility wrappers never merge changes. Land code through the normal Litheon review and commit path after green gates.

## Rules

- Never commit `.env.local` or secrets
- Update `.github/TECH_STACK.md` after tech changes
- Build must pass: `npm run build`

## Seizn DB Migration Guardrail (E2E Encryption)

For Seizn DB changes, use this exact flow:

1. Apply migrations with:
   - `node scripts/run-migration-file.mjs <path-to-sql>`
2. After any DB change, run:
   - `npm run verify:e2e-encryption-db`

### Important behavior

- `run-migration-file.mjs` automatically runs `verify:e2e-encryption-db` after migration apply.
- If overload/RPC regression is detected (for example, missing `is_encrypted` filters), verification fails with exit code `1`, and the migration command is treated as failed.
- Emergency bypass exists:
  - `SKIP_E2E_VERIFY=1`
  - Use only for intentional/manual exception cases.

### Scope limitation

- This automatic hook applies only when Seizn migrations are applied through `run-migration-file.mjs`.
- If SQL is applied directly in Supabase Dashboard, the hook does not run.
- In Dashboard/manual apply cases, run `npm run verify:e2e-encryption-db` once manually.

## 14) 100 Percent Execution Mode (꼼꼼 완성 규칙)
Use this mode when the user asks for "끝까지", "100%", "완료될 때까지", or equivalent.

### 14.1 Definition of done (must satisfy all)
- Feature is implemented end-to-end in user-facing flow (no partial wiring).
- Type safety passes: `npm run typecheck`.
- Lint passes: `npm run lint`.
- Relevant unit/integration tests pass (targeted for touched logic).
- Relevant E2E parity scenario passes (new or updated Playwright test).
- No known blocker remains undocumented.
- Tracking docs are updated:
  - `docs/editor-100-issue-map.md`
  - `docs/editor-100-execution-log.md`
  - add/update sign-off doc (e.g., `docs/editor-pX-YY-signoff.md`)
- Changes are committed and pushed when user asks to persist/publish.

### 14.2 Mandatory execution loop
1. Analyze exact gap against acceptance criteria (not just code presence).
2. Implement smallest complete slice that closes a user-visible gap.
3. Run validation gates (typecheck/lint/unit/e2e).
4. If any failure occurs, fix root cause and re-run from step 3.
5. Repeat until all gates are green.
6. Update docs/sign-off with evidence and commands.
7. Commit with a scoped message and push.

### 14.3 Quality gates by change type
- UI/editor behavior change:
  - `npm run typecheck`
  - `npm run lint`
  - targeted Jest tests
  - targeted Playwright grep for changed scenario
- Command/extension wiring:
  - command map tests + wiring matrix tests
  - E2E command execution scenario
- Export/parity changes:
  - API route tests
  - E2E parity scenario

### 14.4 Anti-partial rule
- "90% done" is not acceptable in this mode.
- If backend dependency blocks full completion, ship a robust local-safe fallback and document the limit explicitly in sign-off.
- Every residual risk must be written under "Known limits" with concrete follow-up action.

### 14.5 Reporting format for each completion
- What changed (user-visible first)
- Validation commands and pass/fail status
- Commit hash and push status
- Updated documentation paths

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
