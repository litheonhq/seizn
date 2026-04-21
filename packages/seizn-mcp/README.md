# @seizn/mcp

Seizn MCP server for Claude Code, Claude Desktop, Cursor, and Codex. It exposes NPC memory, Canon Lock, replay, chaos, and Story Health tools over stdio.

## Install

```bash
npx -y @seizn/mcp
```

Set `SEIZN_API_KEY` in the process environment before starting the server. The server reads `SEIZN_API_KEY` and optional `SEIZN_API_URL` from environment variables only; it never accepts API keys through command arguments or tool arguments.

```bash
export SEIZN_API_KEY=szn_live_xxx
npx -y @seizn/mcp
```

## Tools

- `seizn.memory.search(query, npc_id?)`
- `seizn.memory.create(npc_id, content, metadata?)`
- `seizn.canon.list(npc_id?)`
- `seizn.canon.check(npc_id?, proposed_content)`
- `seizn.replay.fetch(session_id)`
- `seizn.chaos.run(npc_id, suite)`
- `seizn.story_health.current(act?)`

## Claude Desktop

```json
{
  "mcpServers": {
    "seizn": {
      "command": "npx",
      "args": ["-y", "@seizn/mcp"],
      "env": {
        "SEIZN_API_KEY": "szn_live_xxx"
      }
    }
  }
}
```

## Claude Code

```bash
export SEIZN_API_KEY=szn_live_xxx
claude mcp add seizn -- npx -y @seizn/mcp
```

## Cursor

```json
{
  "mcpServers": {
    "seizn": {
      "command": "npx",
      "args": ["-y", "@seizn/mcp"],
      "env": {
        "SEIZN_API_KEY": "szn_live_xxx"
      }
    }
  }
}
```

## Codex CLI

```toml
[mcp_servers.seizn]
command = "npx"
args = ["-y", "@seizn/mcp"]

[mcp_servers.seizn.env]
SEIZN_API_KEY = "szn_live_xxx"
```

## Canon check example

```json
{
  "tool": "seizn.canon.check",
  "arguments": {
    "npc_id": "archivist_vale",
    "proposed_content": "Vale reveals the sealed city password."
  }
}
```

The tool returns the API verdict JSON, including `ok`, `verdict`, and any matching Canon Lock.
