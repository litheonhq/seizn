# @seizn/cli

Command-line interface for [Seizn](https://www.seizn.com) — save, search, and
export AI memories from your terminal.

## Install

```bash
npm install -g @seizn/cli
# or one-shot
npx @seizn/cli save "memory content"
```

## Setup

```bash
export SEIZN_API_KEY=szn_xxxxxxxxxx   # get one at https://www.seizn.com/dashboard/api-keys
```

Optional overrides:

```bash
export SEIZN_BASE_URL=https://www.seizn.com   # default
```

## Usage

### `seizn save <content>`

```bash
seizn save "Met Alice at Stripe today, she's working on Atlas onboarding"
seizn save "Q3 OKR: launch dual-surface" --tags work,seizn
seizn save "..." --auto-score             # Haiku assigns 1-10 importance
seizn save "..." --no-dedup               # disable similarity dedup
seizn save "..." --agent-id backstage --scope project-x
```

### `seizn search <query>`

```bash
seizn search "Stripe Atlas onboarding"
seizn search "..." --mode vector --limit 5
seizn search "..." --json                 # raw JSON output
```

### `seizn export`

```bash
seizn export                              # JSON to stdout
seizn export --format ndjson > backup.ndjson
seizn export --agent-id backstage --scope project-x
```

## Multi-agent

Each agent can keep its own memory pool with `--agent-id` and `--scope`. The
same options work in `@seizn/sdk-js` and `@seizn/mcp`.

## License

MIT — see [LICENSE](./LICENSE).
